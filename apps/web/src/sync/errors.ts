/** Sync errors — clear when remote schema is missing; never include tokens. */

export class SyncNotAuthenticatedError extends Error {
  readonly code = 'SYNC_NOT_AUTHENTICATED' as const;

  constructor(message = 'Sign in to sync with the cloud') {
    super(message);
    this.name = 'SyncNotAuthenticatedError';
  }
}

export class SyncOfflineError extends Error {
  readonly code = 'SYNC_OFFLINE' as const;

  constructor(message = 'Device is offline') {
    super(message);
    this.name = 'SyncOfflineError';
  }
}

export class SyncSchemaMissingError extends Error {
  readonly code = 'SYNC_SCHEMA_MISSING' as const;

  constructor(
    table: string,
    message = `Remote schema not applied: table "${table}" is missing. Run \`supabase db push\` then retry.`,
  ) {
    super(message);
    this.name = 'SyncSchemaMissingError';
  }
}

export class SyncRemoteError extends Error {
  readonly code = 'SYNC_REMOTE' as const;

  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'SyncRemoteError';
  }
}

/**
 * Map PostgREST / supabase-js errors into actionable messages.
 * Detects missing-relation failures so the owner knows to push migrations.
 */
export function mapRemoteError(err: unknown, context: string): Error {
  if (
    err instanceof SyncSchemaMissingError ||
    err instanceof SyncNotAuthenticatedError ||
    err instanceof SyncOfflineError ||
    err instanceof SyncRemoteError
  ) {
    return err;
  }

  const message =
    err instanceof Error
      ? err.message
      : typeof err === 'object' &&
          err !== null &&
          'message' in err &&
          typeof (err as { message: unknown }).message === 'string'
        ? (err as { message: string }).message
        : String(err);

  // Strip JWT-like strings if any leak into messages.
  const scrubbed = message.replace(/eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9._-]*/g, '[redacted]');

  const lower = scrubbed.toLowerCase();
  if (
    lower.includes('does not exist') ||
    lower.includes('schema cache') ||
    lower.includes('could not find the table') ||
    lower.includes('relation') && lower.includes('does not exist') ||
    /\b42p01\b/i.test(scrubbed) ||
    lower.includes('pgrst205')
  ) {
    const tableMatch =
      /table ['"]?([a-z0-9_.]+)['"]?/i.exec(scrubbed) ??
      /relation ['"]?([a-z0-9_.]+)['"]?/i.exec(scrubbed);
    const table = tableMatch?.[1] ?? 'pantry_txns';
    return new SyncSchemaMissingError(
      table,
      `Remote schema not applied (${context}): ${scrubbed}. Run \`supabase db push\`.`,
    );
  }

  return new SyncRemoteError(`${context}: ${scrubbed}`);
}

export function sanitizeSyncError(err: unknown): string {
  if (err instanceof Error) {
    return err.message.replace(/eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9._-]*/g, '[redacted]');
  }
  return String(err);
}
