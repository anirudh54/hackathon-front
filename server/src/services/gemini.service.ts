import { GoogleGenAI } from '@google/genai';
import type { HistoryEntry, SqlRouteResult } from '../types.js';
import type { SchemaColumn } from '../schema/nipt.schema.js';

const MODEL = 'gemini-2.5-flash';

let client: GoogleGenAI | undefined;

/**
 * Vertex AI client, authenticated via Application Default Credentials
 * (`gcloud auth application-default login`) — the same identity BigQuery
 * uses. No API key required.
 */
function getClient(): GoogleGenAI {
  if (!client) {
    const project = process.env.BQ_PROJECT_ID;
    if (!project) throw new Error('BQ_PROJECT_ID is not set');
    client = new GoogleGenAI({
      vertexai: true,
      project,
      location: 'us-central1',
    });
  }
  return client;
}

/** Renders recent turns as a plain-text block for prompt context. */
function historyBlock(history: HistoryEntry[]): string {
  if (!history.length) return '';
  const lines = history
    .slice(-10)
    .map((h) => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.text}`)
    .join('\n');
  return `\nRecent conversation (oldest first), for resolving follow-ups:\n${lines}\n`;
}

/**
 * Asks Gemini to translate a natural-language message into a read-only
 * BigQuery SQL query against the fixed results table, plus chart hints.
 * Recent history and the last chart's SQL let refinement requests
 * ("same thing but only batch B02", "make that a pie chart") work.
 */
export async function generateSql(
  message: string,
  columns: SchemaColumn[],
  tableRef: string,
  history: HistoryEntry[] = [],
  lastSql?: string,
): Promise<SqlRouteResult> {
  const columnList = columns.map((c) => `\`${c.name}\` (${c.type})`).join('\n');

  const lastSqlBlock = lastSql
    ? `\nThe most recent chart on the dashboard was produced by this SQL:\n${lastSql}\nIf the user asks to refine, filter, re-shape, or restyle "that" chart, base the new query on it.\n`
    : '';

  const prompt = `You translate requests for a data dashboard into BigQuery Standard SQL.
The data lives in exactly one table: ${tableRef}
Its columns (name and BigQuery type) are:
${columnList}
${historyBlock(history)}${lastSqlBlock}
Decide if the user is asking to see a chart of this data.

If yes: set wantsChart=true and write a single read-only SELECT query (BigQuery
Standard SQL) against ${tableRef} that answers the request. Rules for the SQL:
- Only ever query ${tableRef}. Never reference any other table.
- Only a SELECT statement — no INSERT/UPDATE/DELETE/DDL of any kind.
- Quote column names containing spaces with backticks (e.g. \`Total reads\`).
- The query must aggregate down to a small result set, using EXACTLY one of
  these output shapes:
  1. Single series (default): alias the grouping column as "label" and the
     aggregated numeric column as "value". chartType: bar, line, pie, or doughnut.
  2. Grouped/split series (the user asks to split/break down by a SECOND
     category, e.g. "…by batch, split by gender"): output three columns aliased
     "label", "series", "value". chartType: bar or line. Set stacked=true if
     the user asks for stacked bars.
  3. Scatter (the user asks to compare two numeric metrics per sample, e.g.
     "chr21 vs AutoFF"): output two numeric columns aliased "x" and "y", one row
     per sample, LIMIT 300. chartType: scatter.
  4. Histogram / distribution of a numeric column: bucket the value in SQL
     (e.g. CAST(FLOOR(col / step) * step AS STRING) or a CASE expression),
     alias the bucket as "label" (ordered ascending) and COUNT(*) as "value".
     chartType: bar.
- Apply any filters, sorting, or row limits the user asked for directly in the SQL
  (WHERE / ORDER BY / LIMIT).
- Also choose the chartType and a short human-readable title.

If the user is just chatting or asking something that isn't a chart request,
set wantsChart=false and omit sql/chartType/title.

User message: "${message}"`;

  const responseSchema = {
    type: 'object',
    properties: {
      wantsChart: { type: 'boolean' },
      sql: { type: 'string' },
      chartType: { type: 'string', enum: ['bar', 'line', 'pie', 'doughnut', 'scatter'] },
      title: { type: 'string' },
      stacked: { type: 'boolean' },
    },
    required: ['wantsChart'],
  };

  const response = await getClient().models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema,
    },
  });

  return JSON.parse(response.text ?? '{}') as SqlRouteResult;
}

/**
 * Second-pass call: given a chart's result rows, produce a one-line insight
 * caption and 2–3 follow-up chart questions. Failures degrade to nothing —
 * the chart still renders without a caption.
 */
export async function generateInsight(
  title: string,
  rows: Record<string, unknown>[],
): Promise<{ insight?: string; followUps?: string[] }> {
  try {
    const sample = JSON.stringify(rows.slice(0, 40));
    const prompt = `A dashboard chart titled "${title}" over NIPT (prenatal screening) lab data
just returned these aggregated rows (JSON):
${sample}

1. Write ONE short, concrete insight sentence about what stands out in these
   numbers (a comparison, trend, outlier, or concentration — not a restatement
   of the title). No preamble.
2. Suggest 2-3 short follow-up questions a user could ask this dashboard next,
   each phrased as a chart request answerable from a NIPT results table
   (columns include AutoFF, chr13/chr18/chr21 scores, Grayzone flag, Male flag,
   Batch, Date, Total reads).`;

    const responseSchema = {
      type: 'object',
      properties: {
        insight: { type: 'string' },
        followUps: { type: 'array', items: { type: 'string' }, maxItems: 3 },
      },
      required: ['insight'],
    };

    const response = await getClient().models.generateContent({
      model: MODEL,
      contents: prompt,
      config: { responseMimeType: 'application/json', responseSchema },
    });

    return JSON.parse(response.text ?? '{}');
  } catch (e) {
    console.error('Insight generation failed (non-fatal):', e);
    return {};
  }
}

const FALLBACK_SYSTEM_INSTRUCTION = `You are the chat assistant embedded in "AI Insights Dashboard", a tool backed
live by a BigQuery table of NIPT (non-invasive prenatal testing) results.
A separate step already tries to turn chart-shaped requests (e.g. "sample count by
batch") into a live BigQuery query and render it — you're only called for
everything else: greetings, help requests, or things that didn't get parsed as a
chart. If asked whether you're connected to BigQuery, say yes — the dashboard runs
live SQL against BigQuery for chart requests — and suggest rephrasing as a chart
request (e.g. group-by + a metric) rather than saying you have no connection at
all. Keep answers brief; this is a small chat panel, not a full page.`;

/** Plain chat reply, streamed chunk by chunk. */
export async function* askGeminiStream(
  message: string,
  history: HistoryEntry[] = [],
): AsyncGenerator<string> {
  // Vertex requires the first content to be a user turn; drop leading bot turns.
  const firstUser = history.findIndex((h) => h.role === 'user');
  const usable = firstUser === -1 ? [] : history.slice(firstUser).slice(-10);

  const contents = [
    ...usable.map((h) => ({
      role: h.role === 'user' ? ('user' as const) : ('model' as const),
      parts: [{ text: h.text }],
    })),
    { role: 'user' as const, parts: [{ text: message }] },
  ];

  const stream = await getClient().models.generateContentStream({
    model: MODEL,
    contents,
    config: {
      systemInstruction: FALLBACK_SYSTEM_INSTRUCTION,
    },
  });

  for await (const chunk of stream) {
    if (chunk.text) yield chunk.text;
  }
}
