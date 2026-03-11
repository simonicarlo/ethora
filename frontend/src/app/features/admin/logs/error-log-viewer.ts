import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';

import { ApiService } from '../../../core/api.service';
import { ErrorLogEntry } from '../../../core/models';

@Component({
  selector: 'app-error-log-viewer',
  imports: [
    DatePipe,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTableModule,
    MatTooltipModule,
  ],
  templateUrl: './error-log-viewer.html',
  styleUrl: './error-log-viewer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErrorLogViewer {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(true);
  readonly logs = signal<ErrorLogEntry[]>([]);
  readonly displayedColumns = ['created_at', 'council_name', 'input_claim', 'actions'];

  constructor() {
    this.loadLogs();
  }

  loadLogs(): void {
    this.loading.set(true);
    this.api.getErrorLogs(50).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (logs) => {
        this.logs.set(logs);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  viewSession(sessionId: string): void {
    this.router.navigate(['/sessions', sessionId]);
  }
}
