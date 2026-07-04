export type ChartType = 'bar' | 'line' | 'pie' | 'doughnut';
export type AggType = 'sum' | 'avg' | 'count' | 'min' | 'max';

export interface Schema {
  categorical: string[];
  numeric: string[];
}

export interface ChatRequest {
  message: string;
  schema?: Schema;
}

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

/** Structured output from Gemini's routing call. */
export interface GeminiRouteResult {
  wantsChart: boolean;
  groupBy?: string;
  measure?: string;
  agg?: AggType;
  chartType?: ChartType;
}
