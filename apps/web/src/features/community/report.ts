/**
 * Recipe report flow — pure create + in-memory / localStorage store.
 * Supabase moderation tables (migration) are the durable home when online.
 */

import { newId } from '../../db/id';
import type { CreateReportInput, RecipeReport, ReportReason } from './types';

export const REPORT_REASONS: readonly {
  readonly id: ReportReason;
  readonly label: string;
}[] = [
  { id: 'spam', label: 'Spam or advertising' },
  { id: 'copyright', label: 'Copyright infringement' },
  { id: 'unsafe', label: 'Unsafe or dangerous advice' },
  { id: 'offensive', label: 'Offensive or hateful content' },
  { id: 'misinformation', label: 'Misinformation' },
  { id: 'other', label: 'Other' },
] as const;

export function createReport(input: CreateReportInput): RecipeReport {
  const reason = input.reason;
  if (!REPORT_REASONS.some((r) => r.id === reason)) {
    throw new Error(`Invalid report reason: ${String(reason)}`);
  }
  if (!input.recipeId.trim()) {
    throw new Error('recipeId is required');
  }
  if (!input.reporterId.trim()) {
    throw new Error('reporterId is required');
  }

  return {
    id: newId('report'),
    recipeId: input.recipeId,
    reporterId: input.reporterId,
    reason,
    details: input.details?.trim() || null,
    createdAt: input.now ?? new Date().toISOString(),
    status: 'open',
  };
}

/** Prevent duplicate open reports from the same user on the same recipe. */
export function canReport(
  existing: readonly RecipeReport[],
  recipeId: string,
  reporterId: string,
): { ok: true } | { ok: false; message: string } {
  const dup = existing.find(
    (r) =>
      r.recipeId === recipeId &&
      r.reporterId === reporterId &&
      r.status === 'open',
  );
  if (dup) {
    return {
      ok: false,
      message: 'You already have an open report on this recipe.',
    };
  }
  return { ok: true };
}

export type ReportStore = {
  list(): readonly RecipeReport[];
  listForRecipe(recipeId: string): readonly RecipeReport[];
  add(report: RecipeReport): void;
  clear(): void;
};

/** In-memory report store (tests + offline buffer). */
export function createMemoryReportStore(
  seed: readonly RecipeReport[] = [],
): ReportStore {
  const rows: RecipeReport[] = [...seed];
  return {
    list: () => rows,
    listForRecipe: (recipeId) => rows.filter((r) => r.recipeId === recipeId),
    add: (report) => {
      rows.push(report);
    },
    clear: () => {
      rows.length = 0;
    },
  };
}

const LS_KEY = 'tgp.community.reports.v1';

function readLs(): RecipeReport[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as RecipeReport[];
  } catch {
    return [];
  }
}

function writeLs(rows: readonly RecipeReport[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(rows));
  } catch {
    // quota / private mode — ignore
  }
}

/** Browser-persisted report queue (flushed to Supabase when online). */
export function createLocalStorageReportStore(): ReportStore {
  return {
    list: () => readLs(),
    listForRecipe: (recipeId) =>
      readLs().filter((r) => r.recipeId === recipeId),
    add: (report) => {
      const next = [...readLs(), report];
      writeLs(next);
    },
    clear: () => writeLs([]),
  };
}
