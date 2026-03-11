import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { ApiService } from '../../../../core/api.service';
import { Agent } from '../../../../core/models';

@Component({
  selector: 'app-agent-test-bench',
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './agent-test-bench.html',
  styleUrl: './agent-test-bench.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentTestBench {
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly agent = input.required<Agent>();

  readonly testMessage = signal('');
  readonly sending = signal(false);
  readonly response = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  send(): void {
    const message = this.testMessage().trim();
    if (!message || this.sending()) return;

    this.sending.set(true);
    this.response.set(null);
    this.error.set(null);

    this.api.testAgent(this.agent().id, message)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.response.set(result.response);
          this.sending.set(false);
        },
        error: (err) => {
          this.error.set(err?.error?.detail ?? 'Test failed — could not reach the LLM.');
          this.sending.set(false);
        },
      });
  }
}
