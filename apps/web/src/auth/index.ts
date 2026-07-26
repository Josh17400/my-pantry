export {
  AuthClient,
  type AuthClientOptions,
  type AuthListener,
  getAuthClient,
  resetAuthClient,
} from './client';
export { AuthNotConfiguredError, sanitizeAuthError } from './errors';
export { mapSession, mapUser } from './map-session';
export type {
  AuthResult,
  AuthSession,
  AuthState,
  AuthStatus,
  AuthUser,
  SignInCredentials,
  SignUpCredentials,
} from './types';
