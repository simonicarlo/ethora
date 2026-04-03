import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { signal } from '@angular/core';

import { StatsDashboard } from './stats-dashboard';
import { ThemeService } from '../../../core/theme.service';
import {
  mockSessionStats,
  mockCouncilStats,
  mockAgentStats,
} from '../../../../test-utils/fixtures';

/** Minimal ThemeService stub — avoids real localStorage / matchMedia side effects in tests. */
function mockThemeService() {
  return {
    isDark: signal(false),
  };
}

function flushStats(httpTesting: HttpTestingController): void {
  httpTesting.expectOne('/api/v1/admin/stats/sessions').flush(mockSessionStats);
  httpTesting.expectOne('/api/v1/admin/stats/councils').flush(mockCouncilStats);
  httpTesting.expectOne('/api/v1/admin/stats/agents').flush(mockAgentStats);
}

describe('StatsDashboard', () => {
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatsDashboard, NoopAnimationsModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ThemeService, useFactory: mockThemeService },
      ],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should create the component', () => {
    const fixture = TestBed.createComponent(StatsDashboard);
    expect(fixture.componentInstance).toBeTruthy();
    flushStats(httpTesting);
  });

  it('should be in loading state before data arrives', () => {
    const fixture = TestBed.createComponent(StatsDashboard);
    fixture.detectChanges();

    expect(fixture.componentInstance.loading()).toBe(true);
    expect(fixture.componentInstance.error()).toBeNull();
    flushStats(httpTesting);
  });

  it('should populate stats signals after successful load', () => {
    const fixture = TestBed.createComponent(StatsDashboard);
    flushStats(httpTesting);
    fixture.detectChanges();

    const c = fixture.componentInstance;
    expect(c.loading()).toBe(false);
    expect(c.totalSessions()).toBe(mockSessionStats.total_sessions);
    expect(c.completionRate()).toBe(mockSessionStats.completion_rate);
    expect(c.avgRounds()).toBe(mockSessionStats.avg_rounds_per_session);
  });

  it('should populate councilUsage and agentMetrics signals', () => {
    const fixture = TestBed.createComponent(StatsDashboard);
    flushStats(httpTesting);

    expect(fixture.componentInstance.councilUsage()).toEqual(mockCouncilStats.council_usage);
    expect(fixture.componentInstance.agentMetrics()).toEqual(mockAgentStats.agent_metrics);
  });

  it('should set statusChartData from session stats', () => {
    const fixture = TestBed.createComponent(StatsDashboard);
    flushStats(httpTesting);

    const chartData = fixture.componentInstance.statusChartData();
    expect(chartData.labels).toEqual(Object.keys(mockSessionStats.sessions_by_status));
    expect(chartData.datasets[0].data).toEqual(
      Object.values(mockSessionStats.sessions_by_status),
    );
  });

  it('should set timelineChartData from sessions_over_time', () => {
    const fixture = TestBed.createComponent(StatsDashboard);
    flushStats(httpTesting);

    const chartData = fixture.componentInstance.timelineChartData();
    expect(chartData.labels).toEqual(mockSessionStats.sessions_over_time.map((d) => d.date));
    expect(chartData.datasets[0].data).toEqual(
      mockSessionStats.sessions_over_time.map((d) => d.count),
    );
  });

  it('should set error signal on load failure', () => {
    const fixture = TestBed.createComponent(StatsDashboard);

    httpTesting.expectOne('/api/v1/admin/stats/sessions').error(new ProgressEvent('error'));
    httpTesting.expectOne('/api/v1/admin/stats/councils').flush(mockCouncilStats);
    httpTesting.expectOne('/api/v1/admin/stats/agents').flush(mockAgentStats);
    fixture.detectChanges();

    expect(fixture.componentInstance.loading()).toBe(false);
    expect(fixture.componentInstance.error()).toBeTruthy();
  });

  describe('formatDuration()', () => {
    it('should return seconds for durations under 60s', () => {
      const fixture = TestBed.createComponent(StatsDashboard);
      flushStats(httpTesting);

      expect(fixture.componentInstance.formatDuration(45)).toBe('45s');
      expect(fixture.componentInstance.formatDuration(0)).toBe('0s');
      expect(fixture.componentInstance.formatDuration(59)).toBe('59s');
    });

    it('should return minutes and seconds for durations 60s or more', () => {
      const fixture = TestBed.createComponent(StatsDashboard);
      flushStats(httpTesting);

      expect(fixture.componentInstance.formatDuration(60)).toBe('1m 0s');
      expect(fixture.componentInstance.formatDuration(90)).toBe('1m 30s');
      expect(fixture.componentInstance.formatDuration(150)).toBe('2m 30s');
    });

    it('should round seconds correctly', () => {
      const fixture = TestBed.createComponent(StatsDashboard);
      flushStats(httpTesting);

      expect(fixture.componentInstance.formatDuration(59.7)).toBe('60s');
      expect(fixture.componentInstance.formatDuration(61.4)).toBe('1m 1s');
    });
  });

  describe('chart options (computed)', () => {
    it('should compute statusChartOptions with legend position right', () => {
      const fixture = TestBed.createComponent(StatsDashboard);
      flushStats(httpTesting);

      const opts = fixture.componentInstance.statusChartOptions();
      expect(opts?.plugins?.legend?.position).toBe('right');
    });

    it('should compute timelineChartOptions with responsive true', () => {
      const fixture = TestBed.createComponent(StatsDashboard);
      flushStats(httpTesting);

      const opts = fixture.componentInstance.timelineChartOptions();
      expect(opts?.responsive).toBe(true);
    });

    it('should use dark colours when theme is dark', () => {
      const themeService = TestBed.inject(ThemeService) as ReturnType<typeof mockThemeService>;
      (themeService.isDark as ReturnType<typeof signal<boolean>>).set(true);

      const fixture = TestBed.createComponent(StatsDashboard);
      flushStats(httpTesting);
      fixture.detectChanges();

      const opts = fixture.componentInstance.statusChartOptions();
      expect(opts?.plugins?.legend?.labels?.color).toBe('rgba(255,255,255,0.7)');
    });
  });
});
