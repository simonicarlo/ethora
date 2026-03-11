import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import {
  Agent,
  AgentCreate,
  Council,
  CouncilCreate,
  Session,
  SessionCreate,
  SessionState,
  Verdict,
} from './models';

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private readonly basePath = '/api/v1';

  constructor(private readonly http: HttpClient) {}

  private get<T>(path: string): Observable<T> {
    return this.http.get<T>(`${this.basePath}${path}`);
  }

  private post<T>(path: string, body: unknown): Observable<T> {
    return this.http.post<T>(`${this.basePath}${path}`, body);
  }

  private put<T>(path: string, body: unknown): Observable<T> {
    return this.http.put<T>(`${this.basePath}${path}`, body);
  }

  private delete<T>(path: string): Observable<T> {
    return this.http.delete<T>(`${this.basePath}${path}`);
  }

  getCouncils(): Observable<Council[]> {
    return this.get<Council[]>('/councils');
  }

  getCouncil(id: string): Observable<Council> {
    return this.get<Council>(`/councils/${id}`);
  }

  createCouncil(data: CouncilCreate): Observable<Council> {
    return this.post<Council>('/councils', data);
  }

  getAgents(): Observable<Agent[]> {
    return this.get<Agent[]>('/agents');
  }

  createAgent(data: AgentCreate): Observable<Agent> {
    return this.post<Agent>('/agents', data);
  }

  createSession(data: SessionCreate): Observable<Session> {
    return this.post<Session>('/sessions', data);
  }

  getSession(id: string): Observable<Session> {
    return this.get<Session>(`/sessions/${id}`);
  }

  getSessionMessages(sessionId: string): Observable<SessionState> {
    return this.get<SessionState>(`/sessions/${sessionId}/messages`);
  }

  getVerdict(sessionId: string): Observable<Verdict> {
    return this.get<Verdict>(`/sessions/${sessionId}/verdict`);
  }

  sendHumanTurn(sessionId: string, content: string): Observable<{ status: string }> {
    return this.post<{ status: string }>(`/sessions/${sessionId}/human-turn`, { content });
  }

  submitHumanVote(
    sessionId: string,
    data: { decision: string; confidence: number; reasoning?: string },
  ): Observable<Verdict> {
    return this.post<Verdict>(`/sessions/${sessionId}/human-vote`, data);
  }
}
