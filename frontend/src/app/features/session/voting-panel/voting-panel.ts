import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { Agent, QuestionType, Vote, VotingMechanism } from '../../../core/models';
import { confidencePercent, voteColorClass } from '../../../shared/utils/vote-display.utils';
import { MarkdownPipe } from '../../../shared/pipes/markdown.pipe';

@Component({
  selector: 'app-voting-panel',
  imports: [
    MatCardModule,
    MatChipsModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MarkdownPipe,
  ],
  templateUrl: './voting-panel.html',
  styleUrl: './voting-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VotingPanel {
  readonly votes = input.required<Vote[]>();
  readonly agents = input.required<Agent[]>();
  readonly votingMechanism = input.required<VotingMechanism>();
  readonly candidates = input<string[]>([]);
  readonly questionType = input<QuestionType>('binary');

  readonly candidateVoteCounts = computed(() => {
    if (this.questionType() !== 'open' || this.candidates().length === 0) return [];
    const counts = new Map<string, { count: number; totalConfidence: number }>();
    for (const c of this.candidates()) {
      counts.set(c, { count: 0, totalConfidence: 0 });
    }
    for (const vote of this.votes()) {
      const entry = counts.get(vote.value);
      if (entry) {
        entry.count++;
        entry.totalConfidence += vote.confidence ?? 0;
      }
    }
    return this.candidates().map((c) => ({
      candidate: c,
      count: counts.get(c)?.count ?? 0,
      totalConfidence: counts.get(c)?.totalConfidence ?? 0,
    }));
  });

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
