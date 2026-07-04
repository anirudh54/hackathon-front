import type { GeminiRouteResult } from '../types.js';

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent';

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set');
  return key;
}

/** Low-level call to the Gemini REST API. */
async function callGemini(body: object): Promise<any> {
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey(),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API ${res.status}: ${text}`);
  }
  return res.json();
}

/** Extracts the text string from a Gemini response. */
function extractText(response: any): string {
  const parts = response?.candidates?.[0]?.content?.parts;
  if (!parts || parts.length === 0) return 'No response received.';
  return parts[0].text ?? 'No response received.';
}

/**
 * Asks Gemini to decide whether the user wants a chart, and if so which
 * columns / aggregation / chart type to use. Returns structured JSON.
 */
export async function routeWithGemini(
  message: string,
  categorical: string[],
  numeric: string[],
): Promise<GeminiRouteResult> {
  const prompt = `You route requests for a data dashboard. The dataset has these columns:
- categorical (use for groupBy): ${JSON.stringify(categorical)}
- numeric (use for measure): ${JSON.stringify(numeric)}
Decide if the user is asking to see a chart of this data.
If yes: set wantsChart=true and choose groupBy (a categorical column),
measure (a numeric column), an aggregation (sum, avg, count, min, or max),
and chartType (bar, line, pie, or doughnut).
If the user is just chatting or asking something unrelated, set wantsChart=false.
User message: "${message}"`;

  const responseSchema = {
    type: 'object',
    properties: {
      wantsChart: { type: 'boolean' },
      groupBy: { type: 'string' },
      measure: { type: 'string' },
      agg: { type: 'string', enum: ['sum', 'avg', 'count', 'min', 'max'] },
      chartType: { type: 'string', enum: ['bar', 'line', 'pie', 'doughnut'] },
    },
    required: ['wantsChart'],
  };

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema,
    },
  };

  const json = extractText(await callGemini(body));
  return JSON.parse(json) as GeminiRouteResult;
}

/** Plain text question to Gemini — no structured output. */
export async function askGemini(message: string): Promise<string> {
  const body = {
    contents: [{ parts: [{ text: message }] }],
  };
  try {
    return extractText(await callGemini(body));
  } catch (e: any) {
    return `Failed to get a response from Gemini: ${e.message}`;
  }
}
