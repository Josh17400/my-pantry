/**
 * Auth client — email sign-in/up, session persistence, sign-out.
 *
 * Offline-first: absence of Supabase env or a signed-out user never blocks
 * local pantry operations. Call sites treat null session as "local only".
 */

import type { AuthChangeEvent, Session, SupabaseClient } from '@supabase/supabase-js';

import { getSupabaseClient } from '../supabase/config';
import { AuthNotConfiguredError, sanitizeAuthError } from './errors';
import { mapSession } from './map-session';
import type {
  AuthResult,
  AuthSession,
  AuthState,
  SignInCredentials,
  SignUpCredentials,
} from './types';

export type AuthListener = (state: AuthState) => void;

export type AuthClientOptions = {
  /** Inject a client (tests). When omitted, uses getSupabaseClient(). */
  client?: SupabaseClient | null;
};

/**
 * Thin wrapper around Supabase Auth. Does not gate the app.
 */
export class AuthClient {
  private client: SupabaseClient | null;
  private state: AuthState = {
    status: 'unknown',
    session: null,
    error: null,
  };
  private listeners = new Set<AuthListener>();
  private unsubAuth: (() => void) | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(options: AuthClientOptions = {}) {
    this.client =
      options.client !== undefined ? options.client : getSupabaseClient();
  }

  getState(): AuthState {
    return this.state;
  }

  getSession(): AuthSession | null {
    return this.state.session;
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  subscribe(listener: AuthListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Load persisted session (if any) and subscribe to auth changes.
   * Safe to call multiple times; concurrent callers share one init.
   */
  async initialize(): Promise<AuthState> {
    if (!this.initPromise) {
      this.initPromise = this.doInitialize();
    }
    await this.initPromise;
    return this.state;
  }

  private async doInitialize(): Promise<void> {
    if (!this.client) {
      this.setState({
        status: 'signed_out',
        session: null,
        error: null,
      });
      return;
    }

    this.setState({ ...this.state, status: 'loading', error: null });

    try {
      const { data, error } = await this.client.auth.getSession();
      if (error) {
        this.setState({
          status: 'signed_out',
          session: null,
          error: sanitizeAuthError(error),
        });
      } else {
        const session = mapSession(data.session);
        this.setState({
          status: session ? 'signed_in' : 'signed_out',
          session,
          error: null,
        });
      }

      const { data: sub } = this.client.auth.onAuthStateChange(
        (_event: AuthChangeEvent, session: Session | null) => {
          const mapped = mapSession(session);
          this.setState({
            status: mapped ? 'signed_in' : 'signed_out',
            session: mapped,
            error: null,
          });
        },
      );
      this.unsubAuth = () => {
        sub.subscription.unsubscribe();
      };
    } catch (err) {
      this.setState({
        status: 'signed_out',
        session: null,
        error: sanitizeAuthError(err),
      });
    }
  }

  async signInWithEmail(credentials: SignInCredentials): Promise<AuthResult> {
    if (!this.client) {
      return {
        ok: false,
        error: new AuthNotConfiguredError().message,
        code: 'AUTH_NOT_CONFIGURED',
      };
    }
    this.setState({ ...this.state, status: 'loading', error: null });
    try {
      const { data, error } = await this.client.auth.signInWithPassword({
        email: credentials.email.trim(),
        password: credentials.password,
      });
      if (error) {
        const message = sanitizeAuthError(error);
        this.setState({
          status: this.state.session ? 'signed_in' : 'signed_out',
          session: this.state.session,
          error: message,
        });
        return { ok: false, error: message, code: error.name };
      }
      const session = mapSession(data.session);
      this.setState({
        status: session ? 'signed_in' : 'signed_out',
        session,
        error: null,
      });
      return { ok: true, session };
    } catch (err) {
      const message = sanitizeAuthError(err);
      this.setState({
        status: this.state.session ? 'signed_in' : 'signed_out',
        session: this.state.session,
        error: message,
      });
      return { ok: false, error: message };
    }
  }

  async signUpWithEmail(credentials: SignUpCredentials): Promise<AuthResult> {
    if (!this.client) {
      return {
        ok: false,
        error: new AuthNotConfiguredError().message,
        code: 'AUTH_NOT_CONFIGURED',
      };
    }
    this.setState({ ...this.state, status: 'loading', error: null });
    try {
      const { data, error } = await this.client.auth.signUp({
        email: credentials.email.trim(),
        password: credentials.password,
      });
      if (error) {
        const message = sanitizeAuthError(error);
        this.setState({
          status: this.state.session ? 'signed_in' : 'signed_out',
          session: this.state.session,
          error: message,
        });
        return { ok: false, error: message, code: error.name };
      }
      // Email confirmation may leave session null until confirmed.
      const session = mapSession(data.session);
      this.setState({
        status: session ? 'signed_in' : 'signed_out',
        session,
        error: null,
      });
      return { ok: true, session };
    } catch (err) {
      const message = sanitizeAuthError(err);
      this.setState({
        status: this.state.session ? 'signed_in' : 'signed_out',
        session: this.state.session,
        error: message,
      });
      return { ok: false, error: message };
    }
  }

  async signOut(): Promise<AuthResult> {
    if (!this.client) {
      this.setState({ status: 'signed_out', session: null, error: null });
      return { ok: true, session: null };
    }
    try {
      const { error } = await this.client.auth.signOut();
      if (error) {
        const message = sanitizeAuthError(error);
        this.setState({ ...this.state, error: message });
        return { ok: false, error: message };
      }
      this.setState({ status: 'signed_out', session: null, error: null });
      return { ok: true, session: null };
    } catch (err) {
      const message = sanitizeAuthError(err);
      this.setState({ ...this.state, error: message });
      return { ok: false, error: message };
    }
  }

  /** Best-effort cleanup (tests / HMR). */
  dispose(): void {
    this.unsubAuth?.();
    this.unsubAuth = null;
    this.listeners.clear();
  }

  private setState(next: AuthState): void {
    this.state = next;
    for (const listener of this.listeners) {
      listener(next);
    }
  }
}

let defaultAuth: AuthClient | null = null;

/** Process-wide auth client (lazy). Tests should construct AuthClient directly. */
export function getAuthClient(): AuthClient {
  if (!defaultAuth) {
    defaultAuth = new AuthClient();
  }
  return defaultAuth;
}

/** Reset singleton (tests). */
export function resetAuthClient(): void {
  defaultAuth?.dispose();
  defaultAuth = null;
}
