import type { Session, User } from '@supabase/supabase-js';

import type { AuthSession, AuthUser } from './types';

export function mapUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email ?? null,
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
