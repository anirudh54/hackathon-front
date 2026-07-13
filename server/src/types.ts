export type ChartType = 'bar' | 'line' | 'pie' | 'doughnut' | 'scatter';

/** One prior turn of the conversation, sent back by the client for context. */
export interface HistoryEntry {
  role: 'user' | 'bot';
  text: string;
}

export interface ChatRequest {
  message: string;
  /** Recent conversation turns so Gemini can resolve follow-ups ("same but…"). */
  history?: HistoryEntry[];
  /** SQL behind the most recent chart, so refinement requests can build on it. */
  lastSql?: string;
}

export interface TextResponse {
  type: 'text';
  reply: string;
}

export type ChatResponse = ChartResult | TextResponse;

/** Structured output from Gemini's text-to-SQL call. */
export interface SqlRouteResult {
  /** The user explicitly asked for a chart/visualization. */
  wantsChart: boolean;
  /** The user asked a data question but not for a chart — answer in prose. */
  wantsData?: boolean;
  sql?: string;
  chartType?: ChartType;
  title?: string;
  stacked?: boolean;
}

/** One named series in a grouped/stacked chart ("split by gender" etc.). */
export interface ChartSeries {
  name: string;
  values: number[];
}

/** The data portion of a chart — what a re-run of the SQL produces. */
export interface ChartData {
  labels: string[];
  values: number[];
  /** Present for multi-series results (label + series + value rows). */
  series?: ChartSeries[];
  /** Present for scatter results (x + y rows). */
  points?: [number, number][];
  /** Raw result rows for the table view / CSV export. */
  rows: Record<string, unknown>[];
  columns: string[];
}

/** A chart backed by a real BigQuery query result — data computed server-side. */
export interface ChartResult extends ChartData {
  type: 'chart';
  chartType: ChartType;
  title: string;
  /** The exact SQL that produced this chart. */
  sql: string;
  /** One-line AI-generated takeaway about the result. */
  insight?: string;
  /** 2–3 AI-suggested follow-up questions. */
  followUps?: string[];
  /** Ask the client to flag statistical outliers (QC view). */
  highlightOutliers?: boolean;
  /** Render multi-series bars stacked instead of side by side. */
  stacked?: boolean;
}

/** Global dashboard filters injected into every chart's stored SQL on re-run. */
export interface GlobalFilters {
  /** YYYY-MM-DD, inclusive. */
  dateFrom?: string;
  dateTo?: string;
  /** true = male samples only, false = female only. */
  male?: boolean;
  batch?: string;
}

export interface QueryRequest {
  sql: string;
  filters?: GlobalFilters;
}

/** Server-sent events streamed back for a /chat request. */
export type ChatStreamEvent =
  | { event: 'status'; message: string }
  | { event: 'delta'; text: string }
  | { event: 'chart'; chart: ChartResult }
  | { event: 'error'; message: string }
  | { event: 'done' };
