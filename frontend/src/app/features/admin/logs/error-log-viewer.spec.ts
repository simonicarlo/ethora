import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { ErrorLogViewer } from './error-log-viewer';
import { mockErrorLogEntry } from '../../../../test-utils/fixtures';

const mockLogs = [
  mockErrorLogEntry,
  {
    session_id: 's2',
    council_name: 'Ethics Board',
    input_claim: 'AI should be banned.',
    error_message: 'Timeout error',
    created_at: '2026-01-02T10:00:00Z',
  },
];

describe('ErrorLogViewer', () => {
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ErrorLogViewer, NoopAnimationsModule],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should create the component', () => {
    const fixture = TestBed.createComponent(ErrorLogViewer);
    expect(fixture.componentInstance).toBeTruthy();
    httpTesting.expectOne((req) => req.url.includes('/admin/logs/errors')).flush([]);
  });

  it('should show loading spinner initially', () => {
    const fixture = TestBed.createComponent(ErrorLogViewer);
    fixture.detectChanges();

    const spinner = fixture.nativeElement.querySelector('mat-spinner');
    expect(spinner).toBeTruthy();
    httpTesting.expectOne((req) => req.url.includes('/admin/logs/errors')).flush([]);
  });

  it('should request the error logs endpoint with limit param', () => {
    const fixture = TestBed.createComponent(ErrorLogViewer);

    const req = httpTesting.expectOne((r) => r.url.includes('/admin/logs/errors'));
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('limit')).toBe('50');
    req.flush([]);
  });

  it('should display logs in the table after loading', () => {
    const fixture = TestBed.createComponent(ErrorLogViewer);
    httpTesting.expectOne((req) => req.url.includes('/admin/logs/errors')).flush(mockLogs);
    fixture.detectChanges();

    const rows = fixture.nativeElement.querySelectorAll('mat-row');
    expect(rows.length).toBe(2);
  });

  it('should populate logs signal with fetched data', () => {
    const fixture = TestBed.createComponent(ErrorLogViewer);
    httpTesting.expectOne((req) => req.url.includes('/admin/logs/errors')).flush(mockLogs);

    expect(fixture.componentInstance.logs()).toEqual(mockLogs);
    expect(fixture.componentInstance.loading()).toBe(false);
  });

  it('should stop loading on fetch error', () => {
    const fixture = TestBed.createComponent(ErrorLogViewer);
    httpTesting.expectOne((req) => req.url.includes('/admin/logs/errors')).error(new ProgressEvent('error'));

    expect(fixture.componentInstance.loading()).toBe(false);
  });

  it('should have the expected displayed columns', () => {
    const fixture = TestBed.createComponent(ErrorLogViewer);
    httpTesting.expectOne((req) => req.url.includes('/admin/logs/errors')).flush([]);

    expect(fixture.componentInstance.displayedColumns).toEqual([
      'created_at',
      'council_name',
      'input_claim',
      'actions',
    ]);
  });

  it('viewSession() should navigate to /sessions/:id', () => {
    const fixture = TestBed.createComponent(ErrorLogViewer);
    httpTesting.expectOne((req) => req.url.includes('/admin/logs/errors')).flush([]);

    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture.componentInstance.viewSession('s1');

    expect(router.navigate).toHaveBeenCalledWith(['/sessions', 's1']);
  });

  it('should reload logs on loadLogs() call', () => {
    const fixture = TestBed.createComponent(ErrorLogViewer);
    httpTesting.expectOne((req) => req.url.includes('/admin/logs/errors')).flush([]);

    fixture.componentInstance.loadLogs();

    const req = httpTesting.expectOne((r) => r.url.includes('/admin/logs/errors'));
    expect(req.request.method).toBe('GET');
    req.flush(mockLogs);

    expect(fixture.componentInstance.logs()).toEqual(mockLogs);
  });
});
