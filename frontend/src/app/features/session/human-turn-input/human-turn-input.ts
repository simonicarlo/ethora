import { Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import { ApiService } from '../../../core/api.service';

@Component({
  selector: 'app-human-turn-input',
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './human-turn-input.html',
  styleUrl: './human-turn-input.scss',
})
export class HumanTurnInput {
  readonly sessionId = input.required<string>();
  readonly submitted = output<void>();

  readonly content = signal('');
  readonly submitting = signal(false);
  readonly error = signal('');

  constructor(private readonly api: ApiService) {}

  onSubmit(): void {
    if (!this.content().trim()) return;

    this.submitting.set(true);
    this.error.set('');

    this.api.sendHumanTurn(this.sessionId(), this.content().trim()).subscribe({
      next: () => {
        this.submitting.set(false);
        this.content.set('');
        this.submitted.emit();
      },
      error: (err) => {
        this.submitting.set(false);
        this.error.set(err?.error?.detail ?? 'Failed to submit human turn');
      },
    });
  }
}
