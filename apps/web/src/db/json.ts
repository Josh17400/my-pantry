/** Safe JSON helpers for text columns. */

export function parseJsonArray(value: string | null | undefined): string[] {
  if (value == null || value === '') return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((x) => String(x));
  } catch {
    return [];
  }
}

export function stringifyJsonArray(value: readonly string[] | undefined | null): string | null {
  if (value == null) return null;
  return JSON.stringify([...value]);
}

export function parseJsonStringArrayRequired(value: string): string[] {
  return parseJsonArray(value);
}
