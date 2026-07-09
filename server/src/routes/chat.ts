import { Router } from 'express';
import type { ChatRequest, ChatResponse, ChartResult } from '../types.js';
import { generateSql, askGemini } from '../services/gemini.service.js';
import { runQuery } from '../services/bigquery.service.js';
import { NIPT_SCHEMA, getTableRef } from '../schema/nipt.schema.js';

const router = Router();

router.post('/chat', async (req, res) => {
  const { message } = req.body as ChatRequest;

  if (!message?.trim()) {
    res.json({ type: 'text', reply: 'Message cannot be empty.' } satisfies ChatResponse);
    return;
  }

  try {
    const tableRef = getTableRef();
    const route = await generateSql(message, NIPT_SCHEMA, tableRef);

    if (route.wantsChart && route.sql) {
      const rows = await runQuery(route.sql);

      const labels = rows.map((r) => String(r['label'] ?? '—'));
      const values = rows.map((r) => Number(r['value'] ?? 0));

      const result: ChartResult = {
        type: 'chart',
        chartType: route.chartType ?? 'bar',
        title: route.title ?? 'Chart',
        labels,
        values,
      };

      res.json(result satisfies ChatResponse);
      return;
    }
  } catch (err) {
    // If routing or query execution fails, fall through to plain text reply.
    console.error('Chart routing/query failed, falling back to text reply:', err);
  }

  const reply = await askGemini(message);
  res.json({ type: 'text', reply } satisfies ChatResponse);
});

export default router;
