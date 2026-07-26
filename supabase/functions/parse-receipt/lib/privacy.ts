/**
 * Privacy helpers — parse and discard by default.
 * Never log image bytes or raw receipt text at info level.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface SafeLogFields {
  readonly attemptId?: string;
  readonly userId?: string;
  readonly householdId?: string | null;
  readonly status?: string;
  readonly code?: string;
  readonly model?: string;
  readonly imageCount?: number;
  readonly estimatedCostUsd?: number;
  readonly promptTokens?: number;
  readonly completionTokens?: number;
  readonly locale?: string;
  readonly lineCount?: number;
  readonly groceryConfidence?: number;
  readonly schemaRetryUsed?: boolean;
  readonly action?: string;
  /** Free-form non-PII note (no receipt text, no addresses). */
  readonly note?: string;
}

const SENSITIVE_KEY =
  /rawText|guessedName|storeAddress|storeName|image|base64|data:image|card|loyalty|receiptText|content|prompt/i;

/**
 * Structured log line safe for production.
 * Strips any accidental sensitive keys from the fields object.
 */
export function safeLog(level: LogLevel, message: string, fields: SafeLogFields = {}): void {
  const cleaned: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (SENSITIVE_KEY.test(k)) continue;
    if (v === undefined) continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v === null) {
      cleaned[k] = v;
    }
  }
  const payload = JSON.stringify({ level, message, ...cleaned });
  if (level === 'error') console.error(payload);
  else if (level === 'warn') console.warn(payload);
  else console.log(payload);
}

/** Redact for error messages that might surface model snippets. */
export function redactSnippet(s: string, max = 0): string {
  if (max <= 0) return '[redacted]';
  if (s.length <= max) return '[redacted-short]';
  return `[redacted len=${s.length}]`;
}

/**
 * Validate that retainImage path is not smuggling bytes into logs later.
 * Retention is opt-in and only via private storage URLs — never inline base64 retention here.
 */
export function retentionAllowed(retainImage: boolean | undefined): boolean {
  return retainImage === true;
}
