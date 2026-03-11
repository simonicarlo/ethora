import { ChangeDetectionStrategy, Component, inject, input, output, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { Agent, AgentCreate } from '../../../core/models';

@Component({
  selector: 'app-agent-form',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  templateUrl: './agent-form.html',
  styleUrl: './agent-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentForm implements OnInit {
  private readonly fb = inject(FormBuilder);

  readonly agent = input<Agent | null>(null);
  readonly submitLabel = input('Create Agent');
  readonly submitting = input(false);
  readonly error = input<string | null>(null);
  readonly save = output<AgentCreate>();

  readonly modelOptions = [
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
  ] as const;

  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    system_prompt: ['', Validators.required],
    model: ['claude-sonnet-4-20250514'],
  });

  ngOnInit(): void {
    const agent = this.agent();
    if (agent) {
      this.form.patchValue({
        name: agent.name,
        system_prompt: agent.system_prompt,
        model: agent.model,
      });
    }
  }

  onSubmit(): void {
    if (this.form.invalid || this.submitting()) return;
    this.save.emit(this.form.getRawValue());
  }
}
