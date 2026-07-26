import type { Session, User } from '@supabase/supabase-js';

import type { AuthSession, AuthUser } from './types';

export function mapUser(user: User): AuthUser {
  const meta = user.user_metadata as
    | { full_name?: string; name?: string; display_name?: string }
    | undefined;
  const displayName =
    meta?.full_name?.trim() ||
    meta?.name?.trim() ||
    meta?.display_name?.trim() ||
    null;
  return {
    id: user.id,
    email: user.email ?? null,
    displayName,
  };
}

export function mapSession(session: Session | null): AuthSession | null {
  if (!session?.user) return null;
  return {
    user: mapUser(session.user),
    accessToken: session.access_token,
    expiresAt: session.expires_at ?? null,
  };
}
