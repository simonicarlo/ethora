import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { ApiService } from '../../../core/api.service';
import { Council, CouncilCreate } from '../../../core/models';
import { CouncilForm } from '../council-form/council-form';

@Component({
  selector: 'app-council-edit',
  imports: [CouncilForm, MatProgressSpinnerModule],
  template: `
    <div class="page-header">
      <h1>Edit Council</h1>
    </div>
    @if (loading()) {
      <div class="center">
        <mat-spinner diameter="48"></mat-spinner>
      </div>
    } @else if (council()) {
      <app-council-form [council]="council()" submitLabel="Save Changes" [submitting]="submitting()" [error]="error()" (save)="onSave($event)" />
    }
  `,
  styleUrl: './council-edit.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CouncilEdit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly council = signal<Council | null>(null);
  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.api.getCouncil(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (council) => {
        this.council.set(council);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load council');
        this.loading.set(false);
      },
    });
  }

  onSave(data: CouncilCreate): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.submitting.set(true);
    this.error.set(null);

    this.api.updateCouncil(id, data).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => this.router.navigate(['/councils']),
      error: (err) => {
        this.error.set(err?.error?.detail ?? 'Failed to update council');
        this.submitting.set(false);
      },
    });
  }
}
