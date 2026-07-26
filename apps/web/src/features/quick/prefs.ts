/**
 * Pinned quick items + frequency live in localStorage (no quick_items table yet).
 * Offline-safe; survives reloads without a new dep.
 */

import type { Dimension } from '@larder/core';

import type { QuickPrefs } from './types';

const STORAGE_KEY = 'tgp.quick.prefs.v1';

const DEFAULT_PINS: QuickPrefs['pins'] = [
  {
    ingredientId: 'yogurt-plain',
    formId: 'yogurt-plain-bulk',
    name: 'Yogurt',
    defaultQtyBase: 170, // single cup ~6 oz
    dim: 'mass',
  },
  {
    ingredientId: 'apple',
    formId: 'apple-each',
    name: 'Apple',
    defaultQtyBase: 1,
    dim: 'count',
  },
  {
    ingredientId: 'egg',
    formId: 'egg-whole',
    name: 'Egg',
    defaultQtyBase: 1,
    dim: 'count',
  },
];

export function defaultQuickPrefs(): QuickPrefs {
  return {
    pins: DEFAULT_PINS.map((p) => ({ ...p })),
    frequency: {
      'yogurt-plain': 12,
      apple: 8,
      egg: 15,
      banana: 6,
      'string-cheese': 4,
    },
    recentClientTxnIds: [],
  };
}

function isDim(v: unknown): v is Dimension {
  return v === 'mass' || v === 'volume' || v === 'count';
}

function parsePrefs(raw: unknown): QuickPrefs | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.pins)) return null;
  const pins: QuickPrefs['pins'] = [];
  for (const p of o.pins) {
    if (!p || typeof p !== 'object') continue;
    const row = p as Record<string, unknown>;
    if (
      typeof row.ingredientId !== 'string' ||
      typeof row.formId !== 'string' ||
      typeof row.name !== 'string' ||
      typeof row.defaultQtyBase !== 'number' ||
      !isDim(row.dim)
    ) {
      continue;
    }
    pins.push({
      ingredientId: row.ingredientId,
      formId: row.formId,
      name: row.name,
      defaultQtyBase: row.defaultQtyBase,
      dim: row.dim,
    });
  }
  const frequency: Record<string, number> = {};
  if (o.frequency && typeof o.frequency === 'object') {
    for (const [k, v] of Object.entries(o.frequency as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v)) frequency[k] = v;
    }
  }
  const recentClientTxnIds = Array.isArray(o.recentClientTxnIds)
    ? o.recentClientTxnIds.filter((x): x is string => typeof x === 'string')
    : [];
  return { pins, frequency, recentClientTxnIds };
}

export function loadQuickPrefs(): QuickPrefs {
  try {
    if (typeof localStorage === 'undefined') return defaultQuickPrefs();
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultQuickPrefs();
    const parsed = parsePrefs(JSON.parse(raw) as unknown);
    return parsed ?? defaultQuickPrefs();
  } catch {
    return defaultQuickPrefs();
  }
}

export function saveQuickPrefs(prefs: QuickPrefs): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // quota / private mode — ignore
  }
}

/** Suggested extras from frequency that are not already pinned. */
export const SUGGESTED_CATALOG: QuickPrefs['pins'] = [
  {
    ingredientId: 'banana',
    formId: 'banana-each',
    name: 'Banana',
    defaultQtyBase: 1,
    dim: 'count',
  },
  {
    ingredientId: 'string-cheese',
    formId: 'string-cheese-each',
    name: 'String cheese',
    defaultQtyBase: 1,
    dim: 'count',
  },
  {
    ingredientId: 'carrot',
    formId: 'carrot-bulk',
    name: 'Carrot',
    defaultQtyBase: 50,
    dim: 'mass',
  },
];
