import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import {
  Agent,
  AgentCreate,
  AgentTestResponse,
  AgentUpdate,
  Council,
  CouncilCreate,
  CouncilUpdate,
  Session,
  SessionCreate,
  SessionListItem,
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

  updateCouncil(id: string, data: CouncilUpdate): Observable<Council> {
    return this.put<Council>(`/councils/${id}`, data);
  }

  deleteCouncil(id: string): Observable<void> {
    return this.delete<void>(`/councils/${id}`);
  }

  getAgents(): Observable<Agent[]> {
    return this.get<Agent[]>('/agents');
  }

  createAgent(data: AgentCreate): Observable<Agent> {
    return this.post<Agent>('/agents', data);
  }

  getAgent(id: string): Observable<Agent> {
    return this.get<Agent>(`/agents/${id}`);
  }

  updateAgent(id: string, data: AgentUpdate): Observable<Agent> {
    return this.put<Agent>(`/agents/${id}`, data);
  }

  deleteAgent(id: string): Observable<void> {
    return this.delete<void>(`/agents/${id}`);
  }

  testAgent(id: string, message: string): Observable<AgentTestResponse> {
    return this.post<AgentTestResponse>(`/agents/${id}/test`, { message });
  }

  listSessions(params?: { council_id?: string; status?: string; limit?: number }): Observable<SessionListItem[]> {
    let httpParams = new HttpParams();
    if (params?.council_id) httpParams = httpParams.set('council_id', params.council_id);
    if (params?.status) httpParams = httpParams.set('status', params.status);
    if (params?.limit) httpParams = httpParams.set('limit', params.limit.toString());
    return this.http.get<SessionListItem[]>(`${this.basePath}/sessions`, { params: httpParams });
  }

  deleteSession(id: string): Observable<void> {
    return this.delete<void>(`/sessions/${id}`);
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
