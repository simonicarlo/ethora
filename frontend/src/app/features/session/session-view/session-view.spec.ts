import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { ActivatedRoute } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Subject } from 'rxjs';

import { SessionView } from './session-view';
import { SseService } from '../../../core/sse.service';

describe('SessionView', () => {
  let fixture: ComponentFixture<SessionView>;
  let component: SessionView;
  let httpMock: HttpTestingController;
  let sseSubject: Subject<MessageEvent>;

  const mockSession = {
    id: 'sess-1',
    council_id: 'council-1',
    input_claim: 'Test claim',
    status: 'pending',
    created_at: '2026-03-10T00:00:00Z',
  };

  const mockCouncil = {
    id: 'council-1',
    name: 'Test Council',
    rounds: 3,
    voting_mechanism: 'majority',
    allow_human_turns: false,
    tools_enabled: false,
    agents: [
      { id: 'a1', name: 'Agent 1', system_prompt: 'prompt', model: 'claude', icon: 'smart_toy' },
      { id: 'a2', name: 'Agent 2', system_prompt: 'prompt', model: 'claude', icon: 'smart_toy' },
    ],
  };

  const mockVerdict = {
    id: 'v1',
    session_id: 'sess-1',
    decision: 'affirm',
    confidence: 0.9,
    summary: 'The claim is supported.',
    created_at: '2026-03-10T00:00:00Z',
  };

  const emptySessionState = { messages: [], votes: [] };

  function flushInitRequests(
    sessionOverrides: Record<string, unknown> = {},
    sessionState: { messages: unknown[]; votes: unknown[] } = emptySessionState,
  ): void {
    const sessionReq = httpMock.expectOne('/api/v1/sessions/sess-1');
    sessionReq.flush({ ...mockSession, ...sessionOverrides });

    const councilReq = httpMock.expectOne('/api/v1/councils/council-1');
    councilReq.flush(mockCouncil);

    fixture.detectChanges();

    // handleInitialStatus now cold-loads messages for all statuses
    const messagesReq = httpMock.expectOne('/api/v1/sessions/sess-1/messages');
    messagesReq.flush(sessionState);

    fixture.detectChanges();
  }

  beforeEach(async () => {
    sseSubject = new Subject<MessageEvent>();

    await TestBed.configureTestingModule({
      imports: [SessionView, NoopAnimationsModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: { get: () => 'sess-1' } },
          },
        },
        {
          provide: SseService,
          useValue: { connect: () => sseSubject.asObservable() },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SessionView);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // Cancel any outstanding requests before verifying
    httpMock.match(() => true).forEach((req) => req.flush({}));
  });

  describe('loading state', () => {
    it('should show spinner while loading', () => {
      fixture.detectChanges();

      const spinner = fixture.nativeElement.querySelector('mat-spinner');
      expect(spinner).toBeTruthy();
      expect(component.loading()).toBe(true);
    });

    it('should hide spinner after session loads', () => {
      fixture.detectChanges();
      flushInitRequests();

      expect(component.loading()).toBe(false);
      const spinner = fixture.nativeElement.querySelector('mat-spinner');
      expect(spinner).toBeFalsy();
    });

    it('should show error and hide spinner when session fetch fails', () => {
      fixture.detectChanges();

      const sessionReq = httpMock.expectOne('/api/v1/sessions/sess-1');
      sessionReq.flush('Not Found', { status: 404, statusText: 'Not Found' });
      fixture.detectChanges();

      expect(component.loading()).toBe(false);
      expect(component.sessionStatus()).toBe('error');
      const errorBanner = fixture.nativeElement.querySelector('.error-banner');
      expect(errorBanner).toBeTruthy();
    });
  });

  describe('status-aware initialization', () => {
    it('should connect SSE for pending sessions', () => {
      fixture.detectChanges();
      flushInitRequests({ status: 'pending' });

      expect(component.sessionStatus()).toBe('pending');
      // SSE connected — send an event to verify
      sseSubject.next(new MessageEvent('agent_message', {
        data: JSON.stringify({ agent_id: 'a1', round: 1, content: 'Hello' }),
      }));

      expect(component.messages().length).toBe(1);
      expect(component.sessionStatus()).toBe('running');
    });

    it('should connect SSE for running sessions', () => {
      fixture.detectChanges();
      flushInitRequests({ status: 'running' });

      expect(component.sessionStatus()).toBe('running');
      sseSubject.next(new MessageEvent('agent_message', {
        data: JSON.stringify({ agent_id: 'a1', round: 1, content: 'Test' }),
      }));
      expect(component.messages().length).toBe(1);
    });

    it('should fetch verdict for complete sessions without connecting SSE', () => {
      fixture.detectChanges();
      flushInitRequests({ status: 'complete' });

      expect(component.sessionStatus()).toBe('complete');

      const verdictReq = httpMock.expectOne('/api/v1/sessions/sess-1/verdict');
      verdictReq.flush(mockVerdict);
      fixture.detectChanges();

      expect(component.verdict()).toEqual(mockVerdict);
    });

    it('should show error state for error sessions without connecting SSE', () => {
      fixture.detectChanges();
      flushInitRequests({ status: 'error' });

      expect(component.sessionStatus()).toBe('error');
      const errorBanner = fixture.nativeElement.querySelector('.error-banner');
      expect(errorBanner).toBeTruthy();
    });

    it('should show human turn input for awaiting_human_turn sessions', () => {
      fixture.detectChanges();
      flushInitRequests({ status: 'awaiting_human_turn' });

      expect(component.sessionStatus()).toBe('awaiting_human_turn');
      expect(component.waitingForHuman()).toBe(true);
      const humanInput = fixture.nativeElement.querySelector('app-human-turn-input');
      expect(humanInput).toBeTruthy();
    });

    it('should show human vote form when reconnecting to voting session with human_in_loop', () => {
      const humanCouncil = { ...mockCouncil, voting_mechanism: 'human_in_loop' };
      const mockVotes = [
        { id: 'v1', agent_id: 'a1', value: 'true', confidence: 0.9, reasoning: 'Yes' },
        { id: 'v2', agent_id: 'a2', value: 'false', confidence: 0.8, reasoning: 'No' },
      ];

      fixture.detectChanges();

      const sessionReq = httpMock.expectOne('/api/v1/sessions/sess-1');
      sessionReq.flush({ ...mockSession, status: 'voting' });

      const councilReq = httpMock.expectOne('/api/v1/councils/council-1');
      councilReq.flush(humanCouncil);
      fixture.detectChanges();

      const messagesReq = httpMock.expectOne('/api/v1/sessions/sess-1/messages');
      messagesReq.flush({ messages: [], votes: mockVotes });
      fixture.detectChanges();

      expect(component.sessionStatus()).toBe('voting');
      expect(component.waitingForHuman()).toBe(true);
      expect(component.showHumanForm()).toBe(true);
    });

    it('should store inputClaim from session response', () => {
      fixture.detectChanges();
      flushInitRequests({ status: 'pending', input_claim: 'Is Earth flat?' });

      expect(component.inputClaim()).toBe('Is Earth flat?');
    });
  });

  describe('historical state cold-loading', () => {
    const mockMessages = [
      { id: 'm1', round_number: 1, agent_id: 'a1', agent_name: 'Agent 1', content: 'First message', created_at: '2026-03-10T00:00:00Z' },
      { id: 'm2', round_number: 1, agent_id: null, agent_name: 'Human', content: 'Human input', created_at: '2026-03-10T00:01:00Z' },
    ];
    const mockVotes = [
      { id: 'v1', agent_id: 'a1', value: 'true', confidence: 0.9, reasoning: 'Agreed' },
      { id: 'v2', agent_id: 'a2', value: 'true', confidence: 0.8, reasoning: 'Concur' },
    ];

    it('should load historical messages including human messages on awaiting_human_turn init', () => {
      fixture.detectChanges();
      flushInitRequests(
        { status: 'awaiting_human_turn' },
        { messages: mockMessages, votes: [] },
      );

      // Human messages are now included
      expect(component.messages().length).toBe(2);
      expect(component.messages()[0].agent_id).toBe('a1');
      expect(component.messages()[1].agent_id).toBeNull();
      expect(component.currentRound()).toBe(1);
      expect(component.waitingForHuman()).toBe(true);
    });

    it('should load historical messages and votes on complete init', () => {
      fixture.detectChanges();
      flushInitRequests(
        { status: 'complete' },
        { messages: mockMessages, votes: mockVotes },
      );

      expect(component.messages().length).toBe(2);
      expect(component.votes().length).toBe(2);

      const verdictReq = httpMock.expectOne('/api/v1/sessions/sess-1/verdict');
      verdictReq.flush(mockVerdict);

      expect(component.verdict()).toEqual(mockVerdict);
    });

    it('should not show voting panel when votes are empty', () => {
      fixture.detectChanges();
      flushInitRequests({ status: 'complete' }, { messages: [], votes: [] });

      expect(component.isVotingPhase()).toBe(false);
    });

    it('should show voting panel when all agents have voted on complete', () => {
      fixture.detectChanges();
      flushInitRequests(
        { status: 'complete' },
        { messages: [], votes: mockVotes },
      );

      expect(component.isVotingPhase()).toBe(true);
    });
  });

  describe('SSE event handling', () => {
    beforeEach(() => {
      fixture.detectChanges();
      flushInitRequests({ status: 'pending' });
    });

    it('should update votes on voting_cast event', () => {
      sseSubject.next(new MessageEvent('voting_cast', {
        data: JSON.stringify({ agent_id: 'a1', vote: 'affirm', confidence: 0.8 }),
      }));

      expect(component.votes().length).toBe(1);
      expect(component.votes()[0].value).toBe('affirm');
      expect(component.sessionStatus()).toBe('voting');
    });

    it('should not show voting panel when only some agents have voted', () => {
      sseSubject.next(new MessageEvent('voting_cast', {
        data: JSON.stringify({ agent_id: 'a1', vote: 'affirm', confidence: 0.8 }),
      }));

      // Only 1 of 2 agents voted
      expect(component.isVotingPhase()).toBe(false);
    });

    it('should show voting panel when all agents have voted', () => {
      sseSubject.next(new MessageEvent('voting_cast', {
        data: JSON.stringify({ agent_id: 'a1', vote: 'affirm', confidence: 0.8 }),
      }));
      sseSubject.next(new MessageEvent('voting_cast', {
        data: JSON.stringify({ agent_id: 'a2', vote: 'oppose', confidence: 0.7 }),
      }));

      // Both agents voted
      expect(component.isVotingPhase()).toBe(true);
    });

    it('should set verdict on verdict event', () => {
      sseSubject.next(new MessageEvent('verdict', {
        data: JSON.stringify(mockVerdict),
      }));

      expect(component.verdict()).toEqual(mockVerdict);
      expect(component.sessionStatus()).toBe('complete');
    });

    it('should set error on SSE connection loss for non-complete session', () => {
      sseSubject.error(new Error('SSE connection lost'));

      expect(component.sessionStatus()).toBe('error');
    });

    it('should not set error on SSE connection loss for complete session', () => {
      component.sessionStatus.set('complete');
      sseSubject.error(new Error('SSE connection lost'));

      expect(component.sessionStatus()).toBe('complete');
    });

    it('should not set error on SSE connection loss for awaiting_human_turn session', () => {
      component.sessionStatus.set('awaiting_human_turn');
      sseSubject.error(new Error('SSE connection lost'));

      expect(component.sessionStatus()).toBe('awaiting_human_turn');
    });

    it('should not set error on SSE connection loss during voting phase', () => {
      component.sessionStatus.set('voting');
      sseSubject.error(new Error('SSE connection lost'));

      expect(component.sessionStatus()).toBe('voting');
    });

    it('should not change status on SSE stream completion', () => {
      component.sessionStatus.set('awaiting_human_turn');
      sseSubject.complete();

      expect(component.sessionStatus()).toBe('awaiting_human_turn');
    });

    it('should not show human vote form during awaiting_human_turn even with human_in_loop', () => {
      component.votingMechanism.set('human_in_loop');

      sseSubject.next(new MessageEvent('awaiting_human_turn', {
        data: JSON.stringify({ round: 1, message: 'Waiting for human input' }),
      }));

      expect(component.sessionStatus()).toBe('awaiting_human_turn');
      expect(component.waitingForHuman()).toBe(true);
      // Human vote form must NOT show between rounds
      expect(component.showHumanForm()).toBe(false);
      // Human turn input should show instead
      expect(component.showHumanTurnInput()).toBe(true);
    });

    it('should show human vote form only after awaiting_human_vote during voting phase', () => {
      component.votingMechanism.set('human_in_loop');

      // All agents vote
      sseSubject.next(new MessageEvent('voting_cast', {
        data: JSON.stringify({ agent_id: 'a1', vote: 'affirm', confidence: 0.8 }),
      }));
      sseSubject.next(new MessageEvent('voting_cast', {
        data: JSON.stringify({ agent_id: 'a2', vote: 'oppose', confidence: 0.7 }),
      }));

      expect(component.showHumanForm()).toBe(false);

      // Backend signals human vote needed
      sseSubject.next(new MessageEvent('awaiting_human_vote', {
        data: JSON.stringify({ message: 'Waiting for human to cast deciding vote' }),
      }));

      expect(component.sessionStatus()).toBe('voting');
      expect(component.waitingForHuman()).toBe(true);
      expect(component.showHumanForm()).toBe(true);
    });

    it('should append human message on human turn submitted', () => {
      // Simulate some existing messages
      sseSubject.next(new MessageEvent('agent_message', {
        data: JSON.stringify({ agent_id: 'a1', round: 1, content: 'Agent speaks' }),
      }));

      expect(component.messages().length).toBe(1);

      component.onHumanTurnSubmitted('My human input');

      expect(component.messages().length).toBe(2);
      expect(component.messages()[1].agent_id).toBeNull();
      expect(component.messages()[1].content).toBe('My human input');
      expect(component.messages()[1].agent_name).toBe('You');
    });
  });
});
