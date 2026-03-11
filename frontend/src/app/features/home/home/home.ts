import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { DatePipe } from '@angular/common';

import { ApiService } from '../../../core/api.service';
import { SessionListItem } from '../../../core/models';

@Component({
  selector: 'app-home',
  imports: [RouterLink, MatButtonModule, MatCardModule, MatIconModule, DatePipe],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home {
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly recentSessions = signal<SessionListItem[]>([]);

  constructor() {
    this.api.listSessions().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (sessions) => this.recentSessions.set(sessions.slice(0, 5)),
    });
  }
}
