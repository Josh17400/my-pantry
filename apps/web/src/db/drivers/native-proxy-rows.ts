/**
 * Capacitor SQLite → Drizzle sqlite-proxy row normalization.
 *
 * Capacitor (and better-sqlite3 in object mode) return SELECT rows as objects
 * keyed by bare result-column names. Duplicate bare names (e.g. ingredients.name
 * + locations.name both expose as "name") collapse; last write wins. Drizzle's
 * proxy contract requires positional arrays, so Object.values() then shifts every
 * field after the collision.
 *
 * Fix: rewrite SELECTs so every result column is uniquely aliased (`__gp_0` …),
 * then read values back in alias order. That makes collisions structurally
 * impossible. If a row object's entry count still disagrees with the statement's
 * result-column count, throw with the SQL — never silently mis-map inventory.
 */

/** Prefix for synthetic positional aliases injected into SELECT lists. */
export const PROXY_COL_ALIAS_PREFIX = '__gp_';

export class ProxyColumnMismatchError extends Error {
  readonly sqlText: string;
  readonly expectedColumns: number;
  readonly actualEntries: number;

  constructor(sqlText: string, expectedColumns: number, actualEntries: number) {
    super(
      `Native SQLite proxy row column mismatch: SQL expects ${expectedColumns} ` +
        `result column(s) but row object has ${actualEntries} entr(y/ies). ` +
        `Duplicate bare column names likely collapsed. SQL: ${sqlText}`,
    );
    this.name = 'ProxyColumnMismatchError';
    this.sqlText = sqlText;
    this.expectedColumns = expectedColumns;
    this.actualEntries = actualEntries;
  }
}

/**
 * Split a comma-separated list on top-level commas only (depth 0, outside quotes).
 */
export function splitTopLevelCommaList(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let start = 0;

  for (let i = 0; i < list.length; i++) {
    const ch = list[i]!;
    if (inSingle) {
      if (ch === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      if (ch === '"') inDouble = false;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      continue;
    }
    if (ch === '(') {
      depth += 1;
      continue;
    }
    if (ch === ')') {
      depth -= 1;
      continue;
    }
    if (ch === ',' && depth === 0) {
      const part = list.slice(start, i).trim();
      if (part.length > 0) parts.push(part);
      start = i + 1;
    }
  }
  const tail = list.slice(start).trim();
  if (tail.length > 0) parts.push(tail);
  return parts;
}

/**
 * Find the main SELECT keyword index, skipping WITH … CTE preambles.
 * Returns -1 when the statement is not a SELECT we should rewrite.
 */
export function findMainSelectIndex(sqlText: string): number {
  const s = sqlText.trimStart();
  const lower = s.toLowerCase();
  if (lower.startsWith('select')) {
    return sqlText.length - s.length;
  }
  if (!lower.startsWith('with')) {
    return -1;
  }

  // Walk past WITH cte AS (…), … until a top-level SELECT.
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  const base = sqlText.length - s.length;
  // Start after "with"
  for (let i = 4; i < s.length; i++) {
    const ch = s[i]!;
    if (inSingle) {
      if (ch === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      if (ch === '"') inDouble = false;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      continue;
    }
    if (ch === '(') {
      depth += 1;
      continue;
    }
    if (ch === ')') {
      depth -= 1;
      continue;
    }
    if (depth === 0 && matchesKeywordAt(s, i, 'select')) {
      return base + i;
    }
  }
  return -1;
}

function matchesKeywordAt(s: string, index: number, keyword: string): boolean {
  const slice = s.slice(index, index + keyword.length).toLowerCase();
  if (slice !== keyword) return false;
  const before = index === 0 ? ' ' : s[index - 1]!;
  const after = s[index + keyword.length] ?? ' ';
  return !/[a-z0-9_]/i.test(before) && !/[a-z0-9_]/i.test(after);
}

/**
 * Locate the top-level FROM that ends the select-list (not FROM inside subqueries).
 */
export function findSelectListRange(
  sqlText: string,
): { selectKwEnd: number; fromStart: number } | null {
  const selectIdx = findMainSelectIndex(sqlText);
  if (selectIdx < 0) return null;

  const afterSelect = selectIdx + 'select'.length;
  let i = afterSelect;
  // Optional DISTINCT / ALL
  const rest = sqlText.slice(i);
  const distinctMatch = /^\s+(distinct|all)\b/i.exec(rest);
  if (distinctMatch) {
    i += distinctMatch[0].length;
  }

  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  for (; i < sqlText.length; i++) {
    const ch = sqlText[i]!;
    if (inSingle) {
      if (ch === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      if (ch === '"') inDouble = false;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      continue;
    }
    if (ch === '(') {
      depth += 1;
      continue;
    }
    if (ch === ')') {
      depth -= 1;
      continue;
    }
    if (depth === 0 && matchesKeywordAt(sqlText, i, 'from')) {
      return { selectKwEnd: afterSelect + (distinctMatch ? distinctMatch[0].length : 0), fromStart: i };
    }
  }
  return null;
}

/**
 * Strip a trailing AS alias from a select expression, if present.
 *
 * The `as` must be found at depth 0 and outside quotes — a regex alone would
 * also match inside a string literal (`'sold as seen'`) and silently truncate
 * the expression, which at this layer means mis-mapped columns again.
 */
export function stripTrailingAlias(expr: string): string {
  const trimmed = expr.trim();

  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let lastAsIndex = -1;

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i]!;
    if (inSingle) {
      if (ch === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      if (ch === '"') inDouble = false;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      continue;
    }
    if (ch === '(') {
      depth += 1;
      continue;
    }
    if (ch === ')') {
      depth -= 1;
      continue;
    }
    if (depth === 0 && matchesKeywordAt(trimmed, i, 'as')) {
      lastAsIndex = i;
    }
  }

  if (lastAsIndex < 0) return trimmed;

  // Everything after the final top-level AS must be a single alias token.
  const alias = trimmed.slice(lastAsIndex + 'as'.length).trim();
  if (!/^("[^"]+"|[a-zA-Z_][\w$]*)$/.test(alias)) return trimmed;

  return trimmed.slice(0, lastAsIndex).trim();
}

export type AliasedSelectRewrite = {
  sql: string;
  columnCount: number;
};

/**
 * Rewrite a SELECT so every result column is `expr AS "__gp_N"`.
 * Returns null when the statement is not a rewritable SELECT (PRAGMA, etc.).
 * UNION / compound queries are left alone (null) so we do not mangle them.
 */
export function rewriteSelectWithPositionalAliases(
  sqlText: string,
): AliasedSelectRewrite | null {
  const trimmed = sqlText.trim();
  // Compound queries: too easy to get wrong; rely on loud failure instead.
  if (hasTopLevelSetOp(trimmed)) {
    return null;
  }

  const range = findSelectListRange(sqlText);
  if (!range) return null;

  const list = sqlText.slice(range.selectKwEnd, range.fromStart).trim();
  if (list.length === 0 || list === '*') {
    // SELECT * — cannot safely invent aliases without expanding columns.
    return null;
  }

  const exprs = splitTopLevelCommaList(list);
  if (exprs.length === 0) return null;

  const rewrittenList = exprs
    .map((expr, index) => {
      const bare = stripTrailingAlias(expr);
      return `${bare} as "${PROXY_COL_ALIAS_PREFIX}${index}"`;
    })
    .join(', ');

  // Preserve SELECT / DISTINCT / ALL prefix through selectKwEnd.
  const selectIdx = findMainSelectIndex(sqlText);
  if (selectIdx < 0) return null;
  const head = sqlText.slice(0, range.selectKwEnd);
  const tail = sqlText.slice(range.fromStart);
  return {
    sql: `${head} ${rewrittenList} ${tail}`,
    columnCount: exprs.length,
  };
}

function hasTopLevelSetOp(sqlText: string): boolean {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < sqlText.length; i++) {
    const ch = sqlText[i]!;
    if (inSingle) {
      if (ch === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      if (ch === '"') inDouble = false;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      continue;
    }
    if (ch === '(') {
      depth += 1;
      continue;
    }
    if (ch === ')') {
      depth -= 1;
      continue;
    }
    if (depth === 0) {
      if (
        matchesKeywordAt(sqlText, i, 'union') ||
        matchesKeywordAt(sqlText, i, 'intersect') ||
        matchesKeywordAt(sqlText, i, 'except')
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Count result columns in a SELECT (best-effort). Null when not a SELECT or
 * when the list is `*`.
 */
export function countSelectResultColumns(sqlText: string): number | null {
  const rewritten = rewriteSelectWithPositionalAliases(sqlText);
  if (rewritten) return rewritten.columnCount;

  const range = findSelectListRange(sqlText);
  if (!range) return null;
  const list = sqlText.slice(range.selectKwEnd, range.fromStart).trim();
  if (list.length === 0 || list === '*') return null;
  const exprs = splitTopLevelCommaList(list);
  return exprs.length > 0 ? exprs.length : null;
}

/**
 * Strip the iOS Capacitor sentinel first row `{ ios_columns: string[] }`.
 */
export function stripIosColumnsRow(raw: unknown[]): {
  rows: unknown[];
  iosColumns: string[] | null;
} {
  if (raw.length === 0) {
    return { rows: raw, iosColumns: null };
  }
  const first = raw[0];
  if (
    first !== null &&
    typeof first === 'object' &&
    !Array.isArray(first) &&
    Object.prototype.hasOwnProperty.call(first, 'ios_columns')
  ) {
    const cols = (first as { ios_columns: unknown }).ios_columns;
    return {
      rows: raw.slice(1),
      iosColumns: Array.isArray(cols) ? cols.map(String) : null,
    };
  }
  return { rows: raw, iosColumns: null };
}

/**
 * Convert one Capacitor/object row into a positional value array.
 *
 * Prefers `__gp_N` keys (after rewrite). Falls back to Object.values with a
 * hard length check against expectedColumns.
 */
export function objectRowToValues(
  row: Record<string, unknown>,
  sqlText: string,
  expectedColumns: number | null,
): unknown[] {
  // Positional aliases from rewriteSelectWithPositionalAliases.
  if (Object.prototype.hasOwnProperty.call(row, `${PROXY_COL_ALIAS_PREFIX}0`)) {
    const count =
      expectedColumns ??
      Object.keys(row).filter((k) => k.startsWith(PROXY_COL_ALIAS_PREFIX))
        .length;
    const values: unknown[] = [];
    for (let i = 0; i < count; i++) {
      const key = `${PROXY_COL_ALIAS_PREFIX}${i}`;
      if (!Object.prototype.hasOwnProperty.call(row, key)) {
        throw new ProxyColumnMismatchError(
          sqlText,
          count,
          Object.keys(row).length,
        );
      }
      values.push(row[key]);
    }
    return values;
  }

  // Drop iOS metadata key if it ever lands on a data row.
  const entries = Object.entries(row).filter(([k]) => k !== 'ios_columns');
  const values = entries.map(([, v]) => v);

  if (expectedColumns !== null && values.length !== expectedColumns) {
    throw new ProxyColumnMismatchError(sqlText, expectedColumns, values.length);
  }

  return values;
}

/**
 * Normalize Capacitor `query()` values into Drizzle proxy rows (`unknown[][]`).
 *
 * When `rewrite` is provided (caller already rewrote SQL), `expectedColumns`
 * comes from that rewrite. Otherwise we count from the original SQL.
 */
export function normalizeProxyRows(
  sqlText: string,
  raw: unknown[],
  expectedColumns?: number | null,
): unknown[][] {
  const { rows } = stripIosColumnsRow(raw);
  const expected =
    expectedColumns !== undefined
      ? expectedColumns
      : countSelectResultColumns(sqlText);

  return rows.map((row) => {
    if (Array.isArray(row)) {
      if (expected !== null && row.length !== expected) {
        throw new ProxyColumnMismatchError(sqlText, expected, row.length);
      }
      return row as unknown[];
    }
    if (row !== null && typeof row === 'object') {
      return objectRowToValues(row as Record<string, unknown>, sqlText, expected);
    }
    return [row];
  });
}

/**
 * Prepare a SELECT for Capacitor: inject positional aliases when possible.
 * Non-SELECT statements pass through unchanged.
 */
export function prepareProxySelect(sqlText: string): {
  sql: string;
  columnCount: number | null;
} {
  const rewritten = rewriteSelectWithPositionalAliases(sqlText);
  if (rewritten) {
    return { sql: rewritten.sql, columnCount: rewritten.columnCount };
  }
  return { sql: sqlText, columnCount: countSelectResultColumns(sqlText) };
}
