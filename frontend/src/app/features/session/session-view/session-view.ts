import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription, switchMap, tap } from 'rxjs';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService } from '../../../core/api.service';
import { SseService } from '../../../core/sse.service';
import {
  Agent,
  Council,
  MessageType,
  QuestionType,
  SessionStatus,
  SseAgentMessage,
  SseAwaitingHumanTurn,
  SseAwaitingHumanVote,
  SseCandidateProposed,
  SseCandidatesFinalized,
  SseError,
  SseModeratorAction,
  SseRoundComplete,
  SseVotingCast,
  Verdict,
  Vote,
  VotingMechanism,
} from '../../../core/models';
import { DebatePanel, DebateMessage } from '../debate-panel/debate-panel';
import { VotingPanel } from '../voting-panel/voting-panel';
import { HumanVoteForm } from '../human-vote-form/human-vote-form';
import { HumanTurnInput } from '../human-turn-input/human-turn-input';
import { VerdictCard } from '../verdict-card/verdict-card';

@Component({
  selector: 'app-session-view',
  imports: [DebatePanel, VotingPanel, HumanVoteForm, HumanTurnInput, VerdictCard, MatProgressSpinnerModule],
  templateUrl: './session-view.html',
  styleUrl: './session-view.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionView implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ApiService);
  private readonly sse = inject(SseService);
  // DestroyRef over ngOnDestroy: modern Angular pattern that works with inject()
  // and doesn't require implementing a lifecycle interface.
  private readonly destroyRef = inject(DestroyRef);

  readonly sessionId = signal('');
  readonly messages = signal<DebateMessage[]>([]);
  readonly currentRound = signal(0);
  readonly votes = signal<Vote[]>([]);
  readonly verdict = signal<Verdict | null>(null);
  readonly sessionStatus = signal<SessionStatus>('pending');
  readonly votingMechanism = signal<VotingMechanism>('majority');
  readonly questionType = signal<QuestionType>('binary');
  readonly agents = signal<Agent[]>([]);
  readonly waitingForHuman = signal(false);
  readonly inputClaim = signal('');
  readonly loading = signal(true);
  readonly candidates = signal<string[]>([]);
  readonly proposedCandidates = signal<{agent_id: string; agent_name: string; candidates: string[]}[]>([]);
  readonly moderatorExplanation = signal<string | null>(null);
  private sseSub: Subscription | null = null;

  readonly isVotingPhase = computed(() => {
    const status = this.sessionStatus();
    const voteCount = this.votes().length;
    const agentCount = this.agents().length;
    return (
      (status === 'complete' && voteCount > 0) ||
      (status === 'voting' && agentCount > 0 && voteCount >= agentCount)
    );
  });
  readonly showHumanTurnInput = computed(
    () => this.sessionStatus() === 'awaiting_human_turn',
  );
  readonly showHumanForm = computed(
    () =>
      this.waitingForHuman() &&
      this.votingMechanism() === 'human_in_loop' &&
      this.sessionStatus() === 'voting',
  );
  readonly isComplete = computed(() => this.sessionStatus() === 'complete');

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.sessionId.set(id);
    if (!id) return;

    this.destroyRef.onDestroy(() => this.sseSub?.unsubscribe());
    this.initializeSession(id);
  }

  onHumanTurnSubmitted(content: string): void {
    this.messages.update((m) => [
      ...m,
      { agent_id: null, agent_name: 'You', round: this.currentRound(), content },
    ]);
    this.waitingForHuman.set(false);
    this.sessionStatus.set('pending');
    // Re-connect SSE — backend resets session to "pending" after human turn
    this.reconnectSse();
  }

  onHumanVoted(verdict: Verdict): void {
    this.verdict.set(verdict);
    this.sessionStatus.set('complete');
    this.waitingForHuman.set(false);
  }

  private initializeSession(sessionId: string): void {
    this.loading.set(true);
    this.api
      .getSession(sessionId)
      .pipe(
        tap((session) => {
          this.sessionStatus.set(session.status);
          this.inputClaim.set(session.input_claim);
          this.questionType.set(session.question_type ?? 'binary');
        }),
        switchMap((session) => this.api.getCouncil(session.council_id)),
      )
      .subscribe({
        next: (council: Council) => {
          this.agents.set(council.agents);
          this.votingMechanism.set(council.voting_mechanism);
          this.loading.set(false);
          this.handleInitialStatus(sessionId);
        },
        error: () => {
          this.loading.set(false);
          this.sessionStatus.set('error');
        },
      });
  }

  private handleInitialStatus(sessionId: string): void {
    switch (this.sessionStatus()) {
      case 'complete':
        this.loadHistoricalState(sessionId, () => {
          this.api.getVerdict(sessionId).subscribe((verdict) => {
            this.verdict.set(verdict);
          });
        });
        break;
      case 'error':
        this.loadHistoricalState(sessionId);
        break;
      case 'awaiting_human_turn':
        this.loadHistoricalState(sessionId, () => {
          this.waitingForHuman.set(true);
        });
        break;
      case 'voting':
        // If human_in_loop, the SSE stream already ended — just show the vote form.
        // Otherwise, reconnect SSE to continue receiving voting_cast events.
        this.loadHistoricalState(sessionId, () => {
          if (this.votingMechanism() === 'human_in_loop') {
            this.waitingForHuman.set(true);
          } else {
            this.connectSse(sessionId);
          }
        });
        break;
      default:
        // pending, running — load history then connect SSE for live updates
        this.loadHistoricalState(sessionId, () => this.connectSse(sessionId));
        break;
    }
  }

  private loadHistoricalState(sessionId: string, onComplete?: () => void): void {
    this.api.getSessionMessages(sessionId).subscribe({
      next: (state) => {
        const debateMessages: DebateMessage[] = state.messages.map((m) => ({
          agent_id: m.agent_id,
          agent_name: m.agent_name ?? undefined,
          message_type: m.message_type,
          round: m.round_number,
          content: m.content,
        }));
        this.messages.set(debateMessages);

        if (state.messages.length > 0) {
          const maxRound = Math.max(...state.messages.map((m) => m.round_number));
          this.currentRound.set(maxRound);
        }

        if (state.votes.length > 0) {
          this.votes.set(state.votes);
        }

        // Reconstruct proposal and moderator state from persisted messages
        const proposals: {agent_id: string; agent_name: string; candidates: string[]}[] = [];
        for (const m of state.messages) {
          if (m.message_type === 'proposal' && m.agent_id) {
            try {
              const parsed = JSON.parse(m.content);
              proposals.push({
                agent_id: m.agent_id,
                agent_name: m.agent_name ?? 'Unknown Agent',
                candidates: parsed.candidates ?? [],
              });
            } catch { /* skip malformed */ }
          }
          if (m.message_type === 'moderator') {
            try {
              const parsed = JSON.parse(m.content);
              this.moderatorExplanation.set(parsed.explanation ?? null);
              this.candidates.set(parsed.candidates ?? []);
            } catch { /* skip malformed */ }
          }
        }
        if (proposals.length > 0) {
          this.proposedCandidates.set(proposals);
        }

        onComplete?.();
      },
      error: () => {
        // Non-fatal — historical messages just won't be available
        onComplete?.();
      },
    });
  }

  private connectSse(sessionId: string): void {
    this.sseSub?.unsubscribe();
    this.sseSub = this.sse
      .connect(`/api/v1/sessions/${sessionId}/stream`)
      .subscribe({
        next: (event) => this.handleSseEvent(event),
        error: () => {
          // Only set error if session isn't in a valid terminal/paused state.
          // SSE fires onerror on connection close — this includes normal closes
          // after awaiting_human_turn, awaiting_human_vote (status='voting'), or verdict.
          const status = this.sessionStatus();
          if (status !== 'complete' && status !== 'awaiting_human_turn' && status !== 'voting') {
            this.sessionStatus.set('error');
          }
        },
        complete: () => {
          // Stream closed normally (e.g., server returned after awaiting_human_turn).
          // Status was already set by the last SSE event — nothing to do.
        },
      });

  }

  private reconnectSse(): void {
    this.connectSse(this.sessionId());
  }

  private handleSseEvent(event: MessageEvent): void {
    let raw: unknown;
    try {
      raw = JSON.parse(event.data);
    } catch {
      return;
    }

    switch (event.type) {
      case 'agent_message': {
        const data = raw as SseAgentMessage;
        this.sessionStatus.set('running');
        this.messages.update((m) => [...m, data as DebateMessage]);
        this.currentRound.set(data.round);
        break;
      }
      case 'round_complete': {
        const data = raw as SseRoundComplete;
        this.currentRound.set(data.round);
        break;
      }
      case 'candidate_proposed': {
        const data = raw as SseCandidateProposed;
        this.sessionStatus.set('proposing');
        this.proposedCandidates.update((p) => [...p, data]);
        this.messages.update((m) => [...m, {
          agent_id: data.agent_id,
          agent_name: data.agent_name,
          message_type: 'proposal' as MessageType,
          round: this.currentRound(),
          content: JSON.stringify({ candidates: data.candidates }),
        }]);
        break;
      }
      case 'candidates_finalized': {
        const data = raw as SseCandidatesFinalized;
        this.candidates.set(data.candidates);
        break;
      }
      case 'moderator_action': {
        const data = raw as SseModeratorAction;
        this.moderatorExplanation.set(data.explanation);
        this.messages.update((m) => [...m, {
          agent_id: null,
          agent_name: 'Moderator',
          message_type: 'moderator' as MessageType,
          round: this.currentRound(),
          content: JSON.stringify({ explanation: data.explanation }),
        }]);
        break;
      }
      case 'voting_cast': {
        const data = raw as SseVotingCast;
        this.sessionStatus.set('voting');
        this.votes.update((v) => [
          ...v,
          { ...data, value: data.vote ?? data.value ?? '' } as unknown as Vote,
        ]);
        break;
      }
      case 'verdict': {
        this.verdict.set(raw as Verdict);
        this.sessionStatus.set('complete');
        break;
      }
      case 'awaiting_human_turn': {
        const data = raw as SseAwaitingHumanTurn;
        this.sessionStatus.set('awaiting_human_turn');
        this.currentRound.set(data.round);
        this.waitingForHuman.set(true);
        break;
      }
      case 'awaiting_human_vote': {
        const data = raw as SseAwaitingHumanVote;
        console.log('[SSE] Awaiting human vote:', data.message);
        this.sessionStatus.set('voting');
        this.waitingForHuman.set(true);
        break;
      }
      case 'error': {
        const data = raw as SseError;
        console.error('[SSE] Session error:', data.message);
        this.sessionStatus.set('error');
        break;
      }
    }
  }
}
