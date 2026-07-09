import { BigQuery } from '@google-cloud/bigquery';
import { getTableRef } from '../schema/nipt.schema.js';

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
  if (!trimmed.includes(getTableRef())) {
    throw new Error('Query must reference the configured table.');
  }
}

/** Adds a LIMIT clause if the query doesn't already have one. */
function withLimitCap(sql: string, cap = 500): string {
  const trimmed = sql.trim().replace(/;$/, '');
  if (/\bLIMIT\s+\d+\b/i.test(trimmed)) return trimmed;
  return `${trimmed}\nLIMIT ${cap}`;
}

/** Runs a validated, read-only SELECT against the fixed NIPT table. */
export async function runQuery(sql: string): Promise<Record<string, unknown>[]> {
  assertSafeSelect(sql);
  const bounded = withLimitCap(sql);
  const [rows] = await getClient().query({ query: bounded });
  return rows as Record<string, unknown>[];
}
