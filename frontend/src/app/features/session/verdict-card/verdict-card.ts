import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { Verdict } from '../../../core/models';
import { MarkdownPipe } from '../../../shared/pipes/markdown.pipe';
import { confidencePercent, voteColorClass } from '../../../shared/utils/vote-display.utils';

@Component({
  selector: 'app-verdict-card',
  imports: [DatePipe, MatCardModule, MatIconModule, MatProgressBarModule, MarkdownPipe],
  templateUrl: './verdict-card.html',
  styleUrl: './verdict-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VerdictCard {
  readonly verdict = input.required<Verdict>();

  readonly confidencePercent = computed(() => confidencePercent(this.verdict().confidence));

  readonly decisionClass = computed(() => voteColorClass(this.verdict().decision));

  readonly decisionIcon = computed(() => {
    const cls = this.decisionClass();
    if (cls === 'affirm') return 'check_circle';
    if (cls === 'oppose') return 'cancel';
    return 'help';
  });
}
