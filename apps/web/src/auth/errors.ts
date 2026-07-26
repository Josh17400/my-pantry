/** User-facing auth errors — never include tokens or passwords. */

export class AuthNotConfiguredError extends Error {
  readonly code = 'AUTH_NOT_CONFIGURED' as const;

  constructor(
    message = 'Supabase is not configured (set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY)',
  ) {
    super(message);
    this.name = 'AuthNotConfiguredError';
  }
}

export function sanitizeAuthError(err: unknown): string {
  if (err instanceof AuthNotConfiguredError) return err.message;
  if (err instanceof Error) {
    const msg = err.message;
    // Strip anything that looks like a bearer token / long secret.
    if (/eyJ[a-zA-Z0-9_-]{20,}/.test(msg) || /Bearer\s+\S+/i.test(msg)) {
      return 'Authentication failed';
    }
    return msg;
  }
  return 'Authentication failed';
}
