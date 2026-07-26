/**
 * Strict JSON schemas for OpenRouter structured outputs + runtime validators.
 * Model responses that fail validation trigger one retry then a clean error.
 */

import type {
  LineType,
  ModelGroceryGateResult,
  ModelLineItem,
  ModelParseResult,
} from './types.ts';

const LINE_TYPES: readonly LineType[] = [
  'food',
  'non-food',
  'tax',
  'discount',
  'total',
  'unknown',
];

/** OpenRouter response_format json_schema for full receipt parse. */
export const RECEIPT_PARSE_JSON_SCHEMA = {
  name: 'receipt_parse',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'storeName',
      'storeAddress',
      'receiptDate',
      'currency',
      'locale',
      'isGroceryReceipt',
      'groceryConfidence',
      'lines',
      'subtotal',
      'tax',
      'total',
      'notes',
    ],
    properties: {
      storeName: { type: ['string', 'null'] },
      storeAddress: { type: ['string', 'null'] },
      receiptDate: { type: ['string', 'null'] },
      currency: { type: ['string', 'null'] },
      locale: { type: ['string', 'null'] },
      isGroceryReceipt: { type: 'boolean' },
      groceryConfidence: { type: 'number' },
      lines: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'rawText',
            'guessedName',
            'quantity',
            'unit',
            'packageSize',
            'unitPrice',
            'totalPrice',
            'confidence',
            'lineType',
            'upc',
            'parentRawText',
          ],
          properties: {
            rawText: { type: 'string' },
            guessedName: { type: 'string' },
            quantity: { type: ['number', 'null'] },
            unit: { type: ['string', 'null'] },
            packageSize: { type: ['string', 'null'] },
            unitPrice: { type: ['number', 'null'] },
            totalPrice: { type: ['number', 'null'] },
            confidence: { type: 'number' },
            lineType: {
              type: 'string',
              enum: [...LINE_TYPES],
            },
            upc: { type: ['string', 'null'] },
            parentRawText: { type: ['string', 'null'] },
          },
        },
      },
      subtotal: { type: ['number', 'null'] },
      tax: { type: ['number', 'null'] },
      total: { type: ['number', 'null'] },
      notes: { type: ['string', 'null'] },
    },
  },
} as const;

/** Cheap grocery-likelihood pre-check schema. */
export const GROCERY_GATE_JSON_SCHEMA = {
  name: 'grocery_gate',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['isGroceryReceipt', 'groceryConfidence', 'reason', 'storeHint'],
    properties: {
      isGroceryReceipt: { type: 'boolean' },
      groceryConfidence: { type: 'number' },
      reason: { type: 'string' },
      storeHint: { type: ['string', 'null'] },
    },
  },
} as const;

export interface SchemaValidationOk<T> {
  readonly ok: true;
  readonly value: T;
}

export interface SchemaValidationErr {
  readonly ok: false;
  readonly errors: readonly string[];
}

export type SchemaValidation<T> = SchemaValidationOk<T> | SchemaValidationErr;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asNullableString(v: unknown): string | null | undefined {
  if (v === null) return null;
  if (typeof v === 'string') return v;
  return undefined;
}

function asNullableNumber(v: unknown): number | null | undefined {
  if (v === null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return undefined;
}

function asBoolean(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined;
}

function asLineType(v: unknown): LineType | undefined {
  if (typeof v !== 'string') return undefined;
  return (LINE_TYPES as readonly string[]).includes(v)
    ? (v as LineType)
    : undefined;
}

function validateLine(raw: unknown, index: number): SchemaValidation<ModelLineItem> {
  if (!isObject(raw)) {
    return { ok: false, errors: [`lines[${index}]: expected object`] };
  }
  const errors: string[] = [];
  const rawText = raw.rawText;
  const guessedName = raw.guessedName;
  if (typeof rawText !== 'string') errors.push(`lines[${index}].rawText`);
  if (typeof guessedName !== 'string') errors.push(`lines[${index}].guessedName`);

  const quantity = asNullableNumber(raw.quantity);
  if (quantity === undefined) errors.push(`lines[${index}].quantity`);
  const unit = asNullableString(raw.unit);
  if (unit === undefined) errors.push(`lines[${index}].unit`);
  const packageSize = asNullableString(raw.packageSize);
  if (packageSize === undefined) errors.push(`lines[${index}].packageSize`);
  const unitPrice = asNullableNumber(raw.unitPrice);
  if (unitPrice === undefined) errors.push(`lines[${index}].unitPrice`);
  const totalPrice = asNullableNumber(raw.totalPrice);
  if (totalPrice === undefined) errors.push(`lines[${index}].totalPrice`);
  const confidence = asNullableNumber(raw.confidence);
  if (confidence === undefined || confidence === null) {
    errors.push(`lines[${index}].confidence`);
  }
  const lineType = asLineType(raw.lineType);
  if (!lineType) errors.push(`lines[${index}].lineType`);
  const upc = asNullableString(raw.upc);
  if (upc === undefined) errors.push(`lines[${index}].upc`);
  const parentRawText = asNullableString(raw.parentRawText);
  if (parentRawText === undefined) errors.push(`lines[${index}].parentRawText`);

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      rawText: rawText as string,
      guessedName: guessedName as string,
      quantity: quantity as number | null,
      unit: unit as string | null,
      packageSize: packageSize as string | null,
      unitPrice: unitPrice as number | null,
      totalPrice: totalPrice as number | null,
      confidence: confidence as number,
      lineType: lineType as LineType,
      upc: upc as string | null,
      parentRawText: parentRawText as string | null,
    },
  };
}

export function validateModelParseResult(
  raw: unknown,
): SchemaValidation<ModelParseResult> {
  if (!isObject(raw)) {
    return { ok: false, errors: ['root: expected object'] };
  }
  const errors: string[] = [];

  const storeName = asNullableString(raw.storeName);
  if (storeName === undefined) errors.push('storeName');
  const storeAddress = asNullableString(raw.storeAddress);
  if (storeAddress === undefined) errors.push('storeAddress');
  const receiptDate = asNullableString(raw.receiptDate);
  if (receiptDate === undefined) errors.push('receiptDate');
  const currency = asNullableString(raw.currency);
  if (currency === undefined) errors.push('currency');
  const locale = asNullableString(raw.locale);
  if (locale === undefined) errors.push('locale');
  const isGroceryReceipt = asBoolean(raw.isGroceryReceipt);
  if (isGroceryReceipt === undefined) errors.push('isGroceryReceipt');
  const groceryConfidence = asNullableNumber(raw.groceryConfidence);
  if (groceryConfidence === undefined || groceryConfidence === null) {
    errors.push('groceryConfidence');
  }
  const subtotal = asNullableNumber(raw.subtotal);
  if (subtotal === undefined) errors.push('subtotal');
  const tax = asNullableNumber(raw.tax);
  if (tax === undefined) errors.push('tax');
  const total = asNullableNumber(raw.total);
  if (total === undefined) errors.push('total');
  const notes = asNullableString(raw.notes);
  if (notes === undefined) errors.push('notes');

  if (!Array.isArray(raw.lines)) {
    errors.push('lines: expected array');
    return { ok: false, errors };
  }

  const lines: ModelLineItem[] = [];
  for (let i = 0; i < raw.lines.length; i++) {
    const lineResult = validateLine(raw.lines[i], i);
    if (!lineResult.ok) {
      errors.push(...lineResult.errors);
    } else {
      lines.push(lineResult.value);
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      storeName: storeName as string | null,
      storeAddress: storeAddress as string | null,
      receiptDate: receiptDate as string | null,
      currency: currency as string | null,
      locale: locale as string | null,
      isGroceryReceipt: isGroceryReceipt as boolean,
      groceryConfidence: groceryConfidence as number,
      lines,
      subtotal: subtotal as number | null,
      tax: tax as number | null,
      total: total as number | null,
      notes: notes as string | null,
    },
  };
}

export function validateGroceryGateResult(
  raw: unknown,
): SchemaValidation<ModelGroceryGateResult> {
  if (!isObject(raw)) {
    return { ok: false, errors: ['root: expected object'] };
  }
  const errors: string[] = [];
  const isGroceryReceipt = asBoolean(raw.isGroceryReceipt);
  if (isGroceryReceipt === undefined) errors.push('isGroceryReceipt');
  const groceryConfidence = asNullableNumber(raw.groceryConfidence);
  if (groceryConfidence === undefined || groceryConfidence === null) {
    errors.push('groceryConfidence');
  }
  if (typeof raw.reason !== 'string') errors.push('reason');
  const storeHint = asNullableString(raw.storeHint);
  if (storeHint === undefined) errors.push('storeHint');

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      isGroceryReceipt: isGroceryReceipt as boolean,
      groceryConfidence: groceryConfidence as number,
      reason: raw.reason as string,
      storeHint: storeHint as string | null,
    },
  };
}

/**
 * Parse model content string (may be fenced JSON) into unknown, then validate.
 */
export function parseJsonContent(content: string): SchemaValidation<unknown> {
  const trimmed = content.trim();
  // Strip optional markdown fences without logging content length details.
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return { ok: true, value: JSON.parse(unfenced) as unknown };
  } catch {
    return { ok: false, errors: ['content is not valid JSON'] };
  }
}
