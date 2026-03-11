import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';

import { ApiService } from '../../../core/api.service';
import { AgentCreate as AgentCreateData } from '../../../core/models';
import { AgentForm } from '../agent-form/agent-form';

@Component({
  selector: 'app-agent-create',
  imports: [AgentForm],
  template: `
    <div class="page-header">
      <h1>Create Agent</h1>
    </div>
    <app-agent-form submitLabel="Create Agent" [submitting]="submitting()" [error]="error()" (save)="onSave($event)" />
  `,
  styleUrl: './agent-create.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentCreate {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);

  onSave(data: AgentCreateData): void {
    this.submitting.set(true);
    this.error.set(null);

    this.api.createAgent(data).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => this.router.navigate(['/agents']),
      error: (err) => {
        this.error.set(err?.error?.detail ?? 'Failed to create agent');
        this.submitting.set(false);
      },
    });
  }
}
