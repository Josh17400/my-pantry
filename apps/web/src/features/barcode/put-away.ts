/**
 * Put-away confirmation → purchase txn + remember mapping.
 * Purchase targets canonical ingredient ids only.
 */

import {
  DEFAULT_DEVICE_ID,
  DEFAULT_HOUSEHOLD_ID,
  DEFAULT_USER_ID,
} from '../../db/constants';
import type { AppendTxnInput } from '../../db/types';
import { buildPurchaseTxn } from '../pantry/lib/txn-builders';
import { buildCanonicalMapping } from './segregation';
import type {
  BarcodeCanonicalMapping,
  ConfirmPutAwayInput,
  OffDerivedProduct,
} from './types';
import { BarcodeMappingStore } from './user-mappings';

export type PutAwayResult = {
  readonly txn: AppendTxnInput;
  readonly mapping: BarcodeCanonicalMapping;
};

/**
 * Build purchase txn + mapping. Caller appends txn via pantry store.
 * OFF product (if any) is only referenced on the mapping, never written as stock.
 */
export function buildPutAway(
  input: ConfirmPutAwayInput,
  actor: {
    householdId?: string;
    deviceId?: string;
    userId?: string;
  } = {},
  mappingStore: BarcodeMappingStore = new BarcodeMappingStore(),
): PutAwayResult {
  const qty = input.qtyBase > 0 ? input.qtyBase : 1;
  const txn = buildPurchaseTxn(
    { ingredientId: input.ingredientId, formId: input.formId },
    qty,
    {
      householdId: actor.householdId ?? DEFAULT_HOUSEHOLD_ID,
      deviceId: actor.deviceId ?? DEFAULT_DEVICE_ID,
      userId: actor.userId ?? DEFAULT_USER_ID,
    },
  );

  const mapping = buildCanonicalMapping({
    barcode: input.barcode,
    ingredientId: input.ingredientId,
    formId: input.formId,
    displayName: input.displayName,
    offProduct: input.offProduct,
  });
  mappingStore.set(mapping);

  return { txn, mapping };
}

/** Prefer remembered mapping over a fresh OFF match. */
export function resolveFromMapping(
  barcode: string,
  store: BarcodeMappingStore = new BarcodeMappingStore(),
): BarcodeCanonicalMapping | null {
  return store.get(barcode);
}

/**
 * Default put-away quantity when OFF quantity is unknown.
 * Count-dimension packaging defaults to 1 unit; mass/volume leave qty to user.
 */
export function defaultPutAwayQty(
  _off: OffDerivedProduct | null,
  formDim: 'mass' | 'volume' | 'count' | null,
): number {
  if (formDim === 'count') return 1;
  // Unknown package size — user should edit; still offer 1 as a starting point.
  return 1;
}
