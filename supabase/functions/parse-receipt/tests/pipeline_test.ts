import {
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { runAbandon, runCommit, runParse } from '../lib/pipeline.ts';
import {
  parseJsonContent,
  validateGroceryGateResult,
  validateModelParseResult,
} from '../lib/schema.ts';
import type {
  ModelGroceryGateResult,
  ModelParseResult,
  ParseSuccessResponse,
} from '../lib/types.ts';
import { DEFAULT_PRICING } from '../lib/types.ts';
import { InMemoryUsageStore } from '../lib/usage_store.ts';
import { FixtureVisionClient } from '../lib/vision.ts';

async function loadJson(name: string): Promise<unknown> {
  const text = await Deno.readTextFile(
    new URL(`../fixtures/${name}`, import.meta.url),
  );
  return JSON.parse(text) as unknown;
}

async function loadParse(name: string): Promise<ModelParseResult> {
  const v = validateModelParseResult(await loadJson(name));
  if (!v.ok) throw new Error(v.errors.join(','));
  return v.value;
}

async function loadGate(name: string): Promise<ModelGroceryGateResult> {
  const v = validateGroceryGateResult(await loadJson(name));
  if (!v.ok) throw new Error(v.errors.join(','));
  return v.value;
}

function asParsed(result: { ok: boolean; status?: string }): ParseSuccessResponse {
  assertEquals(result.ok, true);
  assertEquals((result as ParseSuccessResponse).status, 'parsed');
  return result as ParseSuccessResponse;
}

const dummyImage = [{ data: 'AAAA', mimeType: 'image/jpeg' as const }];

Deno.test('pipeline: normal receipt returns items without charging quota', async () => {
  const usage = new InMemoryUsageStore();
  const vision = new FixtureVisionClient({
    gate: await loadGate('grocery-gate-yes.json'),
    parse: await loadParse('normal-receipt.json'),
  });
  const result = asParsed(
    await runParse(
      {
        vision,
        usage,
        pricing: DEFAULT_PRICING,
        idFactory: () => 'attempt-normal',
      },
      { userId: 'user-1', images: dummyImage, locale: 'en-US' },
    ),
  );
  assertEquals(result.quotaCharged, false);
  assertEquals(result.status, 'parsed');
  assertEquals(result.items.filter((i) => i.lineType === 'food').length, 3);
  assertEquals(result.summary.model.length > 0, true);
  // All food lines default allergensUnknown
  for (const item of result.items.filter((i) => i.lineType === 'food')) {
    if (!item.upc) assertEquals(item.allergensUnknown, true);
  }
  const snap = await usage.getSnapshot('user-1');
  assertEquals(snap.committedScans, 0);
  assertEquals(snap.spentUsd > 0, true);
});

Deno.test('pipeline: warehouse fixture', async () => {
  const usage = new InMemoryUsageStore();
  const vision = new FixtureVisionClient({
    gate: await loadGate('grocery-gate-yes.json'),
    parse: await loadParse('warehouse-receipt.json'),
  });
  const result = asParsed(
    await runParse(
      { vision, usage, idFactory: () => 'attempt-wh' },
      { userId: 'user-1', images: dummyImage },
    ),
  );
  assertExists(result.items.find((i) => i.lineType === 'non-food'));
  assertExists(result.items.find((i) => i.upc === '9801234567890'));
});

Deno.test('pipeline: weighed items', async () => {
  const usage = new InMemoryUsageStore();
  const vision = new FixtureVisionClient({
    gate: await loadGate('grocery-gate-yes.json'),
    parse: await loadParse('weighed-items.json'),
  });
  const result = asParsed(
    await runParse(
      { vision, usage, idFactory: () => 'attempt-wt' },
      { userId: 'user-1', images: dummyImage },
    ),
  );
  const bananas = result.items.find((i) => i.weighed);
  assertExists(bananas);
  assertEquals(bananas!.massG !== null, true);
});

Deno.test('pipeline: discount pairing', async () => {
  const usage = new InMemoryUsageStore();
  const vision = new FixtureVisionClient({
    gate: await loadGate('grocery-gate-yes.json'),
    parse: await loadParse('discount-lines.json'),
  });
  const result = asParsed(
    await runParse(
      { vision, usage, idFactory: () => 'attempt-disc' },
      { userId: 'user-1', images: dummyImage },
    ),
  );
  const disc = result.items.filter((i) => i.lineType === 'discount');
  assertEquals(disc.some((d) => d.parentLineId !== null), true);
});

Deno.test('pipeline: non-grocery gate rejects without full parse charge pattern', async () => {
  const usage = new InMemoryUsageStore();
  let parseCalls = 0;
  const vision = new FixtureVisionClient({
    gate: await loadGate('grocery-gate-no.json'),
    parse: () => {
      parseCalls += 1;
      throw new Error('should not parse');
    },
  });
  const result = await runParse(
    { vision, usage, idFactory: () => 'attempt-hd' },
    { userId: 'user-1', images: dummyImage },
  );
  assertEquals(result.ok, false);
  if (result.ok) return;
  assertEquals(result.code, 'not_grocery');
  if (result.code === 'not_grocery') {
    assertEquals(result.quotaCharged, false);
  }
  assertEquals(parseCalls, 0);
  const snap = await usage.getSnapshot('user-1');
  assertEquals(snap.committedScans, 0);
});

Deno.test('pipeline: malformed model response retries once then fails cleanly', async () => {
  const usage = new InMemoryUsageStore();
  const good = await loadParse('normal-receipt.json');
  const vision = new FixtureVisionClient({
    gate: await loadGate('grocery-gate-yes.json'),
    parseSequence: ['schema_error', 'schema_error'],
  });
  const fail = await runParse(
    { vision, usage, idFactory: () => 'attempt-mal' },
    { userId: 'user-1', images: dummyImage },
  );
  assertEquals(fail.ok, false);
  if (!fail.ok) assertEquals(fail.code, 'schema_violation');
  assertEquals((await usage.getSnapshot('user-1')).committedScans, 0);

  // Retry succeeds on second call
  const usage2 = new InMemoryUsageStore();
  const vision2 = new FixtureVisionClient({
    gate: await loadGate('grocery-gate-yes.json'),
    parseSequence: ['schema_error', good],
  });
  const ok = asParsed(
    await runParse(
      { vision: vision2, usage: usage2, idFactory: () => 'attempt-mal-ok' },
      { userId: 'user-1', images: dummyImage },
    ),
  );
  assertEquals(ok.summary.schemaRetryUsed, true);
});

Deno.test('pipeline: commit charges scan; abandon does not', async () => {
  const usage = new InMemoryUsageStore();
  const vision = new FixtureVisionClient({
    gate: await loadGate('grocery-gate-yes.json'),
    parse: await loadParse('normal-receipt.json'),
  });
  asParsed(
    await runParse(
      { vision, usage, idFactory: () => 'attempt-commit' },
      { userId: 'user-1', images: dummyImage },
    ),
  );

  const abandonedUsage = new InMemoryUsageStore();
  await runParse(
    {
      vision,
      usage: abandonedUsage,
      idFactory: () => 'attempt-abandon',
    },
    { userId: 'user-1', images: dummyImage },
  );
  const ab = await runAbandon(
    { usage: abandonedUsage },
    { userId: 'user-1', attemptId: 'attempt-abandon' },
  );
  assertEquals(ab.ok, true);
  if (ab.ok && ab.status === 'abandoned') {
    assertEquals(ab.quotaCharged, false);
  }
  assertEquals((await abandonedUsage.getSnapshot('user-1')).committedScans, 0);

  const committed = await runCommit(
    { usage },
    { userId: 'user-1', attemptId: 'attempt-commit', committedLineCount: 3 },
  );
  assertEquals(committed.ok, true);
  if (committed.ok && committed.status === 'committed') {
    assertEquals(committed.quotaCharged, true);
    assertEquals(committed.committedScansThisMonth, 1);
  }
  assertEquals((await usage.getSnapshot('user-1')).committedScans, 1);
});

Deno.test('pipeline: scan quota blocks before vision when committed full', async () => {
  const usage = new InMemoryUsageStore();
  // Seed 15 committed scans
  for (let i = 0; i < 15; i++) {
    await usage.createAttempt({
      id: `c${i}`,
      userId: 'user-1',
      householdId: null,
      status: 'committed',
      estimatedCostUsd: 0.001,
      promptTokens: 10,
      completionTokens: 5,
      model: 'x',
      imageCount: 1,
      locale: 'en-US',
    });
  }
  let gateCalls = 0;
  const vision = new FixtureVisionClient({
    gate: () => {
      gateCalls += 1;
      return {
        isGroceryReceipt: true,
        groceryConfidence: 0.9,
        reason: 'x',
        storeHint: null,
      };
    },
    parse: await loadParse('normal-receipt.json'),
  });
  const result = await runParse(
    { vision, usage, idFactory: () => 'blocked' },
    { userId: 'user-1', images: dummyImage },
  );
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.code, 'quota_exceeded');
  assertEquals(gateCalls, 0);
});

Deno.test('pipeline: dollar budget circuit breaker blocks expensive month', async () => {
  const usage = new InMemoryUsageStore();
  await usage.createAttempt({
    id: 'prior',
    userId: 'user-1',
    householdId: null,
    status: 'parsed',
    estimatedCostUsd: 0.5,
    promptTokens: 100_000,
    completionTokens: 50_000,
    model: 'x',
    imageCount: 4,
    locale: 'en-US',
  });
  let gateCalls = 0;
  const vision = new FixtureVisionClient({
    gate: () => {
      gateCalls += 1;
      return {
        isGroceryReceipt: true,
        groceryConfidence: 0.9,
        reason: 'x',
        storeHint: null,
      };
    },
    parse: await loadParse('normal-receipt.json'),
  });
  const result = await runParse(
    {
      vision,
      usage,
      quota: { monthlyBudgetUsd: 0.5, freeScanLimit: 15 },
      idFactory: () => 'budget-block',
    },
    { userId: 'user-1', images: dummyImage },
  );
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.code, 'budget_exceeded');
  assertEquals(gateCalls, 0);
});

Deno.test('pipeline: spanish locale passed through without english-only assumption', async () => {
  const usage = new InMemoryUsageStore();
  const base = await loadParse('normal-receipt.json');
  const es: ModelParseResult = {
    ...base,
    locale: 'es-MX',
    storeName: 'Mercado Local',
    lines: base.lines.map((l) =>
      l.lineType === 'food' && l.guessedName.includes('Milk')
        ? { ...l, rawText: 'LECHE ENTERA 1L', guessedName: 'Leche entera' }
        : l
    ),
  };
  const vision = new FixtureVisionClient({
    gate: await loadGate('grocery-gate-yes.json'),
    parse: es,
  });
  const result = asParsed(
    await runParse(
      { vision, usage, idFactory: () => 'attempt-es' },
      { userId: 'user-1', images: dummyImage, locale: 'es-MX' },
    ),
  );
  assertEquals(result.summary.locale, 'es-MX');
  assertExists(
    result.items.find((i) => i.guessedName.toLowerCase().includes('leche')),
  );
});

Deno.test('malformed JSON content is rejected by parseJsonContent', async () => {
  const raw = await loadJson('malformed-response.json');
  // fixture is valid JSON but wrong schema
  const asText = JSON.stringify(raw);
  const parsed = parseJsonContent(asText);
  assertEquals(parsed.ok, true);
  const validated = validateModelParseResult(parsed.ok ? parsed.value : null);
  assertEquals(validated.ok, false);
});
