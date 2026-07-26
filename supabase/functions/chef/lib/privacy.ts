/**
 * Privacy helpers — never log pantry free text or model prompts at info.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface SafeLogFields {
  readonly attemptId?: string;
  readonly userId?: string;
  readonly householdId?: string | null;
  readonly status?: string;
  readonly code?: string;
  readonly model?: string;
  readonly estimatedCostUsd?: number;
  readonly promptTokens?: number;
  readonly completionTokens?: number;
  readonly intent?: string;
  readonly action?: string;
  readonly note?: string;
  readonly violationCount?: number;
}

const SENSITIVE_KEY =
  /message|content|prompt|pantry|recipe|rawText|dietary|catalog/i;

export function safeLog(
  level: LogLevel,
  message: string,
  fields: SafeLogFields = {},
): void {
  const cleaned: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (SENSITIVE_KEY.test(k)) continue;
    if (v === undefined) continue;
    if (
      typeof v === 'string' ||
      typeof v === 'number' ||
      typeof v === 'boolean' ||
      v === null
    ) {
      cleaned[k] = v;
    }
  }
  const payload = JSON.stringify({ level, message, ...cleaned });
  if (level === 'error') console.error(payload);
  else if (level === 'warn') console.warn(payload);
  else console.log(payload);
}
