import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';

import { ApiService } from './api.service';
import type { AgentCreate, SessionCreate } from './models';

describe('ApiService', () => {
  let service: ApiService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(ApiService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getCouncils', () => {
    it('should make GET request to /api/v1/councils', () => {
      const mockCouncils = [
        {
          id: '1',
          name: 'Test Council',
          rounds: 3,
          voting_mechanism: 'majority' as const,
          allow_human_turns: false,
          tools_enabled: false,
          agents: [],
        },
      ];

      service.getCouncils().subscribe((councils) => {
        expect(councils).toEqual(mockCouncils);
      });

      const req = httpTesting.expectOne('/api/v1/councils');
      expect(req.request.method).toBe('GET');
      req.flush(mockCouncils);
    });
  });

  describe('createAgent', () => {
    it('should make POST request to /api/v1/agents with body', () => {
      const agentData: AgentCreate = {
        name: 'Test Agent',
        system_prompt: 'You are a test agent.',
        model: 'claude-sonnet-4-20250514',
      };
      const mockAgent = {
        id: 'a1',
        name: agentData.name,
        system_prompt: agentData.system_prompt,
        model: 'claude-sonnet-4-20250514',
      };

      service.createAgent(agentData).subscribe((agent) => {
        expect(agent).toEqual(mockAgent);
      });

      const req = httpTesting.expectOne('/api/v1/agents');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(agentData);
      req.flush(mockAgent);
    });
  });

  describe('createSession', () => {
    it('should make POST request to /api/v1/sessions with body', () => {
      const sessionData: SessionCreate = {
        council_id: 'c1',
        input_claim: 'The sky is blue.',
      };
      const mockSession = {
        id: 's1',
        council_id: sessionData.council_id,
        input_claim: sessionData.input_claim,
        status: 'pending' as const,
        created_at: '2026-03-10T00:00:00Z',
      };

      service.createSession(sessionData).subscribe((session) => {
        expect(session).toEqual(mockSession);
      });

      const req = httpTesting.expectOne('/api/v1/sessions');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(sessionData);
      req.flush(mockSession);
    });
  });

  describe('getVerdict', () => {
    it('should make GET request to /api/v1/sessions/:id/verdict', () => {
      const sessionId = 's1';
      const mockVerdict = {
        id: 'v1',
        session_id: sessionId,
        decision: 'true',
        confidence: 0.85,
        summary: 'The council agrees.',
        created_at: '2026-03-10T00:00:00Z',
      };

      service.getVerdict(sessionId).subscribe((verdict) => {
        expect(verdict).toEqual(mockVerdict);
      });

      const req = httpTesting.expectOne(`/api/v1/sessions/${sessionId}/verdict`);
      expect(req.request.method).toBe('GET');
      req.flush(mockVerdict);
    });
  });

  describe('submitHumanVote', () => {
    it('should make POST request to /api/v1/sessions/:id/human-vote with correct payload', () => {
      const sessionId = 's1';
      const voteData = {
        decision: 'agree',
        confidence: 0.9,
        reasoning: 'I concur with the majority.',
      };
      const mockVerdict = {
        id: 'v1',
        session_id: sessionId,
        decision: 'agree',
        confidence: 0.9,
        summary: 'Human decided.',
        created_at: '2026-03-10T00:00:00Z',
      };

      service.submitHumanVote(sessionId, voteData).subscribe((verdict) => {
        expect(verdict).toEqual(mockVerdict);
      });

      const req = httpTesting.expectOne(`/api/v1/sessions/${sessionId}/human-vote`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(voteData);
      req.flush(mockVerdict);
    });

    it('should send payload without reasoning when not provided', () => {
      const sessionId = 's2';
      const voteData = { decision: 'disagree', confidence: 0.6 };

      service.submitHumanVote(sessionId, voteData).subscribe();

      const req = httpTesting.expectOne(`/api/v1/sessions/${sessionId}/human-vote`);
      expect(req.request.body).toEqual(voteData);
      req.flush({});
    });
  });
});
