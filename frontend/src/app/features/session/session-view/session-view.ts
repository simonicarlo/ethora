import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
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
import { VotingPanel } from '../voting-panel/voting-panel';
import { HumanVoteForm } from '../human-vote-form/human-vote-form';
import { VerdictCard } from '../verdict-card/verdict-card';

@Component({
  selector: 'app-session-view',
  imports: [VotingPanel, HumanVoteForm, VerdictCard],
  templateUrl: './session-view.html',
  styleUrl: './session-view.scss',
})
export class SessionView implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ApiService);
  private readonly sse = inject(SseService);
  private readonly destroyRef = inject(DestroyRef);

  readonly sessionId = signal('');
  readonly votes = signal<Vote[]>([]);
  readonly verdict = signal<Verdict | null>(null);
  readonly sessionStatus = signal<SessionStatus>('pending');
  readonly votingMechanism = signal<VotingMechanism>('majority');
  readonly agents = signal<Agent[]>([]);
  readonly waitingForHuman = signal(false);

  readonly isVotingPhase = computed(
    () => this.sessionStatus() === 'voting' || this.sessionStatus() === 'complete',
  );
  readonly showHumanForm = computed(
    () => this.waitingForHuman() && this.votingMechanism() === 'human_in_loop',
  );
  readonly isComplete = computed(() => this.sessionStatus() === 'complete');

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.sessionId.set(id);
    if (!id) return;

    this.loadCouncilInfo(id);
    this.connectSse(id);
  }

  onHumanVoted(verdict: Verdict): void {
    this.verdict.set(verdict);
    this.sessionStatus.set('complete');
    this.waitingForHuman.set(false);
  }

  private loadCouncilInfo(sessionId: string): void {
    // Load session to get council_id, then load council for agents & mechanism
    this.api.getSession(sessionId).subscribe({
      next: (session) => {
        this.sessionStatus.set(session.status as SessionStatus);
        this.api.getCouncil(session.council_id).subscribe({
          next: (council: Council) => {
            this.agents.set(council.agents);
            this.votingMechanism.set(council.voting_mechanism);
          },
        });
      },
    });
  }

  private connectSse(sessionId: string): void {
    const sub = this.sse
      .connect(`/api/v1/sessions/${sessionId}/stream`)
      .subscribe({
        next: (event) => this.handleSseEvent(event),
        error: () => {
          // SSE connection closed — check if session is complete
          if (this.sessionStatus() !== 'complete') {
            this.sessionStatus.set('error');
          }
        },
      });

    this.destroyRef.onDestroy(() => sub.unsubscribe());
  }

  private handleSseEvent(event: MessageEvent): void {
    const data = JSON.parse(event.data);

    switch (event.type) {
      case 'voting_cast':
        this.sessionStatus.set('voting');
        this.votes.update((v) => [...v, data as Vote]);
        break;
      case 'verdict':
        this.verdict.set(data as Verdict);
        this.sessionStatus.set('complete');
        break;
      case 'status':
        if (data.status === 'waiting_for_human') {
          this.sessionStatus.set('voting');
          this.waitingForHuman.set(true);
        } else if (data.status) {
          this.sessionStatus.set(data.status as SessionStatus);
        }
        break;
    }
  }
}
