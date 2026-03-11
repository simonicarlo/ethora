import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { ApiService } from '../../../core/api.service';
import { Agent, AgentCreate } from '../../../core/models';
import { AgentForm } from '../agent-form/agent-form';

@Component({
  selector: 'app-agent-edit',
  imports: [AgentForm, MatProgressSpinnerModule],
  template: `
    <div class="page-header">
      <h1>Edit Agent</h1>
    </div>
    @if (loading()) {
      <div class="center">
        <mat-spinner diameter="48"></mat-spinner>
      </div>
    } @else if (agent()) {
      <app-agent-form [agent]="agent()" submitLabel="Save Changes" [submitting]="submitting()" [error]="error()" (save)="onSave($event)" />
    }
  `,
  styleUrl: './agent-edit.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentEdit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly agent = signal<Agent | null>(null);
  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.api.getAgent(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (agent) => {
        this.agent.set(agent);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load agent');
        this.loading.set(false);
      },
    });
  }

  onSave(data: AgentCreate): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.submitting.set(true);
    this.error.set(null);

    this.api.updateAgent(id, data).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => this.router.navigate(['/agents']),
      error: (err) => {
        this.error.set(err?.error?.detail ?? 'Failed to update agent');
        this.submitting.set(false);
      },
    });
  }
}
