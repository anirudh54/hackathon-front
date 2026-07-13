import {
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  effect,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import * as echarts from 'echarts';
import { RenderedChart } from '../models/chat.model';

const PALETTE = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b',
  '#10b981', '#06b6d4', '#ef4444', '#84cc16',
];

const OUTLIER_COLOR = '#ef4444';

/** Renders a single backend chart spec with ECharts, plus card actions. */
@Component({
  selector: 'app-chart-card',
  standalone: true,
  templateUrl: './chart-card.html',
  styleUrl: './chart-card.scss',
})
export class ChartCard implements OnDestroy {
  readonly spec = input.required<RenderedChart>();

  readonly remove = output<void>();
  readonly togglePin = output<void>();
  readonly toggleLive = output<void>();
  readonly refreshChart = output<void>();
  /** Emits the clicked category label for drill-down. */
  readonly drill = output<string>();

  protected readonly showSql = signal(false);
  protected readonly showTable = signal(false);

  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private chart?: echarts.ECharts;
  private readonly onResize = () => this.chart?.resize();

  constructor() {
    afterNextRender(() => {
      this.chart = echarts.init(this.host().nativeElement, undefined, { renderer: 'canvas' });
      this.chart.setOption(this.buildOption(this.spec()), true);
      this.chart.on('click', (params) => {
        const name = typeof params.name === 'string' ? params.name : '';
        if (name && this.spec().chartType !== 'scatter') this.drill.emit(name);
      });
      window.addEventListener('resize', this.onResize);
    });

    // Re-render on any later spec change (no-op until the chart is initialised).
    effect(() => {
      const spec = this.spec();
      this.chart?.setOption(this.buildOption(spec), true);
    });
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.onResize);
    this.chart?.dispose();
  }

  protected toggleTable(): void {
    this.showTable.update((v) => !v);
    if (!this.showTable()) {
      // The chart div was display:none while the table was up; re-measure it.
      requestAnimationFrame(() => this.chart?.resize());
    }
  }

  protected downloadCsv(): void {
    const s = this.spec();
    const columns = s.columns.length ? s.columns : ['label', 'value'];
    const rows = s.rows.length
      ? s.rows
      : s.labels.map((label, i) => ({ label, value: s.values[i] }) as Record<string, unknown>);

    const escape = (v: unknown) => {
      const str = String(v ?? '');
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const csv = [
      columns.join(','),
      ...rows.map((row) => columns.map((c) => escape(row[c])).join(',')),
    ].join('\n');

    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${s.title.replace(/\W+/g, '_').replace(/^_|_$/g, '').toLowerCase() || 'chart'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private buildOption(s: RenderedChart): echarts.EChartsOption {
    if (s.chartType === 'pie' || s.chartType === 'doughnut') {
      return {
        color: PALETTE,
        tooltip: { trigger: 'item' },
        legend: { bottom: 0, textStyle: { color: '#9ca3af' } },
        series: [
          {
            type: 'pie',
            radius: s.chartType === 'doughnut' ? ['45%', '70%'] : '62%',
            center: ['50%', '46%'],
            avoidLabelOverlap: true,
            itemStyle: { borderColor: '#0f172a', borderWidth: 2 },
            label: { color: '#cbd5e1' },
            data: s.labels.map((name, i) => ({ name, value: s.values[i] })),
          },
        ],
      };
    }

    if (s.chartType === 'scatter') {
      return {
        color: PALETTE,
        tooltip: {
          trigger: 'item',
          formatter: (p: unknown) => {
            const { value } = p as { value: [number, number] };
            return `${value[0]} , ${value[1]}`;
          },
        },
        grid: { left: 56, right: 24, top: 24, bottom: 36 },
        xAxis: {
          type: 'value',
          scale: true,
          axisLabel: { color: '#9ca3af' },
          splitLine: { lineStyle: { color: '#1f2937' } },
        },
        yAxis: {
          type: 'value',
          scale: true,
          axisLabel: { color: '#9ca3af' },
          splitLine: { lineStyle: { color: '#1f2937' } },
        },
        series: [
          {
            type: 'scatter',
            data: s.points ?? [],
            symbolSize: 7,
            itemStyle: { opacity: 0.65 },
          },
        ],
      };
    }

    const isLine = s.chartType === 'line';
    const axes: Pick<echarts.EChartsOption, 'xAxis' | 'yAxis' | 'grid'> = {
      grid: { left: 50, right: 24, top: 28, bottom: 36 },
      xAxis: {
        type: 'category',
        data: s.labels,
        axisLabel: { color: '#9ca3af' },
        axisLine: { lineStyle: { color: '#374151' } },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: '#9ca3af' },
        splitLine: { lineStyle: { color: '#1f2937' } },
      },
    };

    // Grouped / split series ("… split by gender").
    if (s.series?.length) {
      return {
        color: PALETTE,
        tooltip: { trigger: 'axis' },
        legend: { top: 0, textStyle: { color: '#9ca3af' } },
        ...axes,
        grid: { ...(axes.grid as object), top: 40 },
        series: s.series.map((ser) => ({
          name: ser.name,
          type: isLine ? 'line' : 'bar',
          data: ser.values,
          stack: s.stacked && !isLine ? 'total' : undefined,
          smooth: isLine,
          symbolSize: 6,
          itemStyle: { borderRadius: isLine || s.stacked ? 0 : [4, 4, 0, 0] },
        })),
      };
    }

    return {
      color: PALETTE,
      tooltip: { trigger: 'axis' },
      ...axes,
      series: [
        {
          type: isLine ? 'line' : 'bar',
          data: this.seriesData(s),
          smooth: isLine,
          showSymbol: isLine,
          symbolSize: 7,
          areaStyle: isLine ? { opacity: 0.15 } : undefined,
          barWidth: '52%',
          itemStyle: { borderRadius: isLine ? 0 : [6, 6, 0, 0] },
        },
      ],
    };
  }

  /** Single-series data; flags values beyond mean + 2σ in red for QC charts. */
  private seriesData(s: RenderedChart): (number | { value: number; itemStyle: object })[] {
    if (!s.highlightOutliers || s.values.length < 4) return s.values;

    const mean = s.values.reduce((a, b) => a + b, 0) / s.values.length;
    const sd = Math.sqrt(
      s.values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / s.values.length,
    );
    if (!sd) return s.values;

    return s.values.map((v) =>
      v > mean + 2 * sd ? { value: v, itemStyle: { color: OUTLIER_COLOR } } : v,
    );
  }
}
