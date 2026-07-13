import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  ChartData,
  ChartResult,
  ChatMessage,
  GlobalFilters,
  StreamEvent,
} from '../models/chat.model';

/**
 * Talks to the Node backend. The backend queries BigQuery directly, so only
 * the message (plus recent history for follow-up resolution) needs to be sent.
 */
@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly http = inject(HttpClient);

  /**
   * Sends a chat message and emits the server-sent events as they stream in:
   * status lines, text deltas, a chart result, or an error — then completes.
   */
  send(message: string, history: ChatMessage[], lastSql?: string): Observable<StreamEvent> {
    return new Observable<StreamEvent>((sub) => {
      const ctrl = new AbortController();

      fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          history: history.map(({ role, text }) => ({ role, text })),
          lastSql,
        }),
        signal: ctrl.signal,
      })
        .then(async (res) => {
          if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            let sep: number;
            while ((sep = buffer.indexOf('\n\n')) >= 0) {
              const frame = buffer.slice(0, sep).trim();
              buffer = buffer.slice(sep + 2);
              if (frame.startsWith('data: ')) {
                sub.next(JSON.parse(frame.slice(6)) as StreamEvent);
              }
            }
          }
          sub.complete();
        })
        .catch((err) => {
          if (!ctrl.signal.aborted) sub.error(err);
        });

      return () => ctrl.abort();
    });
  }

  /** Re-runs a chart's stored SQL, optionally with global filters injected. */
  runSql(sql: string, filters?: GlobalFilters): Observable<ChartData> {
    return this.http.post<ChartData>('/api/query', { sql, filters });
  }

  /** The two canned charts shown when the dashboard is empty on load. */
  defaultCharts(): Observable<ChartResult[]> {
    return this.http.get<ChartResult[]>('/api/default-charts');
  }

  /** Canned QC chart: grayzone rate per batch with outlier highlighting. */
  qc(): Observable<ChartResult> {
    return this.http.get<ChartResult>('/api/qc');
  }

  /** Distinct batch ids for the global filter dropdown. */
  batches(): Observable<string[]> {
    return this.http.get<string[]>('/api/batches');
  }
}
