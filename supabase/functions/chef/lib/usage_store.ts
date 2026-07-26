/**
 * Chef usage accounting store.
 *
 * Expected table (schema track owns migrations — do not create here):
 *
 *   chef_attempts (
 *     id text PK,
 *     user_id uuid not null,
 *     household_id text,
 *     status text not null,
 *     estimated_cost_usd numeric not null default 0,
 *     prompt_tokens int not null default 0,
 *     completion_tokens int not null default 0,
 *     model text,
 *     intent text not null default 'chat',
 *     month_key text not null,
 *     created_at timestamptz not null default now()
 *   )
 */

import type { ChefAttemptRecord, UsageSnapshot } from './types.ts';
import { monthKeyUtc } from './cost.ts';

export interface CreateChefAttemptInput {
  readonly id: string;
  readonly userId: string;
  readonly householdId: string | null;
  readonly status: ChefAttemptRecord['status'];
  readonly estimatedCostUsd: number;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly model: string | null;
  readonly intent: string;
}

export interface UsageStore {
  getSnapshot(userId: string, monthKey?: string): Promise<UsageSnapshot>;
  createAttempt(input: CreateChefAttemptInput): Promise<ChefAttemptRecord>;
  /** Recent request timestamps for rolling rate limit (ms epoch). */
  getRecentRequestTimes(
    userId: string,
    sinceMs: number,
  ): Promise<readonly number[]>;
}

function nowIso(): string {
  return new Date().toISOString();
}

export class InMemoryUsageStore implements UsageStore {
  readonly attempts = new Map<string, ChefAttemptRecord>();

  async getSnapshot(
    userId: string,
    monthKey: string = monthKeyUtc(),
  ): Promise<UsageSnapshot> {
    let requestCount = 0;
    let spentUsd = 0;
    for (const a of this.attempts.values()) {
      if (a.userId !== userId) continue;
      const mk = a.createdAt.slice(0, 7);
      if (mk !== monthKey) continue;
      requestCount += 1;
      if (a.estimatedCostUsd > 0) spentUsd += a.estimatedCostUsd;
    }
    return {
      userId,
      monthKey,
      requestCount,
      spentUsd: Math.round(spentUsd * 1_000_000) / 1_000_000,
    };
  }

  async createAttempt(
    input: CreateChefAttemptInput,
  ): Promise<ChefAttemptRecord> {
    const record: ChefAttemptRecord = {
      id: input.id,
      userId: input.userId,
      householdId: input.householdId,
      status: input.status,
      estimatedCostUsd: input.estimatedCostUsd,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      model: input.model,
      intent: input.intent,
      createdAt: nowIso(),
    };
    this.attempts.set(record.id, record);
    return record;
  }

  async getRecentRequestTimes(
    userId: string,
    sinceMs: number,
  ): Promise<readonly number[]> {
    const out: number[] = [];
    for (const a of this.attempts.values()) {
      if (a.userId !== userId) continue;
      const t = Date.parse(a.createdAt);
      if (Number.isFinite(t) && t >= sinceMs) out.push(t);
    }
    return out;
  }
}

type SupabaseLike = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        eq: (col: string, val: string) => {
          then?: unknown;
        } & PromiseLike<{ data: unknown; error: { message: string } | null }>;
        gte: (col: string, val: string) => PromiseLike<{
          data: unknown;
          error: { message: string } | null;
        }>;
      };
    };
    insert: (
      row: Record<string, unknown>,
    ) => PromiseLike<{ error: { message: string } | null }>;
  };
};

export class SupabaseUsageStore implements UsageStore {
  constructor(private readonly client: SupabaseLike) {}

  async getSnapshot(
    userId: string,
    monthKey: string = monthKeyUtc(),
  ): Promise<UsageSnapshot> {
    const { data, error } = await this.client
      .from('chef_attempts')
      .select('estimated_cost_usd, created_at')
      .eq('user_id', userId)
      .eq('month_key', monthKey);

    if (error || !Array.isArray(data)) {
      return { userId, monthKey, requestCount: 0, spentUsd: 0 };
    }

    let spentUsd = 0;
    for (const row of data as Array<{ estimated_cost_usd?: number }>) {
      const c = Number(row.estimated_cost_usd ?? 0);
      if (c > 0) spentUsd += c;
    }
    return {
      userId,
      monthKey,
      requestCount: data.length,
      spentUsd: Math.round(spentUsd * 1_000_000) / 1_000_000,
    };
  }

  async createAttempt(
    input: CreateChefAttemptInput,
  ): Promise<ChefAttemptRecord> {
    const record: ChefAttemptRecord = {
      id: input.id,
      userId: input.userId,
      householdId: input.householdId,
      status: input.status,
      estimatedCostUsd: input.estimatedCostUsd,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      model: input.model,
      intent: input.intent,
      createdAt: nowIso(),
    };
    await this.client.from('chef_attempts').insert({
      id: record.id,
      user_id: record.userId,
      household_id: record.householdId,
      status: record.status,
      estimated_cost_usd: record.estimatedCostUsd,
      prompt_tokens: record.promptTokens,
      completion_tokens: record.completionTokens,
      model: record.model,
      intent: record.intent,
      month_key: monthKeyUtc(new Date(record.createdAt)),
      created_at: record.createdAt,
    });
    return record;
  }

  async getRecentRequestTimes(
    userId: string,
    sinceMs: number,
  ): Promise<readonly number[]> {
    const sinceIso = new Date(sinceMs).toISOString();
    const { data, error } = await this.client
      .from('chef_attempts')
      .select('created_at')
      .eq('user_id', userId)
      .gte('created_at', sinceIso);

    if (error || !Array.isArray(data)) return [];
    return (data as Array<{ created_at?: string }>)
      .map((r) => Date.parse(r.created_at ?? ''))
      .filter((t) => Number.isFinite(t));
  }
}
