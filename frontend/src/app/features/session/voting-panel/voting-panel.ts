import { Component, computed, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { Agent, Vote, VotingMechanism } from '../../../core/models';

@Component({
  selector: 'app-voting-panel',
  imports: [
    MatCardModule,
    MatChipsModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './voting-panel.html',
  styleUrl: './voting-panel.scss',
})
export class VotingPanel {
  readonly votes = input.required<Vote[]>();
  readonly agents = input.required<Agent[]>();
  readonly votingMechanism = input.required<VotingMechanism>();

  readonly voteMap = computed(() => {
    const map = new Map<string, Vote>();
    for (const vote of this.votes()) {
      map.set(vote.agent_id, vote);
    }
    return map;
  });

  agentVote(agentId: string): Vote | undefined {
    return this.voteMap().get(agentId);
  }

  confidencePercent(confidence: number | null): number {
    return confidence != null ? Math.round(confidence * 100) : 0;
  }

  voteColor(value: string): string {
    const lower = value.toLowerCase();
    if (lower === 'true' || lower === 'yes' || lower === 'agree') return 'affirm';
    if (lower === 'false' || lower === 'no' || lower === 'disagree') return 'oppose';
    return 'neutral';
  }
}
