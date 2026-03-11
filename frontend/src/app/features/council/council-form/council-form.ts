import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SlicePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { ApiService } from '../../../core/api.service';
import { Agent, VotingMechanism } from '../../../core/models';

@Component({
  selector: 'app-council-form',
  imports: [
    SlicePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  templateUrl: './council-form.html',
  styleUrl: './council-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CouncilForm implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly agents = signal<Agent[]>([]);
  readonly loadingAgents = signal(true);
  readonly loading = signal(false);
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly isEditMode = signal(false);

  private councilId: string | null = null;

  readonly votingMechanisms: { value: VotingMechanism; label: string }[] = [
    { value: 'majority', label: 'Majority' },
    { value: 'weighted', label: 'Weighted' },
    { value: 'consensus', label: 'Consensus' },
    { value: 'human_in_loop', label: 'Human in the Loop' },
  ];

  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    rounds: [3, [Validators.required, Validators.min(1), Validators.max(20)]],
    voting_mechanism: ['majority' as VotingMechanism, Validators.required],
    allow_human_turns: [false],
    tools_enabled: [false],
    agent_ids: [[] as string[], Validators.required],
  });

  constructor() {
    this.api.getAgents().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (agents) => {
        this.agents.set(agents);
        this.loadingAgents.set(false);
      },
      error: () => {
        this.error.set('Failed to load agents');
        this.loadingAgents.set(false);
      },
    });
  }

  ngOnInit(): void {
    this.councilId = this.route.snapshot.paramMap.get('id');
    if (this.councilId) {
      this.isEditMode.set(true);
      this.loading.set(true);
      this.api.getCouncil(this.councilId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (council) => {
          this.form.patchValue({
            name: council.name,
            rounds: council.rounds,
            voting_mechanism: council.voting_mechanism,
            allow_human_turns: council.allow_human_turns,
            tools_enabled: council.tools_enabled,
            agent_ids: council.agents.map(a => a.id),
          });
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Failed to load council');
          this.loading.set(false);
        },
      });
    }
  }

  onSubmit(): void {
    if (this.form.invalid || this.submitting()) return;

    const agentIds = this.form.getRawValue().agent_ids;
    if (agentIds.length < 2) {
      this.error.set('Select at least 2 agents for a council');
      return;
    }

    this.submitting.set(true);
    this.error.set(null);

    const request$ = this.isEditMode()
      ? this.api.updateCouncil(this.councilId!, this.form.getRawValue())
      : this.api.createCouncil(this.form.getRawValue());

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.router.navigate(['/councils']);
      },
      error: (err) => {
        const action = this.isEditMode() ? 'update' : 'create';
        this.error.set(err?.error?.detail ?? `Failed to ${action} council`);
        this.submitting.set(false);
      },
    });
  }
}
