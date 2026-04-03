import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';

import { SessionList } from './session-list';
import { mockSessions, mockSessionListItem1, mockSessionListItem2 } from '../../../../test-utils/fixtures';

// ---------------------------------------------------------------------------
// No filter (default)
// ---------------------------------------------------------------------------

describe('SessionList — no filter', () => {
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SessionList, NoopAnimationsModule, MatDialogModule],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { queryParams: of({}) } },
      ],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should create the component', () => {
    const fixture = TestBed.createComponent(SessionList);
    expect(fixture.componentInstance).toBeTruthy();
    httpTesting.expectOne((req) => req.url.includes('/sessions')).flush([]);
  });

  it('should show loading spinner initially', () => {
    const fixture = TestBed.createComponent(SessionList);
    fixture.detectChanges();

    const spinner = fixture.nativeElement.querySelector('mat-spinner');
    expect(spinner).toBeTruthy();
    httpTesting.expectOne((req) => req.url.includes('/sessions')).flush([]);
  });

  it('should load sessions without council_id filter', () => {
    const fixture = TestBed.createComponent(SessionList);
    const component = fixture.componentInstance;

    const req = httpTesting.expectOne((r) => r.url.includes('/sessions'));
    expect(req.request.params.keys()).not.toContain('council_id');
    req.flush(mockSessions);

    expect(component.sessions()).toEqual(mockSessions);
    expect(component.loading()).toBe(false);
    expect(component.councilFilter()).toBeNull();
  });

  it('should set error signal on load failure', () => {
    const fixture = TestBed.createComponent(SessionList);
    httpTesting.expectOne((req) => req.url.includes('/sessions')).error(new ProgressEvent('error'));

    expect(fixture.componentInstance.error()).toBeTruthy();
    expect(fixture.componentInstance.loading()).toBe(false);
  });

  it('clearFilter() should reload sessions without council filter', () => {
    const fixture = TestBed.createComponent(SessionList);
    const component = fixture.componentInstance;

    httpTesting.expectOne((req) => req.url.includes('/sessions')).flush([mockSessionListItem1]);

    component.clearFilter();

    const req = httpTesting.expectOne((r) => r.url.includes('/sessions'));
    expect(req.request.params.keys()).not.toContain('council_id');
    req.flush(mockSessions);

    expect(component.councilFilter()).toBeNull();
    expect(component.sessions()).toEqual(mockSessions);
  });

  describe('statusIcon()', () => {
    it('should return correct icon for each known status', () => {
      const fixture = TestBed.createComponent(SessionList);
      httpTesting.expectOne((req) => req.url.includes('/sessions')).flush([]);
      const c = fixture.componentInstance;

      expect(c.statusIcon('complete')).toBe('check_circle');
      expect(c.statusIcon('error')).toBe('error');
      expect(c.statusIcon('running')).toBe('play_circle');
      expect(c.statusIcon('pending')).toBe('schedule');
      expect(c.statusIcon('voting')).toBe('how_to_vote');
      expect(c.statusIcon('proposing')).toBe('lightbulb');
      expect(c.statusIcon('awaiting_human_turn')).toBe('person');
    });

    it('should return "help" icon for unhandled statuses', () => {
      const fixture = TestBed.createComponent(SessionList);
      httpTesting.expectOne((req) => req.url.includes('/sessions')).flush([]);
      expect(fixture.componentInstance.statusIcon('rate_limited' as any)).toBe('help');
    });
  });

  describe('statusClass()', () => {
    it('should return correct CSS class for each status', () => {
      const fixture = TestBed.createComponent(SessionList);
      httpTesting.expectOne((req) => req.url.includes('/sessions')).flush([]);
      const c = fixture.componentInstance;

      expect(c.statusClass('complete')).toBe('status-complete');
      expect(c.statusClass('error')).toBe('status-error');
      expect(c.statusClass('running')).toBe('status-active');
      expect(c.statusClass('voting')).toBe('status-active');
      expect(c.statusClass('proposing')).toBe('status-active');
      expect(c.statusClass('awaiting_human_turn')).toBe('status-waiting');
      expect(c.statusClass('pending')).toBe('status-pending');
    });
  });

  describe('statusLabel()', () => {
    it('should replace underscores with spaces', () => {
      const fixture = TestBed.createComponent(SessionList);
      httpTesting.expectOne((req) => req.url.includes('/sessions')).flush([]);

      expect(fixture.componentInstance.statusLabel('awaiting_human_turn')).toBe(
        'awaiting human turn',
      );
      expect(fixture.componentInstance.statusLabel('complete')).toBe('complete');
    });
  });

  describe('claimPreview()', () => {
    it('should return claim unchanged when 100 chars or fewer', () => {
      const fixture = TestBed.createComponent(SessionList);
      httpTesting.expectOne((req) => req.url.includes('/sessions')).flush([]);

      const short = 'Short claim';
      expect(fixture.componentInstance.claimPreview(short)).toBe(short);
    });

    it('should truncate claim to 100 chars with ellipsis when longer', () => {
      const fixture = TestBed.createComponent(SessionList);
      httpTesting.expectOne((req) => req.url.includes('/sessions')).flush([]);

      const long = 'A'.repeat(150);
      const preview = fixture.componentInstance.claimPreview(long);
      expect(preview).toHaveLength(103); // 100 + '...'
      expect(preview.endsWith('...')).toBe(true);
    });
  });

  describe('deleteSession()', () => {
    it('should open confirm dialog and delete session on confirmation', () => {
      const fixture = TestBed.createComponent(SessionList);
      const component = fixture.componentInstance;
      httpTesting.expectOne((req) => req.url.includes('/sessions')).flush([...mockSessions]);

      const dialog = TestBed.inject(MatDialog);
      const mockRef = { afterClosed: () => of(true) } as MatDialogRef<unknown>;
      vi.spyOn(dialog, 'open').mockReturnValue(mockRef);

      component.deleteSession(mockSessionListItem1);

      const req = httpTesting.expectOne(`/api/v1/sessions/${mockSessionListItem1.id}`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);

      expect(component.sessions().find((s) => s.id === mockSessionListItem1.id)).toBeUndefined();
    });

    it('should not call API when dialog is cancelled', () => {
      const fixture = TestBed.createComponent(SessionList);
      httpTesting.expectOne((req) => req.url.includes('/sessions')).flush([...mockSessions]);

      const dialog = TestBed.inject(MatDialog);
      const mockRef = { afterClosed: () => of(false) } as MatDialogRef<unknown>;
      vi.spyOn(dialog, 'open').mockReturnValue(mockRef);

      fixture.componentInstance.deleteSession(mockSessionListItem1);
      httpTesting.expectNone(`/api/v1/sessions/${mockSessionListItem1.id}`);
    });

    it('should set error signal when delete fails', () => {
      const fixture = TestBed.createComponent(SessionList);
      const component = fixture.componentInstance;
      httpTesting.expectOne((req) => req.url.includes('/sessions')).flush([...mockSessions]);

      const dialog = TestBed.inject(MatDialog);
      const mockRef = { afterClosed: () => of(true) } as MatDialogRef<unknown>;
      vi.spyOn(dialog, 'open').mockReturnValue(mockRef);

      component.deleteSession(mockSessionListItem1);
      httpTesting
        .expectOne(`/api/v1/sessions/${mockSessionListItem1.id}`)
        .error(new ProgressEvent('error'));

      expect(component.error()).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// With council_id filter
// ---------------------------------------------------------------------------

describe('SessionList — with council filter', () => {
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SessionList, NoopAnimationsModule, MatDialogModule],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { queryParams: of({ council_id: 'c1' }) } },
      ],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should pass council_id as query param when present in route', () => {
    const fixture = TestBed.createComponent(SessionList);
    const component = fixture.componentInstance;

    const req = httpTesting.expectOne((r) => r.url.includes('/sessions'));
    expect(req.request.params.get('council_id')).toBe('c1');
    req.flush([mockSessionListItem1]);

    expect(component.councilFilter()).toBe('c1');
    expect(component.sessions()).toEqual([mockSessionListItem1]);
  });
});
