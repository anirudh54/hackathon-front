import { Router, type Response } from 'express';
import type {
  ChartData,
  ChartResult,
  ChatRequest,
  ChatStreamEvent,
  QueryRequest,
  SqlRouteResult,
} from '../types.js';
import {
  generateSql,
  generateInsight,
  askGeminiStream,
  analyzeDataStream,
  repairSql,
} from '../services/gemini.service.js';
import { runQuery } from '../services/bigquery.service.js';
import { NIPT_SCHEMA, getTableRef } from '../schema/nipt.schema.js';

const router = Router();

/**
 * Runs SQL, and if BigQuery rejects it, asks Gemini to repair the query once
 * using the error text before giving up. Returns the rows and the SQL that
 * actually worked (so the chart stores the corrected query).
 */
async function runQueryWithRepair(
  message: string,
  sql: string,
): Promise<{ rows: Record<string, unknown>[]; sql: string }> {
  try {
    return { rows: await runQuery(sql), sql };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const fixed = await repairSql(message, NIPT_SCHEMA, getTableRef(), sql, reason);
    if (!fixed || fixed === sql) throw err;
    console.warn('Retrying with repaired SQL after error:', reason);
    return { rows: await runQuery(fixed), sql: fixed };
  }
}

/**
 * Turns raw BigQuery rows into chart-ready data based on the column aliases
 * the SQL prompt enforces:
 *  - x + y            → scatter points
 *  - label + series + value → pivoted multi-series
 *  - label + value    → single series (default)
 */
function shapeRows(rows: Record<string, unknown>[]): ChartData {
  const columns = rows.length ? Object.keys(rows[0]) : [];
  const has = (k: string) => columns.includes(k);

  if (has('x') && has('y')) {
    return {
      labels: [],
      values: [],
      points: rows.map((r) => [Number(r['x'] ?? 0), Number(r['y'] ?? 0)]),
      rows,
      columns,
    };
  }

  if (has('label') && has('series') && has('value')) {
    const labels = [...new Set(rows.map((r) => String(r['label'] ?? '—')))];
    const names = [...new Set(rows.map((r) => String(r['series'] ?? '—')))];
    const series = names.map((name) => ({
      name,
      values: labels.map((label) => {
        const row = rows.find(
          (r) => String(r['label'] ?? '—') === label && String(r['series'] ?? '—') === name,
        );
        return row ? Number(row['value'] ?? 0) : 0;
      }),
    }));
    return { labels, values: series[0]?.values ?? [], series, rows, columns };
  }

  return {
    labels: rows.map((r) => String(r['label'] ?? '—')),
    values: rows.map((r) => Number(r['value'] ?? 0)),
    rows,
    columns,
  };
}

function openStream(res: Response): (event: ChatStreamEvent) => void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  return (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);
}

/**
 * Chat endpoint, streamed as server-sent events:
 *   status → progress line for the typing indicator
 *   chart  → a complete chart result (SQL, rows, insight, follow-ups attached)
 *   delta  → a chunk of a plain-text streamed reply
 *   error  → human-readable failure reason
 *   done   → always last
 */
router.post('/chat', async (req, res) => {
  const { message, history = [], lastSql } = req.body as ChatRequest;
  const send = openStream(res);
  const finish = () => {
    send({ event: 'done' });
    res.end();
  };

  if (!message?.trim()) {
    send({ event: 'error', message: 'Message cannot be empty.' });
    finish();
    return;
  }

  let route: SqlRouteResult | undefined;
  try {
    send({ event: 'status', message: 'Interpreting your question…' });
    route = await generateSql(message, NIPT_SCHEMA, getTableRef(), history, lastSql);
  } catch (err) {
    console.error('SQL routing failed, falling back to plain chat:', err);
  }

  if (route?.wantsChart && route.sql) {
    try {
      send({ event: 'status', message: 'Running BigQuery…' });
      const { rows, sql: usedSql } = await runQueryWithRepair(message, route.sql);

      if (!rows.length) {
        send({
          event: 'error',
          message: `The query ran but returned no rows — try widening the filters. SQL used:\n${usedSql}`,
        });
        finish();
        return;
      }

      send({ event: 'status', message: 'Summarizing the result…' });
      const { insight, followUps } = await generateInsight(route.title ?? 'Chart', rows);

      const chart: ChartResult = {
        type: 'chart',
        chartType: route.chartType ?? 'bar',
        title: route.title ?? 'Chart',
        sql: usedSql,
        stacked: route.stacked,
        insight,
        followUps,
        ...shapeRows(rows),
      };
      send({ event: 'chart', chart });
      finish();
      return;
    } catch (err) {
      // Surface the real reason instead of silently degrading to small talk.
      const reason = err instanceof Error ? err.message : String(err);
      console.error('Chart query failed:', err);
      send({
        event: 'error',
        message: `I couldn't run that chart — ${reason}\nTry rephrasing with a column from the table (e.g. Batch, AutoFF, Grayzone, chr21, Date).`,
      });
      finish();
      return;
    }
  }

  // Data question without a chart: run the SQL, then answer conversationally
  // from the actual rows instead of rendering anything.
  if (route?.wantsData && route.sql) {
    try {
      send({ event: 'status', message: 'Running BigQuery…' });
      const { rows } = await runQueryWithRepair(message, route.sql);

      if (!rows.length) {
        send({
          event: 'error',
          message: 'I ran a query for that but it returned no rows — try widening the question.',
        });
        finish();
        return;
      }

      send({ event: 'status', message: 'Analyzing the result…' });
      for await (const text of analyzeDataStream(message, rows, history)) {
        send({ event: 'delta', text });
      }
      finish();
      return;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error('Data analysis failed:', err);
      send({
        event: 'error',
        message: `I couldn't analyze that — ${reason}\nTry rephrasing with a column from the table (e.g. Batch, AutoFF, Grayzone, chr21, Date).`,
      });
      finish();
      return;
    }
  }

  try {
    for await (const text of askGeminiStream(message, history)) {
      send({ event: 'delta', text });
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    send({ event: 'error', message: `Failed to get a response from Gemini: ${reason}` });
  }
  finish();
});

/**
 * Re-runs a chart's stored SQL — used by per-card refresh, live auto-refresh,
 * and global dashboard filters. The SQL goes back through the same read-only
 * validation as generated SQL.
 */
router.post('/query', async (req, res) => {
  const { sql, filters } = req.body as QueryRequest;
  if (!sql?.trim()) {
    res.status(400).json({ error: 'sql is required.' });
    return;
  }
  try {
    const rows = await runQuery(sql, filters);
    res.json(shapeRows(rows));
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: reason });
  }
});

/**
 * The two charts shown on app load. "Run" in the product requirement maps to
 * the `Batch` column of the schema.
 *  1. Bar: number of runs (distinct batches) per day over the last month of
 *     data — anchored to MAX(Date) so it still shows something when the
 *     dataset isn't current.
 *  2. Stacked bar: samples in each run, split by Grayzone true/false.
 */
router.get('/default-charts', async (_req, res) => {
  try {
    const tableRef = getTableRef();

    const runsSql = `SELECT CAST(\`Date\` AS STRING) AS label, COUNT(DISTINCT Batch) AS value
FROM ${tableRef}
WHERE \`Date\` >= DATE_SUB((SELECT MAX(\`Date\`) FROM ${tableRef}), INTERVAL 1 MONTH)
GROUP BY label
ORDER BY label`;

    const grayzoneSql = `SELECT Batch AS label, IF(Grayzone, 'Grayzone', 'Normal') AS series, COUNT(*) AS value
FROM ${tableRef}
GROUP BY label, series
ORDER BY label`;

    const [runRows, grayRows] = await Promise.all([runQuery(runsSql), runQuery(grayzoneSql)]);
    const [runInsight, grayInsight] = await Promise.all([
      generateInsight('Runs per day — last month', runRows),
      generateInsight('Samples per run by grayzone status', grayRows),
    ]);

    const charts: ChartResult[] = [
      {
        type: 'chart',
        chartType: 'bar',
        title: 'Runs per day — last month',
        sql: runsSql,
        ...runInsight,
        ...shapeRows(runRows),
      },
      {
        type: 'chart',
        chartType: 'bar',
        title: 'Samples per run by grayzone status',
        sql: grayzoneSql,
        stacked: true,
        ...grayInsight,
        ...shapeRows(grayRows),
      },
    ];
    res.json(charts);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: reason });
  }
});

/** Canned QC view: grayzone rate per batch, with outlier highlighting. */
router.get('/qc', async (_req, res) => {
  try {
    const tableRef = getTableRef();
    const sql = `SELECT Batch AS label, ROUND(100 * COUNTIF(Grayzone) / COUNT(*), 2) AS value
FROM ${tableRef}
GROUP BY Batch
ORDER BY Batch
LIMIT 100`;
    const rows = await runQuery(sql);
    const { insight, followUps } = await generateInsight('QC — grayzone rate by batch (%)', rows);
    const chart: ChartResult = {
      type: 'chart',
      chartType: 'bar',
      title: 'QC — grayzone rate by batch (%)',
      sql,
      insight,
      followUps,
      highlightOutliers: true,
      ...shapeRows(rows),
    };
    res.json(chart);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: reason });
  }
});

/** Distinct batch ids for the global filter dropdown. */
router.get('/batches', async (_req, res) => {
  try {
    const sql = `SELECT DISTINCT Batch FROM ${getTableRef()} WHERE Batch IS NOT NULL ORDER BY Batch LIMIT 200`;
    const rows = await runQuery(sql);
    res.json(rows.map((r) => String(r['Batch'])));
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: reason });
  }
});

export default router;
