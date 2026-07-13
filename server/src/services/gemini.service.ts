import { GoogleGenAI } from '@google/genai';
import type { SqlRouteResult } from '../types.js';
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

/**
 * Asks Gemini to translate a natural-language message into a read-only
 * BigQuery SQL query against the fixed results table, plus chart hints.
 */
export async function generateSql(
  message: string,
  columns: SchemaColumn[],
  tableRef: string,
): Promise<SqlRouteResult> {
  const columnList = columns.map((c) => `${c.name} (${c.type})`).join('\n');

  const prompt = `You translate requests for a data dashboard into BigQuery Standard SQL.
The data lives in exactly one table: ${tableRef}
Its columns (name and BigQuery type) are:
${columnList}

Decide if the user is asking to see a chart of this data.

If yes: set wantsChart=true and write a single read-only SELECT query (BigQuery
Standard SQL) against ${tableRef} that answers the request. Rules for the SQL:
- Only ever query ${tableRef}. Never reference any other table.
- Only a SELECT statement — no INSERT/UPDATE/DELETE/DDL of any kind.
- The query must group/aggregate down to a small result set suitable for a chart:
  alias the grouping column as "label" and the aggregated numeric column as "value".
- Apply any filters, sorting, or row limits the user asked for directly in the SQL
  (WHERE / ORDER BY / LIMIT).
- Also choose a chartType (bar, line, pie, or doughnut) and a short human-readable title.

If the user is just chatting or asking something that isn't a chart request,
set wantsChart=false and omit sql/chartType/title.

User message: "${message}"`;

  const responseSchema = {
    type: 'object',
    properties: {
      wantsChart: { type: 'boolean' },
      sql: { type: 'string' },
      chartType: { type: 'string', enum: ['bar', 'line', 'pie', 'doughnut'] },
      title: { type: 'string' },
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

const FALLBACK_SYSTEM_INSTRUCTION = `You are the chat assistant embedded in "AI Insights Dashboard", a tool backed
live by a BigQuery table of NIPT (non-invasive prenatal testing) results.
A separate step already tries to turn chart-shaped requests (e.g. "sample count by
PASSFAIL") into a live BigQuery query and render it — you're only called for
everything else: greetings, help requests, or things that didn't get parsed as a
chart. If asked whether you're connected to BigQuery, say yes — the dashboard runs
live SQL against BigQuery for chart requests — and suggest rephrasing as a chart
request (e.g. group-by + a metric) rather than saying you have no connection at
all. Keep answers brief; this is a small chat panel, not a full page.`;

/** Plain text question to Gemini — no structured output. */
export async function askGemini(message: string): Promise<string> {
  try {
    const response = await getClient().models.generateContent({
      model: MODEL,
      contents: message,
      config: {
        systemInstruction: FALLBACK_SYSTEM_INSTRUCTION,
      },
    });
    return response.text ?? 'No response received.';
  } catch (e: any) {
    return `Failed to get a response from Gemini: ${e.message}`;
  }
}
