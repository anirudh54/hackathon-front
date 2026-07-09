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
  { name: 'Batch_id', type: 'STRING' },
  { name: 'RUN_NAME', type: 'STRING' },
  { name: 'SAMPLE_ID', type: 'STRING' },
  { name: 'inserted_date', type: 'DATE' },
  { name: 'Date_of_Birth', type: 'DATE' },
  { name: 'Age', type: 'INT64' },
  { name: 'GENDER', type: 'STRING' },
  { name: 'PHASE', type: 'STRING' },
  { name: 'PASSFAIL', type: 'STRING' },
  { name: 'Opt_Out_Microdels', type: 'STRING' },
  { name: 'Opt_Out_Fetal_Sex', type: 'STRING' },
  { name: 'reported_FF', type: 'FLOAT64' },
  { name: 'CHR_13', type: 'FLOAT64' },
  { name: 'T13_RESULT', type: 'STRING' },
  { name: 'CHR_18', type: 'FLOAT64' },
  { name: 'T18_RESULT', type: 'STRING' },
  { name: 'CHR_21', type: 'FLOAT64' },
  { name: 'T21_RESULT', type: 'STRING' },
  { name: 'Y_SUM_Norm', type: 'FLOAT64' },
  { name: 'TX', type: 'FLOAT64' },
  { name: 'FF_YPLUS', type: 'FLOAT64' },
  { name: 'FF_XMINUS', type: 'FLOAT64' },
  { name: 'MICRODEL', type: 'STRING' },
  { name: 'SEX_CHR', type: 'STRING' },
  { name: 'NUMBER_FET', type: 'INT64' },
  { name: 'G_Weeks', type: 'INT64' },
  { name: 'G_Days', type: 'INT64' },
  { name: 'READ_RAW', type: 'INT64' },
  { name: 'READ_MAPPED', type: 'INT64' },
  { name: 'Percent_MAPPED', type: 'FLOAT64' },
  { name: 'READ_CLEAN', type: 'INT64' },
  { name: 'Percent_Duplicate', type: 'FLOAT64' },
  { name: 'FETAL_FRACTION', type: 'STRING' },
  { name: 'FF_EST', type: 'FLOAT64' },
  { name: 'FF_CHRX', type: 'FLOAT64' },
  { name: 'AUTFF', type: 'FLOAT64' },
  { name: 'CHR1p36', type: 'FLOAT64' },
  { name: 'CHR22DIG', type: 'FLOAT64' },
  { name: 'CHR4WHS', type: 'FLOAT64' },
  { name: 'CHR5CRI1', type: 'FLOAT64' },
  { name: 'CHR5CRI2', type: 'FLOAT64' },
  { name: 'CHR8TRPS', type: 'FLOAT64' },
  { name: 'CHR11JBS', type: 'FLOAT64' },
  { name: 'CHR15PWAS', type: 'FLOAT64' },
  { name: 'User_Comment', type: 'STRING' },
  { name: 'md_comment', type: 'STRING' },
  { name: 'ABNORMAL_MSS', type: 'STRING' },
  { name: 'ABNORMAL_US', type: 'STRING' },
  { name: 'History', type: 'STRING' },
  { name: 'ANALYTE_CODE_86012072_INTERP', type: 'STRING' },
  { name: 'ANALYTE_CODE_86012077_INTERP', type: 'STRING' },
  { name: 'ANALYTE_CODE_86012079_INTERP', type: 'STRING' },
  { name: 'ANALYTE_CODE_86012081_INTERP', type: 'STRING' },
  { name: 'ANALYTE_CODE_86012076_INTERP', type: 'STRING' },
  { name: 'ANALYTE_CODE_86012085_INTERP', type: 'STRING' },
  { name: 'ANALYTE_CODE_86012072_TEXT', type: 'STRING' },
];

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
