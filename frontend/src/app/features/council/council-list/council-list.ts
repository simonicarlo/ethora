import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { ApiService } from '../../../core/api.service';
import { Council } from '../../../core/models';

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
})
export class CouncilList {
  private readonly api = inject(ApiService);

  readonly councils = signal<Council[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  constructor() {
    this.api.getCouncils().subscribe({
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
}
