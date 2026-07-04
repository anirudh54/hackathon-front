import { Router } from 'express';
import type { ChatRequest, ChatResponse, ChartSpec, DataConstraints, Filter, Sort } from '../types.js';
import { routeWithGemini, askGemini } from '../services/gemini.service.js';
import { getSchema } from '../services/excel.service.js';

const router = Router();

/** Case-insensitively matches a column name; falls back if no match. */
function matchColumn(requested: string, allowed: string[], fallback: string): string {
  for (const col of allowed) {
    if (col.toLowerCase() === requested.toLowerCase()) return col;
  }
  return fallback;
}

router.post('/chat', async (req, res) => {
  const { message, schema } = req.body as ChatRequest;

  if (!message?.trim()) {
    res.json({ type: 'text', reply: 'Message cannot be empty.' } satisfies ChatResponse);
    return;
  }

  let categorical: string[] = [];
  let numeric: string[] = [];

  try {
    if (schema?.categorical) {
      categorical = schema.categorical;
      numeric = schema.numeric ?? [];
    } else {
      const seeded = getSchema();
      categorical = seeded.categorical;
      numeric = seeded.numeric;
    }

    const route = await routeWithGemini(message, categorical, numeric);

    if (route.wantsChart) {
      if (categorical.length === 0 || numeric.length === 0) {
        res.json({
          type: 'text',
          reply: 'I need a dataset with at least one category column and one numeric column to chart.',
        } satisfies ChatResponse);
        return;
      }

      const allColumns = [...categorical, ...numeric];

      // Build constraints from Gemini's optional filter/sort/limit output
      const constraints: DataConstraints = {};
      if (route.filters?.length) {
        constraints.filters = route.filters.map((f): Filter => ({
          column: matchColumn(f.column, allColumns, f.column),
          op: f.op as Filter['op'],
          value: f.value,
        }));
      }
      if (route.sort) {
        constraints.sort = {
          column: matchColumn(route.sort.column, allColumns, route.sort.column),
          direction: route.sort.direction as Sort['direction'],
        };
      }
      if (route.limit != null && route.limit > 0) {
        constraints.limit = route.limit;
      }

      const hasConstraints = constraints.filters || constraints.sort || constraints.limit;

      const spec: ChartSpec = {
        type: 'chart',
        chartType: route.chartType ?? 'bar',
        groupBy: matchColumn(route.groupBy ?? '', categorical, categorical[0]),
        measure: matchColumn(route.measure ?? '', numeric, numeric[0]),
        agg: route.agg ?? 'sum',
        title: `${matchColumn(route.measure ?? '', numeric, numeric[0])} by ${matchColumn(route.groupBy ?? '', categorical, categorical[0])}`,
        ...(hasConstraints ? { constraints } : {}),
      };

      res.json(spec);
      return;
    }
  } catch {
    // If routing fails, fall through to plain text reply.
  }

  const reply = await askGemini(message);
  res.json({ type: 'text', reply } satisfies ChatResponse);
});

export default router;
