/**
 * Pinned quick items + frequency live in localStorage (no quick_items table yet).
 * Offline-safe; survives reloads without a new dep.
 *
 * v2: empty defaults — never seed fake pantry ingredients or frequencies.
 * Demo fixtures live only in demoPrefs() for !hasActiveRepository() surfaces.
 */

import type { Dimension } from '@larder/core';

import type { QuickPrefs } from './types';

/** Bumped from v1 so installs that cached seeded yogurt/apple/egg prefs start clean. */
const STORAGE_KEY = 'tgp.quick.prefs.v2';

/**
 * Demo-only catalog — yogurt / apple / egg pins + banana / string cheese / carrot
 * suggestions. Used exclusively when there is no live repository.
 */
export const DEMO_PINS: QuickPrefs['pins'] = [
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

/** Demo-only suggested extras (not already in DEMO_PINS). */
export const DEMO_SUGGESTED_CATALOG: QuickPrefs['pins'] = [
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

const DEMO_FREQUENCY: Record<string, number> = {
  'yogurt-plain': 12,
  apple: 8,
  egg: 15,
  banana: 6,
  'string-cheese': 4,
};

/** Honest empty prefs for a new install / live mode first run. */
export function defaultQuickPrefs(): QuickPrefs {
  return {
    pins: [],
    frequency: {},
    recentClientTxnIds: [],
  };
}

/** Fabricated demo prefs — only for surfaces without an active repository. */
export function demoQuickPrefs(): QuickPrefs {
  return {
    pins: DEMO_PINS.map((p) => ({ ...p })),
    frequency: { ...DEMO_FREQUENCY },
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

/**
 * @deprecated Use DEMO_SUGGESTED_CATALOG — kept as an alias so any stray import
 * fails loud in review if it reappears in live paths.
 */
export const SUGGESTED_CATALOG = DEMO_SUGGESTED_CATALOG;
