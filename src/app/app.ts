import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChartCard } from './chart-card/chart-card';
import { RenderedChart, ChatMessage } from './models/chat.model';
import { ChatService } from './services/chat.service';

interface Kpi {
  label: string;
  value: string;
}

const SUGGESTIONS = [
  'Sample count by PASSFAIL',
  'Average reported fetal fraction by gender',
  'T21 results as a pie chart',
  'Which phase has the most samples?',
];

@Component({
  selector: 'app-root',
  imports: [FormsModule, ChartCard],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly chat = inject(ChatService);

  protected readonly suggestions = SUGGESTIONS;

  // ----- Chat / charts state -----
  protected readonly messages = signal<ChatMessage[]>([
    {
      role: 'bot',
      text: 'Hi! Ask me about the NIPT results data — e.g. "sample count by PASSFAIL".',
    },
  ]);
  protected readonly charts = signal<RenderedChart[]>([]);
  protected readonly draft = signal('');
  protected readonly loading = signal(false);

  /** KPI cards are derived live from the most recent chart. */
  protected readonly kpis = computed<Kpi[]>(() => {
    const latest = this.charts().at(-1);
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

  // ----- Chat -----
  protected useSuggestion(text: string): void {
    this.draft.set(text);
    this.send();
  }

  protected send(): void {
    const message = this.draft().trim();
    if (!message || this.loading()) return;

    this.messages.update((m) => [...m, { role: 'user', text: message }]);
    this.draft.set('');

    this.loading.set(true);
    this.chat.send(message).subscribe({
      next: (res) => {
        if (res.type === 'chart') {
          this.charts.update((c) => [...c, res]);
          this.botSay(`Here's "${res.title}" — added to your dashboard. 📊`);
        } else {
          this.botSay(res.reply);
        }
        this.loading.set(false);
      },
      error: () => {
        this.botSay("I couldn't reach the backend. Make sure the Node server is running on port 3000.");
        this.loading.set(false);
      },
    });
  }

  private botSay(text: string): void {
    this.messages.update((m) => [...m, { role: 'bot', text }]);
  }

  private fmt(n: number): string {
    return new Intl.NumberFormat('en-US').format(n);
  }
}
