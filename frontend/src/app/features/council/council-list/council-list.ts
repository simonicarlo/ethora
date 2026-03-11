import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { ApiService } from '../../../core/api.service';
import { Council } from '../../../core/models';
import { StartSessionDialog } from '../../session/start-session-dialog/start-session-dialog';

@Component({
  selector: 'app-council-list',
  imports: [
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './council-list.html',
  styleUrl: './council-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CouncilList {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);

  readonly councils = signal<Council[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  constructor() {
    this.api.getCouncils().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (councils) => {
        this.councils.set(councils);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.message ?? 'Failed to load councils');
        this.loading.set(false);
      },
    });
  }

  votingLabel(mechanism: string): string {
    return mechanism.replace(/_/g, ' ');
  }

  startSession(council: Council): void {
    const ref = this.dialog.open(StartSessionDialog, {
      data: council,
      width: '520px',
    });
    ref.afterClosed().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((claim) => {
      if (!claim) return;
      this.api.createSession({ council_id: council.id, input_claim: claim }).pipe(
        takeUntilDestroyed(this.destroyRef),
      ).subscribe({
        next: (session) => this.router.navigate(['/sessions', session.id]),
        error: (err) => this.error.set(err?.message ?? 'Failed to create session'),
      });
    });
  }
}
