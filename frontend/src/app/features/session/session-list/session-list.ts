import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog } from '@angular/material/dialog';
import { DatePipe } from '@angular/common';

import { ApiService } from '../../../core/api.service';
import { SessionListItem, SessionStatus } from '../../../core/models';
import { ConfirmDialog } from '../../../shared/components/confirm-dialog/confirm-dialog';
import { MeshBackground } from '../../../shared/components/mesh-background/mesh-background';

@Component({
  selector: 'app-session-list',
  imports: [
    RouterLink,
    MatButtonModule,
    MatChipsModule,
    MatIconModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    DatePipe,
    MeshBackground,
  ],
  templateUrl: './session-list.html',
  styleUrl: './session-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionList {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);

  readonly sessions = signal<SessionListItem[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly councilFilter = signal<string | null>(null);

  constructor() {
    this.route.queryParams.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const councilId = params['council_id'] || null;
      this.councilFilter.set(councilId);
      this.loadSessions(councilId);
    });
  }

  private loadSessions(councilId: string | null): void {
    this.loading.set(true);
    this.error.set(null);
    const params = councilId ? { council_id: councilId } : undefined;
    this.api.listSessions(params).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (sessions) => {
        this.sessions.set(sessions);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.message ?? 'Failed to load sessions');
        this.loading.set(false);
      },
    });
  }

  statusIcon(status: SessionStatus): string {
    switch (status) {
      case 'complete': return 'check_circle';
      case 'error': return 'error';
      case 'running': return 'play_circle';
      case 'pending': return 'schedule';
      case 'voting': return 'how_to_vote';
      case 'proposing': return 'lightbulb';
      case 'awaiting_human_turn': return 'person';
      default: return 'help';
    }
  }

  statusClass(status: SessionStatus): string {
    switch (status) {
      case 'complete': return 'status-complete';
      case 'error': return 'status-error';
      case 'running':
      case 'voting':
      case 'proposing': return 'status-active';
      case 'awaiting_human_turn': return 'status-waiting';
      default: return 'status-pending';
    }
  }

  statusLabel(status: SessionStatus): string {
    return status.replace(/_/g, ' ');
  }

  claimPreview(claim: string): string {
    return claim.length > 100 ? claim.substring(0, 100) + '...' : claim;
  }

  deleteSession(session: SessionListItem): void {
    const ref = this.dialog.open(ConfirmDialog, {
      data: { title: 'Delete Session', message: 'Delete this session? This cannot be undone.' },
    });
    ref.afterClosed().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((confirmed) => {
      if (!confirmed) return;
      this.api.deleteSession(session.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: () => {
          this.sessions.update(sessions => sessions.filter(s => s.id !== session.id));
        },
        error: (err) => {
          this.error.set(err?.error?.detail ?? 'Failed to delete session');
        },
      });
    });
  }

  clearFilter(): void {
    this.councilFilter.set(null);
    this.loadSessions(null);
  }
}
