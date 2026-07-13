import { BigQuery } from '@google-cloud/bigquery';
import { getTableRef } from '../schema/nipt.schema.js';
import type { GlobalFilters } from '../types.js';

let client: BigQuery | undefined;

function getClient(): BigQuery {
  if (!client) {
    client = new BigQuery({ projectId: process.env.BQ_PROJECT_ID });
  }
  return client;
}

const DISALLOWED_KEYWORDS =
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|MERGE|TRUNCATE|GRANT|REVOKE|CALL)\b/i;

/**
 * Rejects anything that isn't a single read-only SELECT/WITH statement against
 * the configured table. This is defense-in-depth, not the real security
 * boundary — the BigQuery service account should also be scoped to read-only
 * access on this one dataset.
 */
function assertSafeSelect(sql: string): void {
  const trimmed = sql.trim();

  if (trimmed.includes(';') && !trimmed.endsWith(';')) {
    throw new Error('Only a single SQL statement is allowed.');
  }
  if (!/^(SELECT|WITH)\b/i.test(trimmed)) {
    throw new Error('Only SELECT queries are allowed.');
  }
  if (DISALLOWED_KEYWORDS.test(trimmed)) {
    throw new Error('Query contains a disallowed keyword.');
  }
  const tableRef = getTableRef();
  const hasTable =
    trimmed.includes(tableRef) ||
    trimmed.includes(`\`${tableRef}\``);
  if (!hasTable) {
    throw new Error('Query must reference the configured table.');
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Applies global dashboard filters by swapping the table reference for a
 * filtered subquery, so the filters hit the base rows no matter how the
 * stored SQL aggregates them. Filter values are validated/escaped here since
 * they come from the client.
 */
function applyFilters(sql: string, filters?: GlobalFilters): string {
  if (!filters) return sql;

  const clauses: string[] = [];
  if (filters.dateFrom) {
    if (!DATE_RE.test(filters.dateFrom)) throw new Error('Invalid dateFrom filter.');
    clauses.push(`\`Date\` >= '${filters.dateFrom}'`);
  }
  if (filters.dateTo) {
    if (!DATE_RE.test(filters.dateTo)) throw new Error('Invalid dateTo filter.');
    clauses.push(`\`Date\` <= '${filters.dateTo}'`);
  }
  if (typeof filters.male === 'boolean') {
    clauses.push(`Male = ${filters.male ? 1 : 0}`);
  }
  if (filters.batch) {
    clauses.push(`Batch = '${filters.batch.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`);
  }
  if (!clauses.length) return sql;

  const tableRef = getTableRef();
  const filtered = `(SELECT * FROM ${tableRef} WHERE ${clauses.join(' AND ')})`;
  return sql.split(tableRef).join(filtered);
}

/** Adds a LIMIT clause if the query doesn't already have one. */
function withLimitCap(sql: string, cap = 500): string {
  const trimmed = sql.trim().replace(/;$/, '');
  if (/\bLIMIT\s+\d+\b/i.test(trimmed)) return trimmed;
  return `${trimmed}\nLIMIT ${cap}`;
}

/**
 * BigQuery returns DATE/TIMESTAMP/NUMERIC cells as wrapper objects with a
 * `.value` property; flatten them so rows survive JSON serialisation cleanly.
 */
function flattenRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(row)) {
    out[key] =
      val !== null && typeof val === 'object' && 'value' in (val as object)
        ? (val as { value: unknown }).value
        : val;
  }
  return out;
}

/** Runs a validated, read-only SELECT against the fixed NIPT table. */
export async function runQuery(
  sql: string,
  filters?: GlobalFilters,
): Promise<Record<string, unknown>[]> {
  assertSafeSelect(sql);
  const bounded = withLimitCap(applyFilters(sql, filters));
  const [rows] = await getClient().query({ query: bounded });
  return (rows as Record<string, unknown>[]).map(flattenRow);
}
