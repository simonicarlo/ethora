import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { ApiService } from '../../../core/api.service';

@Component({
  selector: 'app-agent-create',
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
  templateUrl: './agent-create.html',
  styleUrl: './agent-create.scss',
})
export class AgentCreate {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);

  readonly modelOptions = [
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
  ] as const;

  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    system_prompt: ['', Validators.required],
    model: ['claude-sonnet-4-20250514'],
  });

  onSubmit(): void {
    if (this.form.invalid || this.submitting()) return;

    this.submitting.set(true);
    this.error.set(null);

    this.api.createAgent(this.form.getRawValue()).subscribe({
      next: () => {
        this.router.navigate(['/agents']);
      },
      error: (err) => {
        this.error.set(err?.error?.detail ?? 'Failed to create agent');
        this.submitting.set(false);
      },
    });
  }
}
