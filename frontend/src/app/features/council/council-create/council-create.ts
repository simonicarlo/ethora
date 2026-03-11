import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';

import { ApiService } from '../../../core/api.service';
import { CouncilCreate as CouncilCreateData } from '../../../core/models';
import { CouncilForm } from '../council-form/council-form';

@Component({
  selector: 'app-council-create',
  imports: [CouncilForm],
  template: `
    <div class="page-header">
      <h1>Create Council</h1>
    </div>
    <app-council-form submitLabel="Create Council" [submitting]="submitting()" [error]="error()" (save)="onSave($event)" />
  `,
  styleUrl: './council-create.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CouncilCreate {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);

  onSave(data: CouncilCreateData): void {
    this.submitting.set(true);
    this.error.set(null);

    this.api.createCouncil(data).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => this.router.navigate(['/councils']),
      error: (err) => {
        this.error.set(err?.error?.detail ?? 'Failed to create council');
        this.submitting.set(false);
      },
    });
  }
}
