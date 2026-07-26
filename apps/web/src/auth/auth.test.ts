/**
 * Auth client tests — mocked Supabase; no live project required.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthClient, resetAuthClient } from './client';
import { AuthNotConfiguredError, sanitizeAuthError } from './errors';
import { mapSession } from './map-session';

function mockSupabase(overrides: {
  getSession?: () => Promise<{ data: { session: unknown }; error: unknown }>;
  signIn?: (args: unknown) => Promise<{ data: unknown; error: unknown }>;
  signUp?: (args: unknown) => Promise<{ data: unknown; error: unknown }>;
  signOut?: () => Promise<{ error: unknown }>;
  onAuthStateChange?: (
    cb: (event: string, session: unknown) => void,
  ) => {
    data: { subscription: { unsubscribe: () => void } };
  };
} = {}) {
  const unsub = vi.fn();
  return {
    auth: {
      getSession:
        overrides.getSession ??
        (async () => ({ data: { session: null }, error: null })),
      signInWithPassword:
        overrides.signIn ??
        (async () => ({ data: { session: null, user: null }, error: null })),
      signUp:
        overrides.signUp ??
        (async () => ({ data: { session: null, user: null }, error: null })),
      signOut: overrides.signOut ?? (async () => ({ error: null })),
      onAuthStateChange:
        overrides.onAuthStateChange ??
        (() => ({
          data: { subscription: { unsubscribe: unsub } },
        })),
    },
  };
}

function fakeSession(userId = 'user-1', email = 'a@b.co') {
  return {
    access_token: 'tok_secret_do_not_log',
    expires_at: 9999999999,
    user: { id: userId, email },
  };
}

describe('AuthClient', () => {
  beforeEach(() => {
    resetAuthClient();
  });

  it('starts signed_out when Supabase client is null (unconfigured)', async () => {
    const auth = new AuthClient({ client: null });
    const state = await auth.initialize();
    expect(state.status).toBe('signed_out');
    expect(state.session).toBeNull();
    expect(auth.isConfigured()).toBe(false);
  });

  it('signIn fails clearly when not configured', async () => {
    const auth = new AuthClient({ client: null });
    const result = await auth.signInWithEmail({
      email: 'a@b.co',
      password: 'secret',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('AUTH_NOT_CONFIGURED');
      expect(result.error).toContain('not configured');
    }
  });

  it('loads persisted session on initialize', async () => {
    const session = fakeSession();
    const client = mockSupabase({
      getSession: async () => ({ data: { session }, error: null }),
    });
    const auth = new AuthClient({
      client: client as unknown as import('@supabase/supabase-js').SupabaseClient,
    });
    const state = await auth.initialize();
    expect(state.status).toBe('signed_in');
    expect(state.session?.user.id).toBe('user-1');
    expect(state.session?.user.email).toBe('a@b.co');
    // access token present but tests should not log it
    expect(state.session?.accessToken).toBe('tok_secret_do_not_log');
  });

  it('signInWithEmail sets signed_in on success', async () => {
    const session = fakeSession('u2', 'x@y.z');
    const client = mockSupabase({
      signIn: async () => ({
        data: { session, user: session.user },
        error: null,
      }),
    });
    const auth = new AuthClient({
      client: client as unknown as import('@supabase/supabase-js').SupabaseClient,
    });
    await auth.initialize();
    const result = await auth.signInWithEmail({
      email: 'x@y.z',
      password: 'pw',
    });
    expect(result.ok).toBe(true);
    expect(auth.getSession()?.user.id).toBe('u2');
  });

  it('signUpWithEmail may leave session null (email confirm)', async () => {
    const client = mockSupabase({
      signUp: async () => ({
        data: { session: null, user: { id: 'u3', email: 'n@e.w' } },
        error: null,
      }),
    });
    const auth = new AuthClient({
      client: client as unknown as import('@supabase/supabase-js').SupabaseClient,
    });
    await auth.initialize();
    const result = await auth.signUpWithEmail({
      email: 'n@e.w',
      password: 'pw',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.session).toBeNull();
    expect(auth.getState().status).toBe('signed_out');
  });

  it('signOut clears session', async () => {
    const session = fakeSession();
    const client = mockSupabase({
      getSession: async () => ({ data: { session }, error: null }),
      signOut: async () => ({ error: null }),
    });
    const auth = new AuthClient({
      client: client as unknown as import('@supabase/supabase-js').SupabaseClient,
    });
    await auth.initialize();
    expect(auth.getSession()).not.toBeNull();
    const result = await auth.signOut();
    expect(result.ok).toBe(true);
    expect(auth.getSession()).toBeNull();
    expect(auth.getState().status).toBe('signed_out');
  });

  it('notifies subscribers on state change', async () => {
    const auth = new AuthClient({ client: null });
    const seen: string[] = [];
    auth.subscribe((s) => seen.push(s.status));
    await auth.initialize();
    expect(seen).toContain('signed_out');
  });
});

describe('mapSession / sanitizeAuthError', () => {
  it('maps null session', () => {
    expect(mapSession(null)).toBeNull();
  });

  it('strips token-like strings from errors', () => {
    const msg = sanitizeAuthError(
      new Error('JWT eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def failed'),
    );
    expect(msg).toBe('Authentication failed');
  });

  it('AuthNotConfiguredError has stable code', () => {
    const e = new AuthNotConfiguredError();
    expect(e.code).toBe('AUTH_NOT_CONFIGURED');
  });
});
