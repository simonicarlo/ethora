import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { Agent, Vote, VotingMechanism } from '../../../core/models';
import { confidencePercent, voteColorClass } from '../../../shared/utils/vote-display.utils';

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
  changeDetection: ChangeDetectionStrategy.OnPush,
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

  readonly confidencePercent = confidencePercent;
  readonly voteColor = voteColorClass;
}
