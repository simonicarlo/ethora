import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription, switchMap, tap } from 'rxjs';
import { ApiService } from '../../../core/api.service';
import { SseService } from '../../../core/sse.service';
import {
  Agent,
  Council,
  SessionStatus,
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
  imports: [DebatePanel, VotingPanel, HumanVoteForm, HumanTurnInput, VerdictCard],
  templateUrl: './session-view.html',
  styleUrl: './session-view.scss',
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
  readonly agents = signal<Agent[]>([]);
  readonly waitingForHuman = signal(false);
  private sseSub: Subscription | null = null;

  readonly isVotingPhase = computed(
    () => this.sessionStatus() === 'voting' || this.sessionStatus() === 'complete',
  );
  readonly showHumanTurnInput = computed(
    () => this.sessionStatus() === 'awaiting_human_turn',
  );
  readonly showHumanForm = computed(
    () => this.waitingForHuman() && this.votingMechanism() === 'human_in_loop',
  );
  readonly isComplete = computed(() => this.sessionStatus() === 'complete');

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.sessionId.set(id);
    if (!id) return;

    this.destroyRef.onDestroy(() => this.sseSub?.unsubscribe());
    this.loadCouncilInfo(id);
    this.connectSse(id);
  }

  onHumanTurnSubmitted(): void {
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

  private loadCouncilInfo(sessionId: string): void {
    this.api
      .getSession(sessionId)
      .pipe(
        tap((session) => this.sessionStatus.set(session.status as SessionStatus)),
        switchMap((session) => this.api.getCouncil(session.council_id)),
      )
      .subscribe((council: Council) => {
        this.agents.set(council.agents);
        this.votingMechanism.set(council.voting_mechanism);
      });
  }

  private connectSse(sessionId: string): void {
    this.sseSub?.unsubscribe();
    this.sseSub = this.sse
      .connect(`/api/v1/sessions/${sessionId}/stream`)
      .subscribe({
        next: (event) => this.handleSseEvent(event),
        error: () => {
          // SSE fires onerror on normal close too — only set error state if the
          // session hasn't already completed (avoids false error on clean shutdown).
          if (this.sessionStatus() !== 'complete') {
            this.sessionStatus.set('error');
          }
        },
      });

  }

  private reconnectSse(): void {
    this.connectSse(this.sessionId());
  }

  private handleSseEvent(event: MessageEvent): void {
    let data: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }

    switch (event.type) {
      case 'agent_message':
        this.sessionStatus.set('running');
        this.messages.update((m) => [...m, data as DebateMessage]);
        this.currentRound.set(data.round);
        break;
      case 'round_complete':
        this.currentRound.set(data.round);
        break;
      case 'voting_cast':
        this.sessionStatus.set('voting');
        this.votes.update((v) => [
          ...v,
          { ...data, value: data.vote ?? data.value } as Vote,
        ]);
        break;
      case 'verdict':
        this.verdict.set(data as Verdict);
        this.sessionStatus.set('complete');
        break;
      case 'awaiting_human_turn':
        this.sessionStatus.set('awaiting_human_turn');
        this.waitingForHuman.set(true);
        break;
      case 'awaiting_human_vote':
        this.sessionStatus.set('voting');
        this.waitingForHuman.set(true);
        break;
      case 'error':
        this.sessionStatus.set('error');
        break;
    }
  }
}
