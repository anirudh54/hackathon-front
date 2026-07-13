/**
 * The backend queries BigQuery directly and streams back server-sent events:
 * either a fully aggregated chart result or chunks of a plain text reply —
 * the browser just renders them.
 */

export type ChartType = 'bar' | 'line' | 'pie' | 'doughnut' | 'scatter';

/** One named series in a grouped/stacked chart ("split by gender" etc.). */
export interface ChartSeries {
  name: string;
  values: number[];
}

/** The data portion of a chart — what re-running its SQL produces. */
export interface ChartData {
  labels: string[];
  values: number[];
  /** Present for multi-series results. */
  series?: ChartSeries[];
  /** Present for scatter results. */
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
  /** Flag statistical outliers in the chart (QC view). */
  highlightOutliers?: boolean;
  /** Render multi-series bars stacked instead of side by side. */
  stacked?: boolean;
}

/** Events streamed back for one chat request. */
export type StreamEvent =
  | { event: 'status'; message: string }
  | { event: 'delta'; text: string }
  | { event: 'chart'; chart: ChartResult }
  | { event: 'error'; message: string }
  | { event: 'done' };

/** Global dashboard filters injected into every chart's SQL on re-run. */
export interface GlobalFilters {
  /** YYYY-MM-DD, inclusive. */
  dateFrom?: string;
  dateTo?: string;
  /** true = male samples only, false = female only. */
  male?: boolean;
  batch?: string;
}

/** A chart on the dashboard: the server result plus client-side state. */
export interface RenderedChart extends Omit<ChartResult, 'type'> {
  id: string;
  pinned: boolean;
  /** Auto-refresh this chart's SQL every minute. */
  live: boolean;
}

/** A single bubble in the chat transcript. */
export interface ChatMessage {
  role: 'user' | 'bot';
  text: string;
  /** Suggested follow-up questions rendered as chips under a bot message. */
  followUps?: string[];
}
