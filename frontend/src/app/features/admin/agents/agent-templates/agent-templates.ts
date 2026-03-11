import { ChangeDetectionStrategy, Component, DestroyRef, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { ApiService } from '../../../../core/api.service';
import { Agent } from '../../../../core/models';
import { AGENT_TEMPLATES, AgentTemplate } from './templates.data';

@Component({
  selector: 'app-agent-templates',
  imports: [MatButtonModule, MatCardModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './agent-templates.html',
  styleUrl: './agent-templates.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentTemplates {
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly templates = AGENT_TEMPLATES;
  readonly cloning = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  readonly cloned = output<Agent>();

  clone(template: AgentTemplate): void {
    if (this.cloning()) return;
    this.cloning.set(template.name);
    this.error.set(null);

    this.api.createAgent({
      name: template.name,
      system_prompt: template.system_prompt,
      model: template.model,
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (agent) => {
        this.cloned.emit(agent);
        this.cloning.set(null);
      },
      error: (err) => {
        this.error.set(err?.error?.detail ?? `Failed to create agent from template "${template.name}"`);
        this.cloning.set(null);
      },
    });
  }
}
