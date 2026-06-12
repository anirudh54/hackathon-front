import {
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  effect,
  input,
  viewChild,
} from '@angular/core';
import * as echarts from 'echarts';
import { RenderedChart } from '../models/chat.model';

const PALETTE = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b',
  '#10b981', '#06b6d4', '#ef4444', '#84cc16',
];

/** Renders a single backend chart spec with ECharts. */
@Component({
  selector: 'app-chart-card',
  standalone: true,
  template: `
    <div class="card">
      <h3 class="card__title">{{ spec().title }}</h3>
      <div class="card__chart" #host></div>
    </div>
  `,
  styleUrl: './chart-card.scss',
})
export class ChartCard implements OnDestroy {
  readonly spec = input.required<RenderedChart>();

  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private chart?: echarts.ECharts;
  private readonly onResize = () => this.chart?.resize();

  constructor() {
    afterNextRender(() => {
      this.chart = echarts.init(this.host().nativeElement, undefined, { renderer: 'canvas' });
      this.chart.setOption(this.buildOption(this.spec()), true);
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

    const isLine = s.chartType === 'line';
    return {
      color: PALETTE,
      tooltip: { trigger: 'axis' },
      grid: { left: 50, right: 24, top: 24, bottom: 36 },
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
      series: [
        {
          type: isLine ? 'line' : 'bar',
          data: s.values,
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
}
