import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration } from 'chart.js';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { DecimalPipe } from '@angular/common';

import { ApiService } from '../../../core/api.service';
import { ThemeService } from '../../../core/theme.service';
import { AgentMetricItem, CouncilUsageItem, DailyCount, SessionStats } from '../../../core/models';

@Component({
  selector: 'app-stats-dashboard',
  imports: [
    BaseChartDirective,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    DecimalPipe,
  ],
  templateUrl: './stats-dashboard.html',
  styleUrl: './stats-dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatsDashboard {
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly theme = inject(ThemeService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly totalSessions = signal(0);
  readonly completionRate = signal(0);
  readonly avgRounds = signal(0);

  readonly statusChartData = signal<ChartConfiguration<'doughnut'>['data']>({
    labels: [],
    datasets: [{ data: [] }],
  });

  readonly timelineChartData = signal<ChartConfiguration<'line'>['data']>({
    labels: [],
    datasets: [{ data: [], label: 'Sessions' }],
  });

  readonly statusChartOptions = computed<ChartConfiguration<'doughnut'>['options']>(() => {
    const textColor = this.theme.isDark() ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)';
    return {
      responsive: true,
      plugins: {
        legend: { position: 'right', labels: { color: textColor } },
      },
    };
  });

  readonly timelineChartOptions = computed<ChartConfiguration<'line'>['options']>(() => {
    const isDark = this.theme.isDark();
    const textColor = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)';
    const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
    const legendColor = isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)';
    return {
      responsive: true,
      scales: {
        x: { ticks: { color: textColor }, grid: { color: gridColor } },
        y: { ticks: { color: textColor }, grid: { color: gridColor }, beginAtZero: true },
      },
      plugins: {
        legend: { labels: { color: legendColor } },
      },
    };
  });

  readonly councilUsage = signal<CouncilUsageItem[]>([]);
  readonly agentMetrics = signal<AgentMetricItem[]>([]);

  private static readonly STATUS_COLORS: Record<string, string> = {
    complete: '#4caf50',
    running: '#2196f3',
    pending: '#ff9800',
    error: '#f44336',
    voting: '#9c27b0',
    proposing: '#00bcd4',
    rate_limited: '#795548',
    awaiting_human_turn: '#ffc107',
  };

  constructor() {
    this.loadStats();
  }

  private loadStats(): void {
    forkJoin({
      sessions: this.api.getSessionStats(),
      councils: this.api.getCouncilStats(),
      agents: this.api.getAgentStats(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.applySessionStats(result.sessions);
          this.councilUsage.set(result.councils.council_usage);
          this.agentMetrics.set(result.agents.agent_metrics);
          this.loading.set(false);
        },
        error: (err: Error) => {
          this.error.set(err?.message ?? 'Failed to load stats');
          this.loading.set(false);
        },
      });
  }

  private applySessionStats(stats: SessionStats): void {
    this.totalSessions.set(stats.total_sessions);
    this.completionRate.set(stats.completion_rate);
    this.avgRounds.set(stats.avg_rounds_per_session);

    const labels = Object.keys(stats.sessions_by_status);
    const data: number[] = Object.values(stats.sessions_by_status);
    const colors = labels.map((s: string) => StatsDashboard.STATUS_COLORS[s] ?? '#607d8b');

    this.statusChartData.set({
      labels,
      datasets: [{ data, backgroundColor: colors }],
    });

    this.timelineChartData.set({
      labels: stats.sessions_over_time.map((d: DailyCount) => d.date),
      datasets: [{
        data: stats.sessions_over_time.map((d: DailyCount) => d.count),
        label: 'Sessions',
        borderColor: '#42a5f5',
        backgroundColor: 'rgba(66,165,245,0.2)',
        fill: true,
        tension: 0.3,
      }],
    });
  }

  formatDuration(seconds: number): string {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  }
}
