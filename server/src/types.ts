export type ChartType = 'bar' | 'line' | 'pie' | 'doughnut';
export type AggType = 'sum' | 'avg' | 'count' | 'min' | 'max';

export interface Filter {
  column: string;
  op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains';
  value: string | number;
}

export interface Sort {
  column: string;
  direction: 'asc' | 'desc';
}

export interface DataConstraints {
  filters?: Filter[];
  sort?: Sort;
  limit?: number;
}

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
  constraints?: DataConstraints;
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
  filters?: Array<{ column: string; op: string; value: string | number }>;
  sort?: { column: string; direction: string };
  limit?: number;
}
