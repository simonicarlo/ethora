import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
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
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly submitting = signal(false);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly isEditMode = signal(false);

  private agentId: string | null = null;

  readonly modelOptions = [
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
  ] as const;

  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    system_prompt: ['', Validators.required],
    model: ['claude-sonnet-4-20250514'],
  });

  ngOnInit(): void {
    this.agentId = this.route.snapshot.paramMap.get('id');
    if (this.agentId) {
      this.isEditMode.set(true);
      this.loading.set(true);
      this.api.getAgent(this.agentId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (agent) => {
          this.form.patchValue({
            name: agent.name,
            system_prompt: agent.system_prompt,
            model: agent.model,
          });
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Failed to load agent');
          this.loading.set(false);
        },
      });
    }
  }

  onSubmit(): void {
    if (this.form.invalid || this.submitting()) return;

    this.submitting.set(true);
    this.error.set(null);

    const request$ = this.isEditMode()
      ? this.api.updateAgent(this.agentId!, this.form.getRawValue())
      : this.api.createAgent(this.form.getRawValue());

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.router.navigate(['/agents']);
      },
      error: (err) => {
        const action = this.isEditMode() ? 'update' : 'create';
        this.error.set(err?.error?.detail ?? `Failed to ${action} agent`);
        this.submitting.set(false);
      },
    });
  }
}
