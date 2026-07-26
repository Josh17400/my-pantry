/**
 * Client for the chef Edge Function.
 * OPENROUTER key stays on the server — never VITE_-prefixed.
 */

import { getSupabaseClient } from '../../supabase/config';
import type {
  CatalogIngredientRef,
  ChefIntent,
  ChefMessageRole,
  ChefResponse,
  DietaryProfile,
  PantrySnapshotItem,
} from './types';

export type ChefClient = {
  chat(input: {
    messages: readonly { role: ChefMessageRole; content: string }[];
    intent?: ChefIntent;
    pantry?: readonly PantrySnapshotItem[];
    dietary?: DietaryProfile;
    catalog?: readonly CatalogIngredientRef[];
    householdId?: string;
  }): Promise<ChefResponse>;
};

function functionUrl(): string | null {
  const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!envUrl) return null;
  return `${envUrl.replace(/\/$/, '')}/functions/v1/chef`;
}

async function authHeader(): Promise<Record<string, string>> {
  const client = getSupabaseClient();
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (anon) headers.apikey = anon;

  if (client) {
    const { data } = await client.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers.Authorization = `Bearer ${token}`;
    else if (anon) headers.Authorization = `Bearer ${anon}`;
  } else if (anon) {
    headers.Authorization = `Bearer ${anon}`;
  }
  return headers;
}

export const liveChefClient: ChefClient = {
  async chat(input) {
    const url = functionUrl();
    if (!url) {
      return {
        ok: false,
        code: 'missing_secret',
        message:
          'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
      };
    }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: await authHeader(),
        body: JSON.stringify({
          action: 'chat',
          messages: input.messages,
          intent: input.intent,
          pantry: input.pantry,
          dietary: input.dietary,
          catalog: input.catalog,
          householdId: input.householdId,
        }),
      });
      return (await res.json()) as ChefResponse;
    } catch (err) {
      const offline =
        typeof navigator !== 'undefined' && navigator.onLine === false;
      return {
        ok: false,
        code: offline ? 'offline' : 'network',
        message:
          err instanceof Error
            ? err.message
            : offline
              ? 'You are offline'
              : 'Network error',
      };
    }
  },
};

/** Dev / test fixture client. */
export function fixtureChefClient(
  responder: (input: Parameters<ChefClient['chat']>[0]) => ChefResponse | Promise<ChefResponse>,
): ChefClient {
  return {
    async chat(input) {
      return responder(input);
    },
  };
}
