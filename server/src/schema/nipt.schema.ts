/** A single BigQuery column: name + type, as reported by BigQuery's schema API. */
export interface SchemaColumn {
  name: string;
  type: string;
}

/**
 * Fixed schema for the NIPT (prenatal screening) results table.
 * This is the single source of truth for both the Gemini text-to-SQL prompt
 * and the query guard in bigquery.service.ts.
 */
export const NIPT_SCHEMA: SchemaColumn[] = [
  { name: "Version", type: "STRING" },
  { name: "FF_Yplus", type: "FLOAT" },
  { name: "FF_Xminus", type: "FLOAT" },
  { name: "AutoFF", type: "FLOAT" },
  { name: "Male", type: "INT64" },
  { name: "Grayzone", type: "BOOL" },
  { name: "chr13", type: "FLOAT" },
  { name: "chr18", type: "FLOAT" },
  { name: "chr21", type: "FLOAT" },
  { name: "zX_females", type: "FLOAT" },
  { name: "RapidR_flag", type: "BOOL" },
  { name: "SCA", type: "STRING" },
  { name: "Total reads", type: "INT64" },
  { name: "Deduped Reads", type: "INT64" },
  { name: "Date", type: "DATE" },
  { name: "Sample", type: "STRING" },
  { name: "Batch", type: "STRING" }
]

/** Fully-qualified `project.dataset.table` id for the fixed NIPT results table. */
export function getTableRef(): string {
  const project = process.env.BQ_PROJECT_ID;
  const dataset = process.env.BQ_DATASET;
  const table = process.env.BQ_TABLE;
  if (!project || !dataset || !table) {
    throw new Error('BQ_PROJECT_ID, BQ_DATASET, and BQ_TABLE must be set in the environment.');
  }
  return `\`${project}.${dataset}.${table}\``;
}
