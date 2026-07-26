/**
 * Account deletion — actually deletes when Supabase is configured.
 * Reachable from Settings. Required by both stores.
 */

import { getSupabaseClient } from '../../supabase/config';

export type DeleteAccountResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: string; readonly code?: string };

/**
 * Call the entitlements Edge Function delete-account action.
 * Requires a signed-in session. Server uses service role to delete the auth user
 * and cascade household membership (RLS / FK).
 */
export async function requestAccountDeletion(): Promise<DeleteAccountResult> {
  const client = getSupabaseClient();
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  if (!client || !base) {
    return {
      ok: false,
      error:
        'Account deletion needs a signed-in cloud account. Local-only data can be cleared by uninstalling the app or wiping site data.',
      code: 'not_configured',
    };
  }

  const { data: sessionData } = await client.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    return {
      ok: false,
      error: 'Sign in first to delete your cloud account.',
      code: 'unauthorized',
    };
  }

  try {
    const url = `${base.replace(/\/$/, '')}/functions/v1/entitlements`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(anon ? { apikey: anon } : {}),
      },
      body: JSON.stringify({ action: 'delete_account' }),
    });
    const body = (await res.json()) as {
      ok?: boolean;
      error?: string;
      message?: string;
    };
    if (!res.ok || body.ok === false) {
      return {
        ok: false,
        error: body.error ?? body.message ?? `Deletion failed (${res.status})`,
        code: String(res.status),
      };
    }
    // Sign out locally after server deleted the user.
    await client.auth.signOut().catch(() => undefined);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      code: 'network',
    };
  }
}
