# AI Insights Dashboard (frontend)

Angular 20 dashboard + chat UI for the hackathon. Upload an Excel file, then ask
the assistant for charts in plain English. Uses the **schema-only** pattern: the
browser parses the file and sends only the *column schema* to the backend; Gemini
returns a chart **spec** (which columns / aggregation / chart type); the browser
aggregates locally and renders with ECharts. The raw data never leaves the browser
and the Gemini API key never reaches it.

## Run it

1. **Start the backend** (the `gemini-chatbot` Spring Boot app) on port `8080`:
   ```
   ./mvnw spring-boot:run
   ```
2. **Start this frontend:**
   ```
   npm install
   npm start
   ```
   Open http://localhost:4200. Requests to `/api/*` are proxied to the backend
   (see `proxy.conf.json`).

Click **Use sample** (or drag in an `.xlsx`/`.csv`), then ask *"show me amount by
region"* or click a suggestion chip.

## How it works

```
            ┌─ browser ─────────────────────────────────┐
upload ──▶  SheetJS parses .xlsx ──▶ derive schema       │
ask    ──▶  POST /api/chat { message, schema }           │
            │                              ▲             │
            │   chart spec  ◀──────────────┘             │
            │   { chartType, groupBy, measure, agg }     │
            │        │                                   │
            │        ▼                                   │
            │   aggregate rows locally ──▶ ECharts + KPIs│
            └────────────────────────────────────────────┘
                         ▲
        backend only routes the message to Gemini
        and returns the spec — it never sees the data
```

If the backend gets no schema (e.g. a direct API call), it falls back to the
seeded `data/sales.xlsx` so `/api/chat` still works standalone.

## Project layout

| Path | Purpose |
|------|---------|
| `src/app/app.ts` / `app.html` | Dashboard + chat shell, upload, KPI logic |
| `src/app/services/excel.service.ts` | SheetJS parse, schema derivation, local aggregation, sample data |
| `src/app/services/chat.service.ts` | `POST /api/chat` with `{ message, schema }` |
| `src/app/chart-card/` | ECharts renderer for one aggregated chart |
| `src/app/models/chat.model.ts` | Request/response + chart-spec contract |
| `proxy.conf.json` | Dev proxy `/api` → `:8080` |

## Build for production

```
npm run build   # output in dist/hackathon-front/browser/
```

For a single-deployable demo, copy `dist/hackathon-front/browser/*` into the
backend's `src/main/resources/static/` and serve everything from Spring Boot
(same origin, no proxy needed).

> Note: ECharts + SheetJS push the initial bundle to ~1.6 MB raw (~450 kB
> gzipped), so the production budget in `angular.json` is raised accordingly. If
> you want it smaller, import ECharts via `echarts/core` and register only the
> bar/line/pie charts you use.
