# Feature Ideas & Roadmap

Proposed features for the AI Insights Dashboard, based on a review of the
current codebase (Angular dashboard + chat shell, Express backend routing
messages through Gemini text-to-SQL into BigQuery, single-series ECharts
renderer). Ordered roughly by impact vs. effort.

## High impact, low effort

### 1. Show the generated SQL
The backend already has `route.sql` in `server/src/routes/chat.ts` but
discards it after running the query. Return it in the `ChartResult` and add a
collapsible "View SQL" footer on each chart card.

- **Why:** transparency and trust — proves the chart really ran live against
  BigQuery. Great demo value.
- **Touches:** `server/src/routes/chat.ts`, `server/src/types.ts`,
  `src/app/models/chat.model.ts`, `src/app/chart-card/`.

### 2. Chart management: remove, pin, reorder
Charts only ever accumulate in the `charts()` signal — there is no way to
delete one. Add a close button per card, and optionally drag-to-reorder.

- **Why:** turns the chart grid into an actual curated dashboard.
- **Touches:** `src/app/app.ts`, `src/app/app.html`, `src/app/chart-card/`.

### 3. Dashboard persistence
A refresh currently loses everything. A `RenderedChart` is pure JSON, so
persisting `charts()` (and chat messages) to `localStorage` is trivial.
A later step is saving named dashboards server-side.

- **Why:** makes the app feel like a real tool instead of a one-off session.
- **Touches:** `src/app/app.ts` (or a small persistence service).

### 4. Conversation memory
`generateSql` and `askGemini` receive only the latest message, so follow-ups
like "same thing but only for Phase 3" or "make that a pie chart instead"
cannot work. Send recent message history (and the last chart's SQL) as
context to Gemini.

- **Why:** unlocks refinement queries — the single biggest UX upgrade for a
  chat-driven tool.
- **Touches:** `server/src/services/gemini.service.ts`,
  `server/src/routes/chat.ts`, `src/app/services/chat.service.ts`.

### 5. Refresh & auto-refresh per chart
Keep the SQL with each chart (see #1) and add a refresh button, or a "live"
toggle that re-runs the query every N minutes.

- **Why:** cheap once #1 lands, and it justifies the "● Live BigQuery data"
  badge in the toolbar.
- **Touches:** new backend endpoint to re-run stored SQL, chart card UI.

## Medium effort, big payoff

### 6. Data table view + CSV export
Toggle each card between chart and raw result table, plus a "Download CSV"
button. The rows are already on the server — they just need to be passed
through.

- **Why:** analysts always want the numbers behind the picture.

### 7. More chart shapes — histograms and scatter
The schema is full of continuous metrics (`FF_EST`, `reported_FF`,
`CHR_13/18/21` scores, `Percent_MAPPED`, `Age`) that don't fit a group-by bar
chart. Teach the prompt to bucket numeric columns (histogram) and support
two-metric output (scatter, e.g. fetal fraction vs. gestational age).

- **Why:** most of the interesting NIPT columns are continuous.
- **Touches:** extend the response contract beyond `labels`/`values` to allow
  `series`/`points`; new ECharts options in `chart-card.ts`; prompt updates.

### 8. Multi-series / grouped charts
Support an optional second group-by column so requests like "pass rate by
phase, split by gender" work, rendered as stacked or grouped bars.

- **Why:** currently impossible with the flat `label`/`value` contract.

### 9. AI-generated insight summaries
After a query returns, make a second Gemini call with the result rows and
render a one-line insight as a caption under the chart (e.g. "T21 positives
are concentrated in patients over 38").

- **Why:** makes it an *insights* dashboard rather than a chart builder.

### 10. Smarter, dynamic suggestion chips
The four chips in `src/app/app.ts` are hardcoded. After each answer, have
Gemini propose 2–3 follow-up questions based on the last result and render
them as chips under the bot message.

- **Why:** guides users toward what the data can actually answer.

## Bigger bets

### 11. Global dashboard filters
A date-range picker (on `inserted_date`) and phase/gender dropdowns in the
toolbar that inject `WHERE` clauses into every chart's stored SQL and re-run
all cards at once.

- **Why:** turns a pile of charts into a coherent dashboard.

### 12. Drill-down on click
Click a bar (e.g. "FAIL") to auto-issue a follow-up query filtered to that
segment, or show the underlying sample rows. ECharts exposes the click event;
the backend needs a "filter by label X" pathway.

### 13. Anomaly / QC monitoring
This is NIPT lab data, so batch/run QC is a natural fit: a canned "QC view"
showing fail rate per `RUN_NAME`/`Batch_id` over time with outlier
highlighting, or a scheduled check that flags runs with unusual fail rates.

### 14. Streaming responses + better error surfacing
Chat replies arrive in one block, and when SQL generation fails the user gets
a generic fallback (the real error only reaches `console.error`). Stream
Gemini's text reply and tell the user *why* a chart request failed ("that
column doesn't exist — did you mean…").

## Suggested next step

Implement **#1 + #4 + #9 together** — show the SQL, add conversation memory,
and add AI insight captions. They share plumbing (keeping the SQL and result
rows attached to each chart) and together they move the product from
"one-shot chart generator" to "conversational analyst."
