import { describe, expect, it } from 'vitest';

import {
  buildAdjustTxn,
  buildMarkUsedUpTxn,
  buildPurchaseTxn,
  buildRecountTxn,
  buildUndoTxn,
  buildWasteTxn,
} from './txn-builders';

const item = { ingredientId: 'flour', formId: 'flour-ap' };

describe('txn builders', () => {
  it('adjust is relative adjust_delta', () => {
    const t = buildAdjustTxn(item, -50);
    expect(t.kind).toBe('relative');
    if (t.kind === 'relative') {
      expect(t.reason).toBe('adjust_delta');
      expect(t.deltaBase).toBe(-50);
    }
  });

  it('recount is absolute with targetBase', () => {
    const t = buildRecountTxn(item, 400, {}, { basisCursor: 'c1' });
    expect(t.kind).toBe('absolute');
    if (t.kind === 'absolute') {
      expect(t.reason).toBe('recount');
      expect(t.targetBase).toBe(400);
      expect(t.basisCursor).toBe('c1');
    }
  });

  it('waste is relative negative consumption', () => {
    const t = buildWasteTxn(item, 30);
    expect(t.kind).toBe('relative');
    if (t.kind === 'relative') {
      expect(t.reason).toBe('waste');
      expect(t.deltaBase).toBe(-30);
    }
  });

  it('mark used up is absolute zero (snap empty)', () => {
    const t = buildMarkUsedUpTxn(item);
    expect(t.kind).toBe('absolute');
    if (t.kind === 'absolute') {
      expect(t.targetBase).toBe(0);
      expect(t.reason).toBe('recount');
    }
  });

  it('purchase is relative positive', () => {
    const t = buildPurchaseTxn(item, 1000);
    expect(t.kind).toBe('relative');
    if (t.kind === 'relative') {
      expect(t.reason).toBe('purchase');
      expect(t.deltaBase).toBe(1000);
    }
  });

  it('undo relative flips delta via adjust_delta', () => {
    const orig = buildWasteTxn(item, 40);
    const undo = buildUndoTxn(orig, 200);
    expect(undo.kind).toBe('relative');
    if (undo.kind === 'relative' && orig.kind === 'relative') {
      expect(undo.reason).toBe('adjust_delta');
      expect(undo.deltaBase).toBe(-orig.deltaBase);
    }
  });

  it('undo absolute recounts back to previous qty', () => {
    const orig = buildRecountTxn(item, 0);
    const undo = buildUndoTxn(orig, 350);
    expect(undo.kind).toBe('absolute');
    if (undo.kind === 'absolute') {
      expect(undo.targetBase).toBe(350);
    }
  });
});
