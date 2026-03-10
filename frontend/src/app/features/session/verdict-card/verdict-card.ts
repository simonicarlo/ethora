import { Component, computed, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { Verdict } from '../../../core/models';

@Component({
  selector: 'app-verdict-card',
  imports: [DatePipe, MatCardModule, MatIconModule, MatProgressBarModule],
  templateUrl: './verdict-card.html',
  styleUrl: './verdict-card.scss',
})
export class VerdictCard {
  readonly verdict = input.required<Verdict>();

  readonly confidencePercent = computed(() => {
    const c = this.verdict().confidence;
    return c != null ? Math.round(c * 100) : 0;
  });

  readonly decisionClass = computed(() => {
    const d = this.verdict().decision.toLowerCase();
    if (d === 'true' || d === 'yes' || d === 'agree') return 'affirm';
    if (d === 'false' || d === 'no' || d === 'disagree') return 'oppose';
    return 'neutral';
  });

  readonly decisionIcon = computed(() => {
    const cls = this.decisionClass();
    if (cls === 'affirm') return 'check_circle';
    if (cls === 'oppose') return 'cancel';
    return 'help';
  });
}
