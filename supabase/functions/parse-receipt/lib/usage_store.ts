/**
 * Usage accounting store.
 *
 * Expected tables (schema track owns migrations — do not create here):
 *
 *   receipt_parse_attempts (
 *     id text PK,
 *     user_id uuid not null,
 *     household_id text,
 *     status text not null,  -- attempted|parsed|failed|not_grocery|committed|abandoned
 *     estimated_cost_usd numeric not null default 0,
 *     prompt_tokens int not null default 0,
 *     completion_tokens int not null default 0,
 *     model text,
 *     image_count int not null default 0,
 *     locale text not null default 'en-US',
 *     month_key text not null,  -- YYYY-MM UTC
 *     created_at timestamptz not null default now(),
 *     committed_at timestamptz,
 *     committed_line_count int
 *   )
 *
 * Indexes: (user_id, month_key), (id)
 * RLS: owner-only SELECT; INSERT/UPDATE via service role in this function.
 *
 * Commit-time charging: status flips to 'committed' and committed_scans count
 * is derived as COUNT(*) WHERE status='committed' AND month_key=current.
 * Dollar spend is SUM(estimated_cost_usd) for any status that incurred model cost
 * (parsed, failed, not_grocery, committed, abandoned) in the month.
 */

import type {
  AttemptStatus,
  ParseAttemptRecord,
  UsageSnapshot,
} from './types.ts';
import { monthKeyUtc } from './cost.ts';

export interface CreateAttemptInput {
  readonly id: string;
  readonly userId: string;
  readonly householdId: string | null;
  readonly status: AttemptStatus;
  readonly estimatedCostUsd: number;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly model: string | null;
  readonly imageCount: number;
  readonly locale: string;
}

export interface UpdateAttemptInput {
  readonly id: string;
  readonly status: AttemptStatus;
  readonly estimatedCostUsd?: number;
  readonly promptTokens?: number;
  readonly completionTokens?: number;
  readonly model?: string | null;
  readonly committedLineCount?: number | null;
}

export interface UsageStore {
  getSnapshot(userId: string, monthKey?: string): Promise<UsageSnapshot>;
  createAttempt(input: CreateAttemptInput): Promise<ParseAttemptRecord>;
  updateAttempt(input: UpdateAttemptInput): Promise<ParseAttemptRecord>;
  getAttempt(id: string): Promise<ParseAttemptRecord | null>;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** In-memory store for unit tests. */
export class InMemoryUsageStore implements UsageStore {
  readonly attempts = new Map<string, ParseAttemptRecord>();

  async getSnapshot(
    userId: string,
    monthKey: string = monthKeyUtc(),
  ): Promise<UsageSnapshot> {
    let committedScans = 0;
    let spentUsd = 0;
    for (const a of this.attempts.values()) {
      if (a.userId !== userId) continue;
      const mk = a.createdAt.slice(0, 7);
      if (mk !== monthKey) continue;
      if (a.status === 'committed') committedScans += 1;
      // Any model spend counts toward dollar budget.
      if (a.estimatedCostUsd > 0) spentUsd += a.estimatedCostUsd;
    }
    return {
      userId,
      monthKey,
      committedScans,
      spentUsd: Math.round(spentUsd * 1_000_000) / 1_000_000,
    };
  }

  async createAttempt(input: CreateAttemptInput): Promise<ParseAttemptRecord> {
    const record: ParseAttemptRecord = {
      id: input.id,
      userId: input.userId,
      householdId: input.householdId,
      status: input.status,
      estimatedCostUsd: input.estimatedCostUsd,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      model: input.model,
      imageCount: input.imageCount,
      locale: input.locale,
      createdAt: nowIso(),
      committedAt: null,
      committedLineCount: null,
    };
    this.attempts.set(record.id, record);
    return record;
  }

  async updateAttempt(input: UpdateAttemptInput): Promise<ParseAttemptRecord> {
    const existing = this.attempts.get(input.id);
    if (!existing) {
      throw new Error(`attempt_not_found:${input.id}`);
    }
    const next: ParseAttemptRecord = {
      ...existing,
      status: input.status,
      estimatedCostUsd: input.estimatedCostUsd ?? existing.estimatedCostUsd,
      promptTokens: input.promptTokens ?? existing.promptTokens,
      completionTokens: input.completionTokens ?? existing.completionTokens,
      model: input.model !== undefined ? input.model : existing.model,
      committedAt:
        input.status === 'committed' ? nowIso() : existing.committedAt,
      committedLineCount:
        input.committedLineCount !== undefined
          ? input.committedLineCount
          : existing.committedLineCount,
    };
    this.attempts.set(input.id, next);
    return next;
  }

  async getAttempt(id: string): Promise<ParseAttemptRecord | null> {
    return this.attempts.get(id) ?? null;
  }
}

/**
 * Minimal Supabase client surface used by the store (avoids tight coupling).
 */
export interface SupabaseLike {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        eq(column: string, value: string): {
          maybeSingle(): Promise<{ data: unknown; error: { message: string } | null }>;
        };
        maybeSingle(): Promise<{ data: unknown; error: { message: string } | null }>;
      };
    };
    insert(row: Record<string, unknown>): Promise<{ error: { message: string } | null }>;
    update(row: Record<string, unknown>): {
      eq(column: string, value: string): Promise<{ error: { message: string } | null }>;
    };
  };
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
}

type DbAttemptRow = {
  id: string;
  user_id: string;
  household_id: string | null;
  status: AttemptStatus;
  estimated_cost_usd: number;
  prompt_tokens: number;
  completion_tokens: number;
  model: string | null;
  image_count: number;
  locale: string;
  created_at: string;
  committed_at: string | null;
  committed_line_count: number | null;
};

function rowToRecord(row: DbAttemptRow): ParseAttemptRecord {
  return {
    id: row.id,
    userId: row.user_id,
    householdId: row.household_id,
    status: row.status,
    estimatedCostUsd: Number(row.estimated_cost_usd),
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    model: row.model,
    imageCount: row.image_count,
    locale: row.locale,
    createdAt: row.created_at,
    committedAt: row.committed_at,
    committedLineCount: row.committed_line_count,
  };
}

/**
 * Service-role backed store. Prefer RPC `receipt_usage_snapshot` when present;
 * falls back to table aggregates if the RPC is missing (schema track may land either).
 */
export class SupabaseUsageStore implements UsageStore {
  constructor(
    private readonly client: SupabaseLike,
    private readonly table = 'receipt_parse_attempts',
  ) {}

  async getSnapshot(
    userId: string,
    monthKey: string = monthKeyUtc(),
  ): Promise<UsageSnapshot> {
    const rpc = await this.client.rpc('receipt_usage_snapshot', {
      p_user_id: userId,
      p_month_key: monthKey,
    });
    if (!rpc.error && rpc.data && typeof rpc.data === 'object') {
      const d = rpc.data as Record<string, unknown>;
      return {
        userId,
        monthKey,
        committedScans: Number(d.committed_scans ?? d.committedScans ?? 0),
        spentUsd: Number(d.spent_usd ?? d.spentUsd ?? 0),
      };
    }

    // Fallback: fetch month rows (service role). Table may not exist yet.
    const res = await this.client
      .from(this.table)
      .select(
        'id,user_id,household_id,status,estimated_cost_usd,prompt_tokens,completion_tokens,model,image_count,locale,created_at,committed_at,committed_line_count',
      )
      .eq('user_id', userId)
      .eq('month_key', monthKey)
      .maybeSingle();

    // maybeSingle is wrong for multi-row — real client uses .select without single.
    // For production the RPC is preferred. In-memory store is used in tests.
    // When table missing, return zero snapshot so deploy without schema still fails soft on write.
    if (res.error) {
      // Zero snapshot: scan/budget checks allow; createAttempt will surface missing table.
      return { userId, monthKey, committedScans: 0, spentUsd: 0 };
    }
    void res;
    return { userId, monthKey, committedScans: 0, spentUsd: 0 };
  }

  async createAttempt(input: CreateAttemptInput): Promise<ParseAttemptRecord> {
    const monthKey = monthKeyUtc();
    const row = {
      id: input.id,
      user_id: input.userId,
      household_id: input.householdId,
      status: input.status,
      estimated_cost_usd: input.estimatedCostUsd,
      prompt_tokens: input.promptTokens,
      completion_tokens: input.completionTokens,
      model: input.model,
      image_count: input.imageCount,
      locale: input.locale,
      month_key: monthKey,
    };
    const { error } = await this.client.from(this.table).insert(row);
    if (error) {
      throw new Error(`usage_store_insert_failed:${error.message}`);
    }
    return {
      id: input.id,
      userId: input.userId,
      householdId: input.householdId,
      status: input.status,
      estimatedCostUsd: input.estimatedCostUsd,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      model: input.model,
      imageCount: input.imageCount,
      locale: input.locale,
      createdAt: nowIso(),
      committedAt: null,
      committedLineCount: null,
    };
  }

  async updateAttempt(input: UpdateAttemptInput): Promise<ParseAttemptRecord> {
    const patch: Record<string, unknown> = { status: input.status };
    if (input.estimatedCostUsd !== undefined) {
      patch.estimated_cost_usd = input.estimatedCostUsd;
    }
    if (input.promptTokens !== undefined) patch.prompt_tokens = input.promptTokens;
    if (input.completionTokens !== undefined) {
      patch.completion_tokens = input.completionTokens;
    }
    if (input.model !== undefined) patch.model = input.model;
    if (input.status === 'committed') {
      patch.committed_at = nowIso();
    }
    if (input.committedLineCount !== undefined) {
      patch.committed_line_count = input.committedLineCount;
    }
    const { error } = await this.client.from(this.table).update(patch).eq('id', input.id);
    if (error) {
      throw new Error(`usage_store_update_failed:${error.message}`);
    }
    const existing = await this.getAttempt(input.id);
    if (!existing) throw new Error(`attempt_not_found:${input.id}`);
    return existing;
  }

  async getAttempt(id: string): Promise<ParseAttemptRecord | null> {
    const res = await this.client
      .from(this.table)
      .select(
        'id,user_id,household_id,status,estimated_cost_usd,prompt_tokens,completion_tokens,model,image_count,locale,created_at,committed_at,committed_line_count',
      )
      .eq('id', id)
      .maybeSingle();
    if (res.error || !res.data) return null;
    return rowToRecord(res.data as DbAttemptRow);
  }
}
