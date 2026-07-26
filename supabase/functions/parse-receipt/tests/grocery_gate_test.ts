import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  decideFromFullParse,
  decideGroceryGate,
  GROCERY_ACCEPT_THRESHOLD,
} from '../lib/grocery_gate.ts';
import { validateGroceryGateResult } from '../lib/schema.ts';

Deno.test('gate accepts high-confidence grocery', async () => {
  const text = await Deno.readTextFile(
    new URL('../fixtures/grocery-gate-yes.json', import.meta.url),
  );
  const v = validateGroceryGateResult(JSON.parse(text));
  assertEquals(v.ok, true);
  if (!v.ok) return;
  const d = decideGroceryGate(v.value);
  assertEquals(d.accept, true);
  assertEquals(d.groceryConfidence >= GROCERY_ACCEPT_THRESHOLD, true);
});

Deno.test('gate rejects Home Depot', async () => {
  const text = await Deno.readTextFile(
    new URL('../fixtures/grocery-gate-no.json', import.meta.url),
  );
  const v = validateGroceryGateResult(JSON.parse(text));
  assertEquals(v.ok, true);
  if (!v.ok) return;
  const d = decideGroceryGate(v.value);
  assertEquals(d.accept, false);
});

Deno.test('gate rejects isGrocery true but low confidence', () => {
  const d = decideGroceryGate({
    isGroceryReceipt: true,
    groceryConfidence: 0.4,
    reason: 'ambiguous',
    storeHint: null,
  });
  assertEquals(d.accept, false);
});

Deno.test('full parse rejects all non-food lines', () => {
  const d = decideFromFullParse({
    isGroceryReceipt: true,
    groceryConfidence: 0.9,
    foodLineCount: 0,
    nonFoodLineCount: 5,
  });
  assertEquals(d.accept, false);
  assertEquals(d.reason, 'no_food_lines_in_parse');
});
