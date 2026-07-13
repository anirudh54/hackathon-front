# AI Insights Dashboard

Angular 20 dashboard + chat UI backed by a Node/Express server. Ask the
assistant about the data in plain English; Gemini translates chart-shaped
requests into a read-only BigQuery SQL query against a fixed NIPT (prenatal
screening) results table, runs it, and returns chart-ready data. Everything
else (greetings, help, meta questions) gets a normal Gemini chat reply.

## Run it

1. **Start the backend** (Node/Express on port `3000`):
   ```
   cd server
   npm install
   npm run dev
   ```
   Requires `server/.env` to be filled in (see below) and BigQuery credentials
   set up (see "BigQuery setup").

2. **Start the frontend:**
   ```
   npm install
   npm start
   ```
   Open http://localhost:4200. Requests to `/api/*` are proxied to the backend
   (see `proxy.conf.json`).

Ask something like *"sample count by PASSFAIL"* or click a suggestion chip.

## How it works

```
            ┌─ browser ───────────────────────────────────┐
ask    ──▶  POST /api/chat { message }                    │
            │                              ▲               │
            │   chart result  ◀────────────┘               │
            │   { chartType, title, labels, values }        │
            │        │                                      │
            │        ▼                                      │
            │   render with ECharts + KPIs                  │
            └───────────────────────────────────────────────┘
                         ▲
        backend asks Gemini to translate the message into a
        read-only SQL query, runs it against BigQuery, and
        returns the aggregated result. Non-chart messages get
        a plain Gemini chat reply instead.
```

## BigQuery setup

1. **Project + API**
   ```
   gcloud config set project YOUR_PROJECT_ID
   gcloud services enable bigquery.googleapis.com
   ```
   Needs billing enabled on the project (BigQuery has a free tier but still
   requires a billing account attached).

2. **Authenticate** (this is what `bigquery.service.ts` picks up automatically):
   ```
   gcloud auth application-default login
   ```
   This writes credentials to a well-known local path that the Node BigQuery
   client finds with zero extra config. Your IAM user needs at least
   `BigQuery Data Editor` (create dataset/table, load data) and
   `BigQuery Job User` (run queries) on the project.

3. **Create the dataset:**
   ```
   bq mk --dataset --location=US YOUR_PROJECT_ID:your_dataset
   ```

4. **Load the CSV with the schema in `server/data/nipt_schema.json`:**
   ```
   bq load --source_format=CSV --skip_leading_rows=1 \
     YOUR_PROJECT_ID:your_dataset.your_table \
     server/data/NIPT_v4_2026_data_pull_patients_10k.csv \
     server/data/nipt_schema.json
   ```
   Dates in the CSV must be `YYYY-MM-DD` to match the `DATE` columns, or
   `bq load` will reject those rows.

5. **Fill in `server/.env`:**
   ```
   GEMINI_API_KEY=your-actual-key
   BQ_PROJECT_ID=your-project-id
   BQ_DATASET=your_dataset
   BQ_TABLE=your_table
   ```

6. **Sanity check before hitting the app:**
   ```
   bq query --use_legacy_sql=false \
     'SELECT COUNT(*) FROM `YOUR_PROJECT_ID.your_dataset.your_table`'
   ```
   If that returns a row count, the Node BigQuery client (same ADC
   credentials) will work too.

## Project layout

| Path | Purpose |
|------|---------|
| `src/app/app.ts` / `app.html` | Dashboard + chat shell, KPI logic |
| `src/app/services/chat.service.ts` | `POST /api/chat` with `{ message }` |
| `src/app/chart-card/` | ECharts renderer for one chart result |
| `src/app/models/chat.model.ts` | Request/response contract |
| `proxy.conf.json` | Dev proxy `/api` → `:3000` |
| `server/src/routes/chat.ts` | Routes a message to SQL generation + BigQuery, or plain chat |
| `server/src/services/gemini.service.ts` | Gemini calls: text-to-SQL and plain chat |
| `server/src/services/bigquery.service.ts` | Validates and runs the generated SQL against BigQuery |
| `server/src/schema/nipt.schema.ts` | Source of truth for the NIPT table's columns |

## Build for production

```
npm run build   # output in dist/hackathon-front/browser/
```

> Note: ECharts pushes the initial bundle up a bit, so the production budget
> in `angular.json` is raised accordingly. If you want it smaller, import
> ECharts via `echarts/core` and register only the bar/line/pie charts you use.


You should not need to generate custom API keys in QwikLabs. Application Default Credentials, or ADC, is a secure, alternative method to standard API keys that uses the environment's existing identify for auth. Here's a doc re: configuring application default credentials:


 https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/start/gcp-auth?_gl=1*ikov69*_ga*MjAwMjQ0NjEyNi4xNzgzNTE2MTIz*_ga_WH2QY8WWF5*czE3ODM1MTYxMjIkbzEkZzEkdDE3ODM1MTY1NTMkajYwJGwwJGgw
