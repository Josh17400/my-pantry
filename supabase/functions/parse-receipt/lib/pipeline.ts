/**
 * Receipt parse pipeline — orchestrates pure steps with injected I/O.
 *
 * Flow:
 * 1. Scan quota check (committed scans only)
 * 2. Dollar budget circuit breaker (projected spend)
 * 3. Grocery-likelihood gate (cheap vision)
 * 4. Full vision parse with strict schema (retry once on violation)
 * 5. Normalize lines (weighed, multi-buy, discount parents, allergens)
 * 6. Record attempt cost — do NOT charge scan quota until commit
 */

import {
  checkBudget,
  estimateCostUsd,
  estimateParseBudgetUsd,
  sumCosts,
} from './cost.ts';
import { decideFromFullParse, decideGroceryGate } from './grocery_gate.ts';
import { normalizeParseResult } from './normalize.ts';
import { safeLog } from './privacy.ts';
import { afterCommitCount, checkScanQuota, resolveQuotaConfig } from './quota.ts';
import type {
  AbandonSuccessResponse,
  Allergen,
  CommitSuccessResponse,
  ErrorResponse,
  FunctionResponse,
  ModelPricing,
  NonGroceryResponse,
  ParseSuccessResponse,
  QuotaConfig,
  ReceiptImageInput,
} from './types.ts';
import {
  DEFAULT_GATE_MODEL,
  DEFAULT_PRICING,
  DEFAULT_VISION_MODEL,
} from './types.ts';
import type { UsageStore } from './usage_store.ts';
import {
  FixtureVisionClient,
  ModelError,
  SchemaViolationError,
  type VisionClient,
} from './vision.ts';

export interface PipelineDeps {
  /** Required for parse; unused for commit/abandon. */
  readonly vision?: VisionClient;
  readonly usage: UsageStore;
  readonly pricing?: ModelPricing;
  readonly quota?: Partial<QuotaConfig>;
  readonly idFactory?: () => string;
  readonly now?: () => Date;
}

export interface ParsePipelineInput {
  readonly userId: string;
  readonly householdId?: string | null;
  readonly images: readonly ReceiptImageInput[];
  readonly locale?: string;
  readonly retainImage?: boolean;
  readonly knownAllergensByUpc?: Readonly<Record<string, readonly Allergen[]>>;
}

export interface CommitPipelineInput {
  readonly userId: string;
  readonly attemptId: string;
  readonly committedLineCount: number;
}

export interface AbandonPipelineInput {
  readonly userId: string;
  readonly attemptId: string;
}

function defaultId(): string {
  return crypto.randomUUID();
}

function validateImages(
  images: readonly ReceiptImageInput[],
): ErrorResponse | null {
  if (!images || images.length === 0) {
    return {
      ok: false,
      code: 'invalid_request',
      message: 'At least one receipt image is required.',
    };
  }
  if (images.length > 8) {
    return {
      ok: false,
      code: 'invalid_request',
      message: 'Maximum 8 images per receipt parse.',
    };
  }
  for (const img of images) {
    if (!img.data && !img.url) {
      return {
        ok: false,
        code: 'invalid_request',
        message: 'Each image must include data (base64) or url.',
      };
    }
  }
  return null;
}

export async function runParse(
  deps: PipelineDeps,
  input: ParsePipelineInput,
): Promise<FunctionResponse> {
  const pricing = deps.pricing ?? DEFAULT_PRICING;
  const quota = resolveQuotaConfig(deps.quota);
  const locale = input.locale?.trim() || 'en-US';
  const attemptId = (deps.idFactory ?? defaultId)();
  const householdId = input.householdId ?? null;

  const invalid = validateImages(input.images);
  if (invalid) return invalid;

  const snapshot = await deps.usage.getSnapshot(input.userId);
  const scan = checkScanQuota(snapshot, quota);
  if (!scan.allowed) {
    safeLog('info', 'scan_quota_exceeded', {
      userId: input.userId,
      attemptId,
      note: `committed=${scan.committedScans} limit=${scan.scanLimit}`,
    });
    return {
      ok: false,
      code: 'quota_exceeded',
      message: `Free tier allows ${scan.scanLimit} committed scans per month. Upgrade for more.`,
      attemptId,
      details: {
        committedScans: scan.committedScans,
        scanLimit: scan.scanLimit,
      },
    };
  }

  const projected = estimateParseBudgetUsd({
    imageCount: input.images.length,
    pricing,
    includeGate: true,
  });
  const budget = checkBudget({
    snapshot,
    config: quota,
    estimatedAdditionalUsd: projected,
  });
  if (!budget.allowed) {
    safeLog('info', 'budget_exceeded', {
      userId: input.userId,
      attemptId,
      estimatedCostUsd: projected,
      note: `spent=${budget.spentUsd} budget=${budget.budgetUsd}`,
    });
    return {
      ok: false,
      code: 'budget_exceeded',
      message:
        'Monthly receipt AI budget reached. Try again next month or upgrade.',
      attemptId,
      details: {
        spentUsd: budget.spentUsd,
        budgetUsd: budget.budgetUsd,
        projectedUsd: budget.projectedSpendUsd,
      },
    };
  }

  // Create attempt shell before paid calls so we can attach costs even on failure.
  await deps.usage.createAttempt({
    id: attemptId,
    userId: input.userId,
    householdId,
    status: 'attempted',
    estimatedCostUsd: 0,
    promptTokens: 0,
    completionTokens: 0,
    model: null,
    imageCount: input.images.length,
    locale,
  });

  let totalPrompt = 0;
  let totalCompletion = 0;
  let totalCost = 0;
  let gateModel = DEFAULT_GATE_MODEL;
  let parseModel = DEFAULT_VISION_MODEL;
  let schemaRetryUsed = false;

  const vision = deps.vision;
  if (!vision) {
    return {
      ok: false,
      code: 'internal',
      message: 'Vision client not configured.',
      attemptId,
    };
  }

  try {
    // --- Grocery gate ---
    const gate = await vision.groceryGate({
      images: input.images,
      locale,
    });
    gateModel = gate.model;
    const gateCost = estimateCostUsd(gate.usage, pricing);
    totalPrompt += gate.usage.promptTokens;
    totalCompletion += gate.usage.completionTokens;
    totalCost = sumCosts(totalCost, gateCost);

    const gateDecision = decideGroceryGate(gate.data);
    if (!gateDecision.accept) {
      await deps.usage.updateAttempt({
        id: attemptId,
        status: 'not_grocery',
        estimatedCostUsd: totalCost,
        promptTokens: totalPrompt,
        completionTokens: totalCompletion,
        model: gateModel,
      });
      safeLog('info', 'not_grocery', {
        attemptId,
        userId: input.userId,
        groceryConfidence: gateDecision.groceryConfidence,
        estimatedCostUsd: totalCost,
      });
      const resp: NonGroceryResponse = {
        ok: false,
        code: 'not_grocery',
        attemptId,
        message:
          'This does not look like a grocery receipt. Scan not charged.',
        groceryConfidence: gateDecision.groceryConfidence,
        reason: gateDecision.reason,
        estimatedCostUsd: totalCost,
        quotaCharged: false,
      };
      return resp;
    }

    // Mid-flight budget re-check before expensive parse.
    const midBudget = checkBudget({
      snapshot: {
        ...snapshot,
        spentUsd: snapshot.spentUsd + totalCost,
      },
      config: quota,
      estimatedAdditionalUsd: estimateParseBudgetUsd({
        imageCount: input.images.length,
        pricing,
        includeGate: false,
      }),
    });
    if (!midBudget.allowed) {
      await deps.usage.updateAttempt({
        id: attemptId,
        status: 'failed',
        estimatedCostUsd: totalCost,
        promptTokens: totalPrompt,
        completionTokens: totalCompletion,
        model: gateModel,
      });
      return {
        ok: false,
        code: 'budget_exceeded',
        message: 'Monthly receipt AI budget reached before full parse.',
        attemptId,
        details: {
          spentUsd: midBudget.spentUsd,
          budgetUsd: midBudget.budgetUsd,
        },
      };
    }

    // --- Full parse with one schema retry ---
    let parseResult;
    try {
      parseResult = await vision.parseReceipt({
        images: input.images,
        locale,
      });
    } catch (err) {
      if (err instanceof SchemaViolationError) {
        schemaRetryUsed = true;
        totalPrompt += err.usage.promptTokens;
        totalCompletion += err.usage.completionTokens;
        totalCost = sumCosts(totalCost, estimateCostUsd(err.usage, pricing));
        safeLog('warn', 'schema_retry', {
          attemptId,
          userId: input.userId,
          note: err.errors.slice(0, 3).join(';'),
        });
        try {
          parseResult = await vision.parseReceipt({
            images: input.images,
            locale,
          });
        } catch (err2) {
          if (err2 instanceof SchemaViolationError) {
            totalPrompt += err2.usage.promptTokens;
            totalCompletion += err2.usage.completionTokens;
            totalCost = sumCosts(
              totalCost,
              estimateCostUsd(err2.usage, pricing),
            );
            await deps.usage.updateAttempt({
              id: attemptId,
              status: 'failed',
              estimatedCostUsd: totalCost,
              promptTokens: totalPrompt,
              completionTokens: totalCompletion,
              model: err2.model,
            });
            return {
              ok: false,
              code: 'schema_violation',
              message:
                'Receipt model returned an invalid response after retry. Scan not charged.',
              attemptId,
              details: { estimatedCostUsd: totalCost },
            };
          }
          throw err2;
        }
      } else {
        throw err;
      }
    }

    parseModel = parseResult.model;
    totalPrompt += parseResult.usage.promptTokens;
    totalCompletion += parseResult.usage.completionTokens;
    totalCost = sumCosts(
      totalCost,
      estimateCostUsd(parseResult.usage, pricing),
    );

    const foodCount = parseResult.data.lines.filter(
      (l) => l.lineType === 'food',
    ).length;
    const nonFoodCount = parseResult.data.lines.filter(
      (l) => l.lineType === 'non-food',
    ).length;
    const postGate = decideFromFullParse({
      isGroceryReceipt: parseResult.data.isGroceryReceipt,
      groceryConfidence: parseResult.data.groceryConfidence,
      foodLineCount: foodCount,
      nonFoodLineCount: nonFoodCount,
    });
    if (!postGate.accept) {
      await deps.usage.updateAttempt({
        id: attemptId,
        status: 'not_grocery',
        estimatedCostUsd: totalCost,
        promptTokens: totalPrompt,
        completionTokens: totalCompletion,
        model: parseModel,
      });
      return {
        ok: false,
        code: 'not_grocery',
        attemptId,
        message:
          'This does not look like a grocery receipt. Scan not charged.',
        groceryConfidence: postGate.groceryConfidence,
        reason: postGate.reason,
        estimatedCostUsd: totalCost,
        quotaCharged: false,
      };
    }

    const foodLines = parseResult.data.lines.filter(
      (l) => l.lineType === 'food' || l.lineType === 'unknown',
    );
    if (
      foodLines.length === 0 &&
      (parseResult.data.notes ?? '').toLowerCase().includes('unreadable')
    ) {
      await deps.usage.updateAttempt({
        id: attemptId,
        status: 'failed',
        estimatedCostUsd: totalCost,
        promptTokens: totalPrompt,
        completionTokens: totalCompletion,
        model: parseModel,
      });
      return {
        ok: false,
        code: 'unreadable',
        message:
          'Receipt image was unreadable. Scan not charged. Try better lighting or a second photo.',
        attemptId,
        details: { estimatedCostUsd: totalCost },
      };
    }

    const normalized = normalizeParseResult(
      parseResult.data,
      input.knownAllergensByUpc,
    );

    await deps.usage.updateAttempt({
      id: attemptId,
      status: 'parsed',
      estimatedCostUsd: totalCost,
      promptTokens: totalPrompt,
      completionTokens: totalCompletion,
      model: parseModel,
    });

    // Privacy: never log raw lines / store address.
    safeLog('info', 'parse_ok', {
      attemptId,
      userId: input.userId,
      imageCount: input.images.length,
      lineCount: normalized.items.length,
      estimatedCostUsd: totalCost,
      model: parseModel,
      locale,
      schemaRetryUsed,
      groceryConfidence: gateDecision.groceryConfidence,
    });

    void input.retainImage; // retention is client/storage concern; we never persist bytes here

    const response: ParseSuccessResponse = {
      ok: true,
      attemptId,
      status: 'parsed',
      quotaCharged: false,
      storeName: parseResult.data.storeName,
      receiptDate: parseResult.data.receiptDate,
      currency: parseResult.data.currency,
      total: parseResult.data.total,
      items: normalized.items,
      summary: {
        model: parseModel,
        gateModel,
        promptTokens: totalPrompt,
        completionTokens: totalCompletion,
        totalTokens: totalPrompt + totalCompletion,
        estimatedCostUsd: totalCost,
        confidence: normalized.confidence,
        locale,
        imageCount: input.images.length,
        groceryConfidence: gateDecision.groceryConfidence,
        schemaRetryUsed,
      },
      warnings: normalized.warnings,
    };
    return response;
  } catch (err) {
    if (err instanceof ModelError) {
      await deps.usage.updateAttempt({
        id: attemptId,
        status: 'failed',
        estimatedCostUsd: totalCost,
        promptTokens: totalPrompt,
        completionTokens: totalCompletion,
        model: parseModel,
      });
      safeLog('error', 'model_error', {
        attemptId,
        userId: input.userId,
        note: err.message.slice(0, 120),
      });
      return {
        ok: false,
        code: 'model_error',
        message: 'Vision model failed. Scan not charged.',
        attemptId,
        details: { estimatedCostUsd: totalCost },
      };
    }
    await deps.usage.updateAttempt({
      id: attemptId,
      status: 'failed',
      estimatedCostUsd: totalCost,
      promptTokens: totalPrompt,
      completionTokens: totalCompletion,
      model: parseModel,
    });
    safeLog('error', 'internal_error', {
      attemptId,
      userId: input.userId,
      note: err instanceof Error ? err.message.slice(0, 120) : 'unknown',
    });
    return {
      ok: false,
      code: 'internal',
      message: 'Unexpected error during receipt parse.',
      attemptId,
    };
  }
}

export async function runCommit(
  deps: PipelineDeps,
  input: CommitPipelineInput,
): Promise<CommitSuccessResponse | ErrorResponse> {
  const quota = resolveQuotaConfig(deps.quota);
  const attempt = await deps.usage.getAttempt(input.attemptId);
  if (!attempt || attempt.userId !== input.userId) {
    return {
      ok: false,
      code: 'invalid_request',
      message: 'Unknown attemptId for this user.',
      attemptId: input.attemptId,
    };
  }
  if (attempt.status === 'committed') {
    const snapshot = await deps.usage.getSnapshot(input.userId);
    return {
      ok: true,
      attemptId: input.attemptId,
      status: 'committed',
      quotaCharged: true,
      committedScansThisMonth: snapshot.committedScans,
      scanLimit: quota.isPaid ? quota.paidScanLimit : quota.freeScanLimit,
    };
  }
  if (attempt.status !== 'parsed') {
    return {
      ok: false,
      code: 'invalid_request',
      message: `Cannot commit attempt in status '${attempt.status}'.`,
      attemptId: input.attemptId,
    };
  }

  // Re-check scan quota at commit time (race: two commits).
  const snapshot = await deps.usage.getSnapshot(input.userId);
  const scan = checkScanQuota(snapshot, quota);
  if (!scan.allowed) {
    return {
      ok: false,
      code: 'quota_exceeded',
      message: 'Scan limit reached before commit.',
      attemptId: input.attemptId,
      details: {
        committedScans: scan.committedScans,
        scanLimit: scan.scanLimit,
      },
    };
  }

  await deps.usage.updateAttempt({
    id: input.attemptId,
    status: 'committed',
    committedLineCount: input.committedLineCount,
  });

  safeLog('info', 'scan_committed', {
    attemptId: input.attemptId,
    userId: input.userId,
    note: `lines=${input.committedLineCount}`,
  });

  return {
    ok: true,
    attemptId: input.attemptId,
    status: 'committed',
    quotaCharged: true,
    committedScansThisMonth: afterCommitCount(snapshot),
    scanLimit: scan.scanLimit,
  };
}

export async function runAbandon(
  deps: PipelineDeps,
  input: AbandonPipelineInput,
): Promise<AbandonSuccessResponse | ErrorResponse> {
  const attempt = await deps.usage.getAttempt(input.attemptId);
  if (!attempt || attempt.userId !== input.userId) {
    return {
      ok: false,
      code: 'invalid_request',
      message: 'Unknown attemptId for this user.',
      attemptId: input.attemptId,
    };
  }
  if (attempt.status === 'committed') {
    return {
      ok: false,
      code: 'invalid_request',
      message: 'Cannot abandon a committed scan.',
      attemptId: input.attemptId,
    };
  }
  if (attempt.status !== 'abandoned') {
    await deps.usage.updateAttempt({
      id: input.attemptId,
      status: 'abandoned',
    });
  }
  safeLog('info', 'scan_abandoned', {
    attemptId: input.attemptId,
    userId: input.userId,
  });
  return {
    ok: true,
    attemptId: input.attemptId,
    status: 'abandoned',
    quotaCharged: false,
  };
}

/** Test helper: build deps with fixtures. */
export function testDeps(
  vision: FixtureVisionClient,
  usage: UsageStore,
  overrides?: Partial<PipelineDeps>,
): PipelineDeps {
  return {
    vision,
    usage,
    pricing: DEFAULT_PRICING,
    ...overrides,
  };
}
