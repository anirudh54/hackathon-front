export type ChartType = 'bar' | 'line' | 'pie' | 'doughnut';

export interface ChatRequest {
  message: string;
}

export interface TextResponse {
  type: 'text';
  reply: string;
}

export type ChatResponse = ChartResult | TextResponse;

/** Structured output from Gemini's text-to-SQL call. */
export interface SqlRouteResult {
  wantsChart: boolean;
  sql?: string;
  chartType?: ChartType;
  title?: string;
}

/** A chart backed by a real BigQuery query result — data computed server-side. */
export interface ChartResult {
  type: 'chart';
  chartType: ChartType;
  title: string;
  labels: string[];
  values: number[];
}
