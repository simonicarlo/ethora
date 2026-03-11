import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { ApiService } from '../../../core/api.service';
import { Agent } from '../../../core/models';

@Component({
  selector: 'app-agent-list',
  imports: [
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './agent-list.html',
  styleUrl: './agent-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentList {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly agents = signal<Agent[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  constructor() {
    this.api.getAgents().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (agents) => {
        this.agents.set(agents);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.message ?? 'Failed to load agents');
        this.loading.set(false);
      },
    });
  }

  deleteAgent(agent: Agent): void {
    if (!confirm(`Delete agent "${agent.name}"? This cannot be undone.`)) return;

    this.api.deleteAgent(agent.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.agents.update(agents => agents.filter(a => a.id !== agent.id));
      },
      error: (err) => {
        this.error.set(err?.error?.detail ?? 'Failed to delete agent');
      },
    });
  }
}
