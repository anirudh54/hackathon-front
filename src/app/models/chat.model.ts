/**
 * Schema-only contract. The browser parses the Excel file, derives the column
 * schema, and sends it with each message. The backend returns either a text reply
 * or a *chart spec* (which columns / aggregation to use) — the browser then does
 * the aggregation locally and renders.
 */

export type ChartType = 'bar' | 'line' | 'pie' | 'doughnut';
export type AggType = 'sum' | 'avg' | 'count' | 'min' | 'max';

/** Column names split by type, derived from the uploaded data. */
export interface Schema {
  categorical: string[];
  numeric: string[];
}

/** What the backend returns when it decides to chart. */
export interface ChartSpec {
  type: 'chart';
  chartType: ChartType;
  groupBy: string;
  measure: string;
  agg: AggType;
  title: string;
}

export interface TextResponse {
  type: 'text';
  reply: string;
}

export type ChatResponse = ChartSpec | TextResponse;

/** A chart after local aggregation — this is what the chart card renders. */
export interface RenderedChart {
  chartType: ChartType;
  title: string;
  labels: string[];
  values: number[];
}

/** One row of the parsed spreadsheet. */
export type DataRow = Record<string, string | number | null>;

/** A single bubble in the chat transcript. */
export interface ChatMessage {
  role: 'user' | 'bot';
  text: string;
}
