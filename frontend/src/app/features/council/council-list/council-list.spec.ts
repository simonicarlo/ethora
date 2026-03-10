import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { CouncilList } from './council-list';
import { Council } from '../../../core/models';

const mockCouncils: Council[] = [
  {
    id: 'c1',
    name: 'Fact Checkers',
    rounds: 3,
    voting_mechanism: 'majority',
    allow_human_turns: false,
    agents: [
      { id: 'a1', name: 'Analyst', system_prompt: 'You are an analyst.', model: 'claude-sonnet-4-20250514' },
      { id: 'a2', name: 'Critic', system_prompt: 'You are a critic.', model: 'claude-sonnet-4-20250514' },
    ],
  },
  {
    id: 'c2',
    name: 'Ethics Board',
    rounds: 5,
    voting_mechanism: 'consensus',
    allow_human_turns: true,
    agents: [
      { id: 'a3', name: 'Philosopher', system_prompt: 'You are a philosopher.', model: 'claude-sonnet-4-20250514' },
    ],
  },
];

describe('CouncilList', () => {
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CouncilList],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should create the component', () => {
    const fixture = TestBed.createComponent(CouncilList);
    expect(fixture.componentInstance).toBeTruthy();
    httpTesting.expectOne('/api/v1/councils').flush([]);
  });

  it('should show loading spinner initially', () => {
    const fixture = TestBed.createComponent(CouncilList);
    fixture.detectChanges();
    const spinner = fixture.nativeElement.querySelector('mat-spinner');
    expect(spinner).toBeTruthy();
    httpTesting.expectOne('/api/v1/councils').flush([]);
  });

  it('should display councils after loading', () => {
    const fixture = TestBed.createComponent(CouncilList);
    httpTesting.expectOne('/api/v1/councils').flush(mockCouncils);
    fixture.detectChanges();

    const cards = fixture.nativeElement.querySelectorAll('.council-card');
    expect(cards.length).toBe(2);
  });

  it('should display council names', () => {
    const fixture = TestBed.createComponent(CouncilList);
    httpTesting.expectOne('/api/v1/councils').flush(mockCouncils);
    fixture.detectChanges();

    const titles = fixture.nativeElement.querySelectorAll('mat-card-title');
    expect(titles[0].textContent).toContain('Fact Checkers');
    expect(titles[1].textContent).toContain('Ethics Board');
  });

  it('should display agent count in subtitle', () => {
    const fixture = TestBed.createComponent(CouncilList);
    httpTesting.expectOne('/api/v1/councils').flush(mockCouncils);
    fixture.detectChanges();

    const subtitles = fixture.nativeElement.querySelectorAll('mat-card-subtitle');
    expect(subtitles[0].textContent).toContain('2 agents');
    expect(subtitles[1].textContent).toContain('1 agent');
  });

  it('should display agent names', () => {
    const fixture = TestBed.createComponent(CouncilList);
    httpTesting.expectOne('/api/v1/councils').flush(mockCouncils);
    fixture.detectChanges();

    const agents = fixture.nativeElement.querySelectorAll('.agent-name');
    const names = Array.from(agents).map((a: any) => a.textContent.trim());
    expect(names).toContain('Analyst');
    expect(names).toContain('Critic');
    expect(names).toContain('Philosopher');
  });

  it('should show empty state when no councils', () => {
    const fixture = TestBed.createComponent(CouncilList);
    httpTesting.expectOne('/api/v1/councils').flush([]);
    fixture.detectChanges();

    const empty = fixture.nativeElement.querySelector('.empty-state');
    expect(empty).toBeTruthy();
    expect(empty.textContent).toContain('No councils yet');
  });

  it('should show error message on failure', () => {
    const fixture = TestBed.createComponent(CouncilList);
    httpTesting.expectOne('/api/v1/councils').error(new ProgressEvent('error'));
    fixture.detectChanges();

    const error = fixture.nativeElement.querySelector('.error-message');
    expect(error).toBeTruthy();
  });

  it('should have a New Council button linking to /councils/new', () => {
    const fixture = TestBed.createComponent(CouncilList);
    httpTesting.expectOne('/api/v1/councils').flush([]);
    fixture.detectChanges();

    const btn = fixture.nativeElement.querySelector('.page-header a[href="/councils/new"]');
    expect(btn).toBeTruthy();
    expect(btn.textContent).toContain('New Council');
  });

  it('should format voting mechanism labels', () => {
    const component = TestBed.createComponent(CouncilList).componentInstance;
    httpTesting.expectOne('/api/v1/councils').flush([]);
    expect(component.votingLabel('human_in_loop')).toBe('human in loop');
    expect(component.votingLabel('majority')).toBe('majority');
  });
});
