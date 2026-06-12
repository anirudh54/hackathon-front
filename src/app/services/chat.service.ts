import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ChatResponse, Schema } from '../models/chat.model';

/**
 * Talks to the Spring Boot proxy. Sends the message plus the column schema only —
 * never the data. The backend asks Gemini for a chart spec and returns it.
 */
@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly http = inject(HttpClient);

  send(message: string, schema: Schema | null): Observable<ChatResponse> {
    return this.http.post<ChatResponse>('/api/chat', { message, schema });
  }
}
