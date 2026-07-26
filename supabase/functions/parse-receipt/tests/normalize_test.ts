import {
  assertEquals,
  assertAlmostEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  attachAllergens,
  normalizeParseResult,
  parseMultiBuyFromRaw,
  parseWeighedFromRaw,
} from '../lib/normalize.ts';
import {
  parseJsonContent,
  validateModelParseResult,
} from '../lib/schema.ts';
import type { ModelParseResult } from '../lib/types.ts';

async function loadFixture(name: string): Promise<unknown> {
  const text = await Deno.readTextFile(
    new URL(`../fixtures/${name}`, import.meta.url),
  );
  return JSON.parse(text) as unknown;
}

function loadModel(name: string): Promise<ModelParseResult> {
  return loadFixture(name).then((raw) => {
    const v = validateModelParseResult(raw);
    if (!v.ok) throw new Error(`fixture ${name}: ${v.errors.join(',')}`);
    return v.value;
  });
}

Deno.test('normal receipt normalizes food lines with allergensUnknown', async () => {
  const model = await loadModel('normal-receipt.json');
  const result = normalizeParseResult(model);
  const foods = result.items.filter((i) => i.lineType === 'food');
  assertEquals(foods.length, 3);
  assertEquals(foods[0].guessedName.toLowerCase().includes('milk'), true);
  // UPC present but no known map → still unknown
  assertEquals(foods[0].allergensUnknown, true);
  assertEquals(result.confidence.high >= 2, true);
});

Deno.test('normal receipt attaches known allergens by UPC', async () => {
  const model = await loadModel('normal-receipt.json');
  const result = normalizeParseResult(model, {
    '000111222333': ['milk'],
  });
  const milk = result.items.find((i) => i.upc === '000111222333');
  assertEquals(milk?.allergensUnknown, false);
  assertEquals(milk?.allergens, ['milk']);
});

Deno.test('warehouse receipt strips item codes and extracts UPC', async () => {
  const model = await loadModel('warehouse-receipt.json');
  const result = normalizeParseResult(model);
  const eggs = result.items.find((i) =>
    i.guessedName.toLowerCase().includes('egg'),
  );
  assertEquals(eggs?.lineType, 'food');
  const chicken = result.items.find((i) =>
    i.guessedName.toLowerCase().includes('chicken'),
  );
  assertEquals(chicken?.upc, '9801234567890');
  const towels = result.items.find((i) => i.lineType === 'non-food');
  assertEquals(towels?.guessedName.toLowerCase().includes('paper'), true);
});

Deno.test('weighed items convert mass to grams', async () => {
  const model = await loadModel('weighed-items.json');
  const result = normalizeParseResult(model);
  const bananas = result.items.find((i) =>
    i.guessedName.toLowerCase().includes('banana'),
  );
  assertEquals(bananas?.weighed, true);
  assertEquals(bananas?.unit, 'lb');
  assertEquals(bananas?.quantity, 2.14);
  // 2.14 lb * 453.59237 ≈ 970.69 g
  assertAlmostEquals(bananas!.massG!, 2.14 * 453.59237, 0.1);
  assertEquals(bananas?.unitPrice, 0.59);

  const yogurt = result.items.find((i) =>
    i.guessedName.toLowerCase().includes('yogurt'),
  );
  assertEquals(yogurt?.multiBuy, true);
  assertEquals(yogurt?.quantity, 2);
  assertEquals(yogurt?.totalPrice, 6.98);
});

Deno.test('parseWeighedFromRaw standalone', () => {
  const w = parseWeighedFromRaw('BANANAS 2.14 LB @ 0.59');
  assertEquals(w?.quantity, 2.14);
  assertEquals(w?.unit, 'lb');
  assertEquals(w?.unitPrice, 0.59);
});

Deno.test('parseMultiBuyFromRaw variants', () => {
  assertEquals(parseMultiBuyFromRaw('2 @ 3.49')?.quantity, 2);
  assertEquals(parseMultiBuyFromRaw('3/5.00')?.totalPrice, 5);
  assertEquals(parseMultiBuyFromRaw('3 FOR 5')?.quantity, 3);
});

Deno.test('discount lines pair to parent', async () => {
  const model = await loadModel('discount-lines.json');
  const result = normalizeParseResult(model);
  const discounts = result.items.filter((i) => i.lineType === 'discount');
  assertEquals(discounts.length, 2);
  // First coupon has parentRawText PEPSI
  const pepsiCoupon = discounts[0];
  assertEquals(pepsiCoupon.parentLineId, 'line_0');
  // Second has no parent text → nearest preceding food (cereal)
  const storeCoupon = discounts[1];
  assertEquals(storeCoupon.parentLineId, 'line_2');
  // Negative prices preserved
  assertEquals(pepsiCoupon.totalPrice, -1);
});

Deno.test('non-grocery fixture validates but is not grocery', async () => {
  const model = await loadModel('non-grocery.json');
  assertEquals(model.isGroceryReceipt, false);
  assertEquals(model.groceryConfidence < 0.35, true);
  const result = normalizeParseResult(model);
  assertEquals(result.items.every((i) => i.lineType !== 'food'), true);
});

Deno.test('malformed model response fails schema validation', async () => {
  const raw = await loadFixture('malformed-response.json');
  const v = validateModelParseResult(raw);
  assertEquals(v.ok, false);
  if (!v.ok) {
    assertEquals(v.errors.length > 0, true);
  }
});

Deno.test('parseJsonContent strips fences', () => {
  const r = parseJsonContent('```json\n{"a":1}\n```');
  assertEquals(r.ok, true);
  if (r.ok) assertEquals((r.value as { a: number }).a, 1);
});

Deno.test('attachAllergens unknown is unsafe', () => {
  const u = attachAllergens(null);
  assertEquals(u.allergensUnknown, true);
  const k = attachAllergens('123', { '123': ['peanut'] });
  assertEquals(k.allergensUnknown, false);
  assertEquals(k.allergens, ['peanut']);
});
