/**
 * The backend queries BigQuery directly and returns either a text reply or a
 * chart that's already fully aggregated server-side — the browser just renders it.
 */

export type ChartType = 'bar' | 'line' | 'pie' | 'doughnut';

/** A chart backed by a real BigQuery query result — data computed server-side. */
export interface ChartResult {
  type: 'chart';
  chartType: ChartType;
  title: string;
  labels: string[];
  values: number[];
}

export interface TextResponse {
  type: 'text';
  reply: string;
}

export type ChatResponse = ChartResult | TextResponse;

/** What the chart card renders — same shape as ChartResult minus the discriminant. */
export interface RenderedChart {
  chartType: ChartType;
  title: string;
  labels: string[];
  values: number[];
}

/** A single bubble in the chat transcript. */
export interface ChatMessage {
  role: 'user' | 'bot';
  text: string;
}
