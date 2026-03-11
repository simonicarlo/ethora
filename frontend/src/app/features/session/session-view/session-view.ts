import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription, switchMap, tap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService } from '../../../core/api.service';
import { SseService } from '../../../core/sse.service';
import {
  Agent,
  Council,
  QuestionType,
  SessionStatus,
  SseAgentMessage,
  SseAgentTyping,
  SseAwaitingHumanTurn,
  SseAwaitingHumanVote,
  SseCandidateProposed,
  SseCandidatesFinalized,
  SseClosingStatement,
  SseError,
  SseRateLimited,
  SseModeratorAction,
  StageSetData,
  SseRoundComplete,
  SseSummaryReady,
  SseToolUse,
  SseVotingCast,
  Verdict,
  Vote,
  VotingMechanism,
} from '../../../core/models';
import { DebatePanel, DebateMessage, ToolActivity } from '../debate-panel/debate-panel';
import { VotingPanel } from '../voting-panel/voting-panel';
import { HumanVoteForm } from '../human-vote-form/human-vote-form';
import { HumanTurnInput } from '../human-turn-input/human-turn-input';
import { VerdictCard } from '../verdict-card/verdict-card';
import { MeshBackground } from '../../../shared/components/mesh-background/mesh-background';
import { MarkdownPipe } from '../../../shared/pipes/markdown.pipe';

@Component({
  selector: 'app-session-view',
  imports: [DebatePanel, VotingPanel, HumanVoteForm, HumanTurnInput, VerdictCard, MatButtonModule, MatCardModule, MatIconModule, MatProgressSpinnerModule, MeshBackground, MarkdownPipe],
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
  readonly activeToolUse = signal<ToolActivity | null>(null);
  readonly typingAgent = signal<{ agent_id: string; agent_name: string } | null>(null);
  readonly votingInProgress = signal(false);
  readonly closingStatements = signal<{agent_id: string; agent_name: string; statement: string}[]>([]);
  readonly retryAfter = signal<number | null>(null);
  readonly stageSet = signal<StageSetData | null>(null);
  private sseSub: Subscription | null = null;

  readonly isVotingPhase = computed(() => {
    if (this.questionType() === 'research') return false;
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

  private readonly agentMap = computed(() => {
    const map = new Map<string, Agent>();
    for (const a of this.agents()) map.set(a.id, a);
    return map;
  });

  getAgentIcon(agentId: string): string {
    return this.agentMap().get(agentId)?.icon ?? 'smart_toy';
  }

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

  resumeSession(): void {
    this.sessionStatus.set('pending');
    this.retryAfter.set(null);
    this.connectSse(this.sessionId());
  }

  formatWait(seconds: number): string {
    if (seconds >= 120) return `~${Math.round(seconds / 60)} minutes`;
    if (seconds >= 60) return '~1 minute';
    return `~${Math.round(seconds)} seconds`;
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
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (council: Council) => {
          this.agents.set(council.agents);
          this.votingMechanism.set(council.voting_mechanism);
          // Build synthetic stage-set from council metadata (LLM intro unavailable on cold load)
          this.stageSet.set({
            council_name: council.name,
            input_claim: this.inputClaim(),
            agents: council.agents.map((a) => ({
              id: a.id,
              name: a.name,
              icon: a.icon || 'smart_toy',
              // NB: approximates backend's _extract_role_summary(); minor regex divergence is acceptable
              description: a.system_prompt.split(/[.!][\s\n]/)[0]?.slice(0, 80) || a.name,
            })),
            rounds: council.rounds,
            voting_mechanism: council.voting_mechanism,
            question_type: this.questionType(),
            intro_text: null,
          });
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
          this.api.getVerdict(sessionId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe((verdict) => {
            this.verdict.set(verdict);
          });
        });
        break;
      case 'error':
      case 'rate_limited':
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
    this.api.getSessionMessages(sessionId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (state) => {
        // Filter out proposal/moderator messages from debate timeline
        const debateMessages: DebateMessage[] = state.messages
          .filter((m) => m.message_type !== 'proposal' && m.message_type !== 'moderator')
          .map((m) => ({
            agent_id: m.agent_id,
            agent_name: m.agent_name ?? undefined,
            message_type: m.message_type,
            round: m.round_number,
            content: m.content,
            summary: m.summary,
            references: m.references ?? [],
          }));
        this.messages.set(debateMessages);

        if (state.messages.length > 0) {
          const maxRound = Math.max(...state.messages.map((m) => m.round_number));
          this.currentRound.set(maxRound);
        }

        if (state.votes.length > 0) {
          // Split closing statements from regular votes
          const closingVotes = state.votes.filter((v) => v.value === 'closing_statement');
          const regularVotes = state.votes.filter((v) => v.value !== 'closing_statement');

          if (closingVotes.length > 0) {
            const agentsList = this.agents();
            this.closingStatements.set(
              closingVotes.map((v) => ({
                agent_id: v.agent_id,
                agent_name: agentsList.find((a) => a.id === v.agent_id)?.name ?? 'Unknown Agent',
                statement: v.reasoning ?? '',
              })),
            );
          }

          if (regularVotes.length > 0) {
            this.votes.set(regularVotes);
          }
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
          if (status !== 'complete' && status !== 'awaiting_human_turn' && status !== 'voting' && status !== 'rate_limited') {
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
      case 'stage_set': {
        this.stageSet.set(raw as StageSetData);
        break;
      }
      case 'stage_set_intro': {
        const data = raw as { intro_text: string };
        this.stageSet.update((prev) =>
          prev ? { ...prev, intro_text: data.intro_text } : prev,
        );
        break;
      }
      case 'agent_message': {
        const data = raw as SseAgentMessage;
        this.sessionStatus.set('running');
        this.activeToolUse.set(null);
        this.typingAgent.set(null);
        this.messages.update((m) => [...m, {
          message_id: data.message_id,
          agent_id: data.agent_id,
          agent_name: data.agent_name,
          round: data.round,
          content: data.content,
          references: data.references ?? [],
        }]);
        this.currentRound.set(data.round);
        break;
      }
      case 'agent_typing': {
        const data = raw as SseAgentTyping;
        this.typingAgent.set({ agent_id: data.agent_id, agent_name: data.agent_name });
        break;
      }
      case 'summary_ready': {
        const data = raw as SseSummaryReady;
        this.messages.update((msgs) =>
          msgs.map((m) =>
            m.message_id === data.message_id ? { ...m, summary: data.summary } : m,
          ),
        );
        break;
      }
      case 'tool_use': {
        const data = raw as SseToolUse;
        this.activeToolUse.set({
          agent_id: data.agent_id,
          agent_name: data.agent_name,
          tool_name: data.tool_name,
        });
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
        break;
      }
      case 'closing_statement': {
        const data = raw as SseClosingStatement;
        this.sessionStatus.set('closing_statements');
        this.closingStatements.update((s) => [...s, {
          agent_id: data.agent_id,
          agent_name: data.agent_name,
          statement: data.statement,
        }]);
        break;
      }
      case 'voting_started': {
        this.sessionStatus.set('voting');
        this.votingInProgress.set(true);
        this.typingAgent.set(null);
        this.activeToolUse.set(null);
        break;
      }
      case 'voting_cast': {
        const data = raw as SseVotingCast;
        this.sessionStatus.set('voting');
        this.votingInProgress.set(false);
        this.votes.update((v) => [
          ...v,
          this.mapSseVotingCastToVote(data),
        ]);
        break;
      }
      case 'verdict': {
        this.verdict.set(raw as Verdict);
        this.sessionStatus.set('complete');
        this.votingInProgress.set(false);
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
      case 'rate_limited': {
        const data = raw as SseRateLimited;
        console.warn('[SSE] Rate limited:', data.message, 'retry_after:', data.retry_after);
        this.sessionStatus.set('rate_limited');
        this.retryAfter.set(data.retry_after);
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

  private mapSseVotingCastToVote(data: SseVotingCast): Vote {
    return {
      id: '',
      agent_id: data.agent_id,
      value: data.vote ?? data.value ?? '',
      confidence: data.confidence,
      reasoning: data.reasoning,
    };
  }
}
