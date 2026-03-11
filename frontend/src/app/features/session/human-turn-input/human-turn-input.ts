import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import { ApiService } from '../../../core/api.service';

@Component({
  selector: 'app-human-turn-input',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './human-turn-input.html',
  styleUrl: './human-turn-input.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HumanTurnInput {
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly sessionId = input.required<string>();
  readonly submitted = output<string>();

  readonly content = signal('');
  readonly submitting = signal(false);
  readonly error = signal('');

  protected getInputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  onSubmit(): void {
    if (!this.content().trim()) return;

    this.submitting.set(true);
    this.error.set('');

    const trimmed = this.content().trim();
    this.api.sendHumanTurn(this.sessionId(), trimmed).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.submitting.set(false);
        this.content.set('');
        this.submitted.emit(trimmed);
      },
      error: (err) => {
        this.submitting.set(false);
        this.error.set(err?.error?.detail ?? 'Failed to submit human turn');
      },
    });
  }
}
