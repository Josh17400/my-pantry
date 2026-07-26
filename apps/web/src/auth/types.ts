/**
 * Auth session types — optional overlay on offline-first local use.
 * Signed-out users keep a fully working local pantry.
 */

export type AuthUser = {
  id: string;
  email: string | null;
  /** Optional profile name from provider metadata (may be null). */
  displayName?: string | null;
};

export type AuthSession = {
  user: AuthUser;
  /** Opaque access token; never log. */
  accessToken: string;
  expiresAt: number | null;
};

export type AuthStatus =
  | 'unknown'
  | 'signed_out'
  | 'signed_in'
  | 'loading'
  | 'error';

export type AuthState = {
  status: AuthStatus;
  session: AuthSession | null;
  error: string | null;
};

export type SignInCredentials = {
  email: string;
  password: string;
};

export type SignUpCredentials = {
  email: string;
  password: string;
};

export type AuthResult =
  | { ok: true; session: AuthSession | null }
  | { ok: false; error: string; code?: string };
