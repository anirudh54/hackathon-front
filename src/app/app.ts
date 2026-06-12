import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChartCard } from './chart-card/chart-card';
import { DataRow, RenderedChart, Schema, ChatMessage } from './models/chat.model';
import { ChatService } from './services/chat.service';
import { ExcelService, SAMPLE_DATA } from './services/excel.service';

interface Kpi {
  label: string;
  value: string;
}

const SUGGESTIONS = [
  'Show me amount by region',
  'Sales by product as a pie chart',
  'Average amount per region as a line',
  'Which region performs best?',
];

@Component({
  selector: 'app-root',
  imports: [FormsModule, ChartCard],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly chat = inject(ChatService);
  private readonly excel = inject(ExcelService);

  protected readonly suggestions = SUGGESTIONS;

  // ----- Dataset state -----
  protected readonly rows = signal<DataRow[]>([]);
  protected readonly schema = signal<Schema | null>(null);
  protected readonly fileName = signal<string | null>(null);
  protected readonly dragOver = signal(false);
  protected readonly hasData = computed(() => this.rows().length > 0);

  // ----- Chat / charts state -----
  protected readonly messages = signal<ChatMessage[]>([
    {
      role: 'bot',
      text: "Hi! Upload an Excel file (or load the sample) and ask me to chart it — e.g. \"show me amount by region\".",
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

  // ----- Upload -----
  protected onFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.loadFile(file);
    input.value = ''; // allow re-uploading the same file
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) this.loadFile(file);
  }

  protected async loadFile(file: File): Promise<void> {
    try {
      const rows = await this.excel.parse(file);
      if (!rows.length) {
        this.botSay('That file looks empty — try another sheet or file.');
        return;
      }
      this.setDataset(rows, file.name);
    } catch {
      this.botSay("I couldn't read that file. Please upload a valid .xlsx or .csv.");
    }
  }

  protected loadSample(): void {
    this.setDataset([...SAMPLE_DATA], 'sample-sales.xlsx');
  }

  private setDataset(rows: DataRow[], name: string): void {
    const schema = this.excel.deriveSchema(rows);
    this.rows.set(rows);
    this.schema.set(schema);
    this.fileName.set(name);
    this.charts.set([]); // old charts belong to the old dataset
    this.botSay(
      `Loaded "${name}" — ${rows.length} rows. Categories: ${schema.categorical.join(', ') || 'none'}. ` +
        `Measures: ${schema.numeric.join(', ') || 'none'}. Ask me to chart it!`,
    );
  }

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

    if (!this.hasData()) {
      this.botSay('Upload a file or load the sample data first, then I can chart it.');
      return;
    }

    this.loading.set(true);
    this.chat.send(message, this.schema()).subscribe({
      next: (res) => {
        if (res.type === 'chart') {
          const rendered = this.excel.aggregate(this.rows(), res);
          this.charts.update((c) => [...c, rendered]);
          this.botSay(`Here's "${rendered.title}" — added to your dashboard. 📊`);
        } else {
          this.botSay(res.reply);
        }
        this.loading.set(false);
      },
      error: () => {
        this.botSay("I couldn't reach the backend. Make sure the Spring Boot app is running on port 8080.");
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
