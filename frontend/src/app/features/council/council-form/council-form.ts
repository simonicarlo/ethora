import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, output, signal, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SlicePipe } from '@angular/common';
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
import { Agent, Council, CouncilCreate, VotingMechanism } from '../../../core/models';

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
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly council = input<Council | null>(null);
  readonly submitLabel = input('Create Council');
  readonly submitting = input(false);
  readonly error = input<string | null>(null);
  readonly save = output<CouncilCreate>();

  readonly agents = signal<Agent[]>([]);
  readonly loadingAgents = signal(true);

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
    agent_ids: [[] as string[], Validators.required],
  });

  constructor() {
    this.api.getAgents().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (agents) => {
        this.agents.set(agents);
        this.loadingAgents.set(false);
      },
      error: () => {
        this.loadingAgents.set(false);
      },
    });
  }

  ngOnInit(): void {
    const council = this.council();
    if (council) {
      this.form.patchValue({
        name: council.name,
        rounds: council.rounds,
        voting_mechanism: council.voting_mechanism,
        allow_human_turns: council.allow_human_turns,
        agent_ids: council.agents.map(a => a.id),
      });
    }
  }

  onSubmit(): void {
    if (this.form.invalid || this.submitting()) return;

    const agentIds = this.form.getRawValue().agent_ids;
    if (agentIds.length < 2) return;

    this.save.emit(this.form.getRawValue());
  }
}
