import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';

import { ApiService } from '../../../../core/api.service';
import { Agent } from '../../../../core/models';
import { AgentTestBench } from '../agent-test-bench/agent-test-bench';
import { AgentTemplates } from '../agent-templates/agent-templates';

@Component({
  selector: 'app-agent-config',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatTabsModule,
    AgentTestBench,
    AgentTemplates,
  ],
  templateUrl: './agent-config.html',
  styleUrl: './agent-config.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentConfig {
  private readonly api = inject(ApiService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly agents = signal<Agent[]>([]);
  readonly selectedAgent = signal<Agent | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);
  readonly isCreateMode = signal(false);

  readonly hasSelection = computed(() => this.selectedAgent() !== null || this.isCreateMode());

  readonly modelOptions = [
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
  ] as const;

  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    system_prompt: ['', Validators.required],
    model: ['claude-sonnet-4-20250514'],
  });

  constructor() {
    this.loadAgents();
  }

  private loadAgents(): void {
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

  selectAgent(agent: Agent): void {
    this.selectedAgent.set(agent);
    this.isCreateMode.set(false);
    this.error.set(null);
    this.form.patchValue({
      name: agent.name,
      system_prompt: agent.system_prompt,
      model: agent.model,
    });
  }

  startCreate(): void {
    this.selectedAgent.set(null);
    this.isCreateMode.set(true);
    this.error.set(null);
    this.form.reset({ name: '', system_prompt: '', model: 'claude-sonnet-4-20250514' });
  }

  onSave(): void {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);

    const data = this.form.getRawValue();
    const selected = this.selectedAgent();

    const request$ = selected
      ? this.api.updateAgent(selected.id, data)
      : this.api.createAgent(data);

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (saved) => {
        if (selected) {
          this.agents.update(list => list.map(a => a.id === saved.id ? saved : a));
        } else {
          this.agents.update(list => [...list, saved]);
        }
        this.selectedAgent.set(saved);
        this.isCreateMode.set(false);
        this.saving.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.detail ?? 'Failed to save agent');
        this.saving.set(false);
      },
    });
  }

  onDelete(): void {
    const agent = this.selectedAgent();
    if (!agent) return;
    if (!confirm(`Delete agent "${agent.name}"? This cannot be undone.`)) return;

    this.api.deleteAgent(agent.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.agents.update(list => list.filter(a => a.id !== agent.id));
        this.selectedAgent.set(null);
        this.isCreateMode.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.detail ?? 'Failed to delete agent');
      },
    });
  }

  onAgentCloned(agent: Agent): void {
    this.agents.update(list => [...list, agent]);
    this.selectAgent(agent);
  }
}
