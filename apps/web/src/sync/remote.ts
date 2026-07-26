/**
 * Supabase remote port — PostgREST via @supabase/supabase-js.
 * Maps missing tables to SyncSchemaMissingError (clear failure mode).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { mapRemoteError } from './errors';
import { assertRemoteTxnRow, type SyncRemotePort } from './ports';
import type { PushResult, RemoteTxnInsert } from './types';
import { EPOCH_CURSOR } from './types';

function isEmptyPage(data: unknown): data is unknown[] {
  return Array.isArray(data);
}

export function createSupabaseRemotePort(client: SupabaseClient): SyncRemotePort {
  return {
    async myHouseholdIds() {
      try {
        const rpc = await client.rpc('my_household_ids');
        if (!rpc.error && Array.isArray(rpc.data)) {
          return (rpc.data as unknown[]).map(String);
        }
        // Fallback: select memberships
        const { data, error } = await client
          .from('household_members')
          .select('household_id');
        if (error) throw mapRemoteError(error, 'myHouseholdIds');
        const ids = (data ?? []).map((row: { household_id: string }) =>
          String(row.household_id),
        );
        return [...new Set(ids)];
      } catch (err) {
        throw mapRemoteError(err, 'myHouseholdIds');
      }
    },

    async pushTxns(rows: RemoteTxnInsert[]): Promise<PushResult> {
      if (rows.length === 0) {
        return { acknowledgedClientTxnIds: [], acceptedAtByClientTxnId: {} };
      }
      try {
        // ignoreDuplicates → ON CONFLICT DO NOTHING (idempotent replay).
        const { data, error } = await client
          .from('pantry_txns')
          .upsert(rows, {
            onConflict: 'household_id,client_txn_id',
            ignoreDuplicates: true,
          })
          .select('client_txn_id, accepted_at');

        if (error) throw mapRemoteError(error, 'pushTxns');

        const acceptedAtByClientTxnId: Record<string, string> = {};
        const returned = isEmptyPage(data) ? data : [];
        for (const row of returned) {
          const r = row as { client_txn_id: string; accepted_at: string };
          acceptedAtByClientTxnId[String(r.client_txn_id)] = String(
            r.accepted_at,
          );
        }

        // With ignoreDuplicates, already-existing rows may not appear in
        // returning. Treat every pushed client_txn_id as acknowledged once
        // the request succeeds (conflict is a no-op success).
        const acknowledgedClientTxnIds = rows.map((r) => r.client_txn_id);
        const now = new Date().toISOString();
        for (const id of acknowledgedClientTxnIds) {
          if (!acceptedAtByClientTxnId[id]) {
            acceptedAtByClientTxnId[id] = now;
          }
        }

        return { acknowledgedClientTxnIds, acceptedAtByClientTxnId };
      } catch (err) {
        throw mapRemoteError(err, 'pushTxns');
      }
    },

    async pullTxns(householdId, cursor, pageSize) {
      try {
        const effectiveCursor =
          cursor && cursor.length > 0 ? cursor : EPOCH_CURSOR;
        const { data, error } = await client
          .from('pantry_txns')
          .select('*')
          .eq('household_id', householdId)
          .gt('accepted_at', effectiveCursor)
          .order('accepted_at', { ascending: true })
          .limit(pageSize);

        if (error) throw mapRemoteError(error, 'pullTxns');

        const rows = (data ?? []).map((raw) => assertRemoteTxnRow(raw));
        const last = rows[rows.length - 1];
        const nextCursor = last?.accepted_at ?? effectiveCursor;
        return {
          rows,
          nextCursor,
          exhausted: rows.length < pageSize,
        };
      } catch (err) {
        throw mapRemoteError(err, 'pullTxns');
      }
    },

    async pullLocations(householdId) {
      try {
        const { data, error } = await client
          .from('locations')
          .select('*')
          .eq('household_id', householdId);
        if (error) throw mapRemoteError(error, 'pullLocations');
        return (data ?? []) as {
          id: string;
          household_id: string;
          name: string;
          icon: string;
          tint: string;
          parent_id: string | null;
          sort_order: number;
        }[];
      } catch (err) {
        throw mapRemoteError(err, 'pullLocations');
      }
    },

    async pullRecipes(householdId) {
      try {
        const { data, error } = await client
          .from('recipes')
          .select('*')
          .eq('household_id', householdId);
        if (error) throw mapRemoteError(error, 'pullRecipes');
        return (data ?? []) as {
          id: string;
          household_id: string | null;
          title: string;
          servings: number;
          yield_note: string | null;
          prep_min: number | null;
          cook_min: number | null;
          author_id: string | null;
          visibility: string;
          forked_from: string | null;
          tags: unknown;
          image_url: string | null;
          created_at: string;
          updated_at: string;
        }[];
      } catch (err) {
        throw mapRemoteError(err, 'pullRecipes');
      }
    },

    async pullRecipeLines(recipeId) {
      try {
        const { data, error } = await client
          .from('recipe_lines')
          .select('*')
          .eq('recipe_id', recipeId)
          .order('sort_order', { ascending: true });
        if (error) throw mapRemoteError(error, 'pullRecipeLines');
        return (data ?? []) as {
          id: string;
          recipe_id: string;
          sort_order: number;
          ingredient_id: string | null;
          form_id: string | null;
          raw_text: string;
          qty: number | null;
          unit: string | null;
          optional: boolean;
          group_id: string | null;
          substitutes: unknown;
          unknown_allergens: boolean;
          non_quantified: boolean;
          qty_high: number | null;
          qty_low: number | null;
          is_range: boolean;
        }[];
      } catch (err) {
        throw mapRemoteError(err, 'pullRecipeLines');
      }
    },

    async pullRecipeSteps(recipeId) {
      try {
        const { data, error } = await client
          .from('recipe_steps')
          .select('*')
          .eq('recipe_id', recipeId)
          .order('sort_order', { ascending: true });
        if (error) throw mapRemoteError(error, 'pullRecipeSteps');
        return (data ?? []) as {
          id: string;
          recipe_id: string;
          sort_order: number;
          text: string;
          duration_sec: number | null;
          timer_label: string | null;
        }[];
      } catch (err) {
        throw mapRemoteError(err, 'pullRecipeSteps');
      }
    },

    async pullPantryItemsMeta(householdId) {
      try {
        const { data, error } = await client
          .from('pantry_items')
          .select('*')
          .eq('household_id', householdId);
        if (error) throw mapRemoteError(error, 'pullPantryItemsMeta');
        return (data ?? []) as {
          household_id: string;
          ingredient_id: string;
          form_id: string;
          location_id: string | null;
          qty_base: number;
          dim: string;
          par_level_base: number;
          low_threshold_pct: number;
          last_verified_at: string | null;
          unverified_cook_count: number;
          opened_at: string | null;
          expires_at: string | null;
          updated_at: string;
          watermark_cursor: string | null;
          last_absolute_cursor: string | null;
          is_negative: boolean;
          conflict: boolean;
        }[];
      } catch (err) {
        throw mapRemoteError(err, 'pullPantryItemsMeta');
      }
    },

    async upsertLocations(rows) {
      if (rows.length === 0) return;
      try {
        const { error } = await client.from('locations').upsert(rows, {
          onConflict: 'id',
        });
        if (error) throw mapRemoteError(error, 'upsertLocations');
      } catch (err) {
        throw mapRemoteError(err, 'upsertLocations');
      }
    },

    async upsertRecipes(rows) {
      if (rows.length === 0) return;
      try {
        const { error } = await client.from('recipes').upsert(rows, {
          onConflict: 'id',
        });
        if (error) throw mapRemoteError(error, 'upsertRecipes');
      } catch (err) {
        throw mapRemoteError(err, 'upsertRecipes');
      }
    },

    async replaceRecipeChildren(recipeId, lines, steps) {
      try {
        const delLines = await client
          .from('recipe_lines')
          .delete()
          .eq('recipe_id', recipeId);
        if (delLines.error) {
          throw mapRemoteError(delLines.error, 'replaceRecipeChildren.lines.del');
        }
        const delSteps = await client
          .from('recipe_steps')
          .delete()
          .eq('recipe_id', recipeId);
        if (delSteps.error) {
          throw mapRemoteError(delSteps.error, 'replaceRecipeChildren.steps.del');
        }
        if (lines.length > 0) {
          const ins = await client.from('recipe_lines').insert(lines);
          if (ins.error) {
            throw mapRemoteError(ins.error, 'replaceRecipeChildren.lines.ins');
          }
        }
        if (steps.length > 0) {
          const ins = await client.from('recipe_steps').insert(steps);
          if (ins.error) {
            throw mapRemoteError(ins.error, 'replaceRecipeChildren.steps.ins');
          }
        }
      } catch (err) {
        throw mapRemoteError(err, 'replaceRecipeChildren');
      }
    },
  };
}
