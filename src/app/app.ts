import { Component, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChartCard } from './chart-card/chart-card';
import {
  ChartData,
  ChartResult,
  ChatMessage,
  GlobalFilters,
  RenderedChart,
} from './models/chat.model';
import { ChatService } from './services/chat.service';

interface Kpi {
  label: string;
  value: string;
}

const SUGGESTIONS = [
  'Sample count by batch',
  'Average AutoFF over time',
  'Grayzone breakdown as a doughnut',
  'chr21 vs AutoFF as a scatter plot',
  'Histogram of AutoFF',
];

const STORAGE_KEY = 'ai-insights-dashboard-v1';
const LIVE_REFRESH_MS = 60_000;

const GREETING: ChatMessage = {
  role: 'bot',
  text: 'Hi! Ask me about the NIPT results data — e.g. "sample count by batch". You can also refine the last chart ("same thing as a pie chart") or click a bar to drill down.',
};

@Component({
  selector: 'app-root',
  imports: [FormsModule, ChartCard],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnDestroy {
  private readonly chat = inject(ChatService);

  protected readonly suggestions = SUGGESTIONS;

  // ----- Chat / charts state -----
  protected readonly messages = signal<ChatMessage[]>([GREETING]);
  protected readonly charts = signal<RenderedChart[]>([]);
  protected readonly draft = signal('');
  protected readonly loading = signal(false);
  /** Progress line shown in the typing indicator ("Running BigQuery…"). */
  protected readonly status = signal('');
  /** True once text deltas started streaming into a bot bubble. */
  protected readonly streaming = signal(false);
  protected readonly qcLoading = signal(false);
  protected readonly defaultsLoading = signal(false);

  // ----- Global filters -----
  protected readonly filterFrom = signal('');
  protected readonly filterTo = signal('');
  protected readonly filterGender = signal<'all' | 'male' | 'female'>('all');
  protected readonly filterBatch = signal('');
  protected readonly batchOptions = signal<string[]>([]);
  /** The filters currently applied to every chart (empty = none). */
  private readonly appliedFilters = signal<GlobalFilters>({});
  protected readonly filtersActive = computed(
    () => Object.keys(this.appliedFilters()).length > 0,
  );

  /** Pinned charts first, otherwise keep insertion/drag order. */
  protected readonly sortedCharts = computed(() => {
    const list = this.charts();
    return [...list.filter((c) => c.pinned), ...list.filter((c) => !c.pinned)];
  });

  /** KPI cards are derived live from the most recent chart with plain values. */
  protected readonly kpis = computed<Kpi[]>(() => {
    const latest = [...this.charts()].reverse().find((c) => c.values.length > 0);
    if (!latest) return [];

    const values = latest.values;
    const total = values.reduce((a, b) => a + b, 0);
    const max = Math.max(...values);
    const topIdx = values.indexOf(max);

    return [
      { label: latest.title, value: this.fmt(total) },
      { label: 'Top performer', value: `${latest.labels[topIdx]} (${this.fmt(max)})` },
      { label: 'Categories', value: String(values.length) },
      { label: 'Average', value: this.fmt(Math.round(total / values.length)) },
    ];
  });

  private draggedId: string | null = null;
  private readonly liveTimer = setInterval(() => {
    for (const chart of this.charts()) {
      if (chart.live) this.refreshChart(chart.id, { silent: true });
    }
  }, LIVE_REFRESH_MS);

  constructor() {
    this.restoreState();

    // Persist the dashboard + transcript on every change.
    effect(() => {
      const state = { charts: this.charts(), messages: this.messages().slice(-50) };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // Storage full/unavailable — persistence is best-effort.
      }
    });

    this.chat.batches().subscribe({
      next: (batches) => this.batchOptions.set(batches),
      error: () => {},
    });

    if (!this.charts().length) this.loadDefaultCharts();
  }

  /** The two canned starter charts ("runs" = the Batch column). */
  private loadDefaultCharts(): void {
    this.defaultsLoading.set(true);
    this.chat.defaultCharts().subscribe({
      next: (results) => {
        const rendered = results.map((result): RenderedChart => {
          const { type: _type, ...payload } = result;
          return { ...payload, id: crypto.randomUUID(), pinned: false, live: false };
        });
        // Prepend, in case the user already asked for a chart while these loaded.
        this.charts.update((list) => [...rendered, ...list]);
        if (this.filtersActive()) rendered.forEach((c) => this.refreshChart(c.id, { silent: true }));
        this.defaultsLoading.set(false);
      },
      error: (err) => {
        this.defaultsLoading.set(false);
        this.botSay(`Couldn't load the starter charts: ${err?.error?.error ?? 'server error'}`);
      },
    });
  }

  ngOnDestroy(): void {
    clearInterval(this.liveTimer);
  }

  // ----- Chat -----
  protected useSuggestion(text: string): void {
    this.sendMessage(text);
  }

  protected send(): void {
    const message = this.draft().trim();
    if (!message) return;
    this.sendMessage(message);
  }

  private sendMessage(message: string, lastSqlOverride?: string): void {
    if (this.loading()) return;

    const history = this.messages().slice(-10);
    this.messages.update((m) => [...m, { role: 'user', text: message }]);
    this.draft.set('');
    this.loading.set(true);
    this.streaming.set(false);
    this.status.set('Thinking…');

    const lastSql = lastSqlOverride ?? this.charts().at(-1)?.sql;
    let streamText = '';

    this.chat.send(message, history, lastSql).subscribe({
      next: (ev) => {
        switch (ev.event) {
          case 'status':
            this.status.set(ev.message);
            break;
          case 'delta':
            streamText += ev.text;
            if (!this.streaming()) {
              this.streaming.set(true);
              this.messages.update((m) => [...m, { role: 'bot', text: streamText }]);
            } else {
              this.messages.update((m) =>
                m.map((msg, i) => (i === m.length - 1 ? { ...msg, text: streamText } : msg)),
              );
            }
            break;
          case 'chart':
            this.addChart(ev.chart);
            break;
          case 'error':
            this.botSay(ev.message);
            break;
          case 'done':
            break;
        }
      },
      error: () => {
        this.botSay(
          "I couldn't reach the backend. Make sure the Node server is running on port 3000.",
        );
        this.loading.set(false);
        this.streaming.set(false);
        this.status.set('');
      },
      complete: () => {
        this.loading.set(false);
        this.streaming.set(false);
        this.status.set('');
      },
    });
  }

  private addChart(result: ChartResult): void {
    const { type: _type, ...payload } = result;
    const chart: RenderedChart = {
      ...payload,
      id: crypto.randomUUID(),
      pinned: false,
      live: false,
    };
    this.charts.update((c) => [...c, chart]);
    this.botSay(`Here's "${chart.title}" — added to your dashboard. 📊`, chart.followUps);

    // A new chart should respect any active global filters right away.
    if (this.filtersActive()) this.refreshChart(chart.id, { silent: true });
  }

  private botSay(text: string, followUps?: string[]): void {
    this.messages.update((m) => [...m, { role: 'bot', text, followUps }]);
  }

  // ----- Chart management -----
  protected removeChart(id: string): void {
    this.charts.update((c) => c.filter((chart) => chart.id !== id));
  }

  protected togglePin(id: string): void {
    this.patchChart(id, (c) => ({ pinned: !c.pinned }));
  }

  protected toggleLive(id: string): void {
    this.patchChart(id, (c) => ({ live: !c.live }));
  }

  protected refreshChart(id: string, opts: { silent?: boolean } = {}): void {
    const chart = this.charts().find((c) => c.id === id);
    if (!chart) return;

    this.chat.runSql(chart.sql, this.appliedFilters()).subscribe({
      next: (data: ChartData) => this.patchChart(id, () => ({ ...data })),
      error: (err) => {
        if (!opts.silent) {
          this.botSay(`Refreshing "${chart.title}" failed: ${err?.error?.error ?? 'query error'}`);
        }
      },
    });
  }

  protected clearDashboard(): void {
    this.charts.set([]);
    this.messages.set([GREETING]);
    this.loadDefaultCharts();
  }

  private patchChart(id: string, patch: (c: RenderedChart) => Partial<RenderedChart>): void {
    this.charts.update((list) =>
      list.map((c) => (c.id === id ? { ...c, ...patch(c) } : c)),
    );
  }

  // ----- Drill-down -----
  protected drillInto(chart: RenderedChart, label: string): void {
    this.sendMessage(
      `Drill down into the "${label}" segment of the chart "${chart.title}" — break that subset down by another meaningful column.`,
      chart.sql,
    );
  }

  // ----- QC view -----
  protected runQc(): void {
    if (this.qcLoading()) return;
    this.qcLoading.set(true);
    this.chat.qc().subscribe({
      next: (chart) => {
        this.addChart(chart);
        this.qcLoading.set(false);
      },
      error: (err) => {
        this.botSay(`QC view failed: ${err?.error?.error ?? 'server error'}`);
        this.qcLoading.set(false);
      },
    });
  }

  // ----- Global filters -----
  protected applyFilters(): void {
    const filters: GlobalFilters = {};
    if (this.filterFrom()) filters.dateFrom = this.filterFrom();
    if (this.filterTo()) filters.dateTo = this.filterTo();
    if (this.filterGender() !== 'all') filters.male = this.filterGender() === 'male';
    if (this.filterBatch()) filters.batch = this.filterBatch();

    this.appliedFilters.set(filters);
    this.charts().forEach((c) => this.refreshChart(c.id));
  }

  protected resetFilters(): void {
    this.filterFrom.set('');
    this.filterTo.set('');
    this.filterGender.set('all');
    this.filterBatch.set('');
    this.appliedFilters.set({});
    this.charts().forEach((c) => this.refreshChart(c.id));
  }

  // ----- Drag-to-reorder -----
  protected onDragStart(id: string): void {
    this.draggedId = id;
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  protected onDrop(targetId: string): void {
    const draggedId = this.draggedId;
    this.draggedId = null;
    if (!draggedId || draggedId === targetId) return;

    this.charts.update((list) => {
      const from = list.findIndex((c) => c.id === draggedId);
      const to = list.findIndex((c) => c.id === targetId);
      if (from < 0 || to < 0) return list;
      const next = [...list];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  // ----- Persistence -----
  private restoreState(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const state = JSON.parse(raw) as { charts?: RenderedChart[]; messages?: ChatMessage[] };
      if (state.charts?.length) this.charts.set(state.charts);
      if (state.messages?.length) this.messages.set(state.messages);
    } catch {
      // Corrupt/absent state — start fresh.
    }
  }

  private fmt(n: number): string {
    return new Intl.NumberFormat('en-US').format(n);
  }
}
