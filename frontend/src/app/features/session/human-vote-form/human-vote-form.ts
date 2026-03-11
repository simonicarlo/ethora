import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSliderModule } from '@angular/material/slider';

import { ApiService } from '../../../core/api.service';
import { Verdict } from '../../../core/models';

@Component({
  selector: 'app-human-vote-form',
  imports: [
    DecimalPipe,
    FormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSliderModule,
  ],
  templateUrl: './human-vote-form.html',
  styleUrl: './human-vote-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HumanVoteForm {
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly sessionId = input.required<string>();
  readonly voted = output<Verdict>();

  readonly decision = signal('');
  readonly confidence = signal(0.5);
  readonly reasoning = signal('');
  readonly submitting = signal(false);
  readonly error = signal('');

  onSubmit(): void {
    if (!this.decision()) return;

    this.submitting.set(true);
    this.error.set('');

    this.api
      .submitHumanVote(this.sessionId(), {
        decision: this.decision(),
        confidence: this.confidence(),
        reasoning: this.reasoning() || undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (verdict) => {
          this.submitting.set(false);
          this.voted.emit(verdict);
        },
        error: (err) => {
          this.submitting.set(false);
          this.error.set(err?.error?.detail ?? 'Failed to submit vote');
        },
      });
  }
}
