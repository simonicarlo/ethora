import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { AgentList } from './agent-list';
import { Agent } from '../../../core/models';

const mockAgents: Agent[] = [
  { id: 'a1', name: 'Analyst', system_prompt: 'You analyze facts carefully.', model: 'claude-sonnet-4-20250514' },
  { id: 'a2', name: 'Critic', system_prompt: 'You challenge assumptions and find flaws in reasoning.', model: 'claude-sonnet-4-20250514' },
];

describe('AgentList', () => {
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AgentList],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should create the component', () => {
    const fixture = TestBed.createComponent(AgentList);
    expect(fixture.componentInstance).toBeTruthy();
    httpTesting.expectOne('/api/v1/agents').flush([]);
  });

  it('should show loading spinner initially', () => {
    const fixture = TestBed.createComponent(AgentList);
    fixture.detectChanges();
    const spinner = fixture.nativeElement.querySelector('mat-spinner');
    expect(spinner).toBeTruthy();
    httpTesting.expectOne('/api/v1/agents').flush([]);
  });

  it('should display agents after loading', () => {
    const fixture = TestBed.createComponent(AgentList);
    httpTesting.expectOne('/api/v1/agents').flush(mockAgents);
    fixture.detectChanges();

    const cards = fixture.nativeElement.querySelectorAll('.agent-card');
    expect(cards.length).toBe(2);
  });

  it('should display agent names', () => {
    const fixture = TestBed.createComponent(AgentList);
    httpTesting.expectOne('/api/v1/agents').flush(mockAgents);
    fixture.detectChanges();

    const titles = fixture.nativeElement.querySelectorAll('mat-card-title');
    expect(titles[0].textContent).toContain('Analyst');
    expect(titles[1].textContent).toContain('Critic');
  });

  it('should display model in subtitle', () => {
    const fixture = TestBed.createComponent(AgentList);
    httpTesting.expectOne('/api/v1/agents').flush(mockAgents);
    fixture.detectChanges();

    const subtitles = fixture.nativeElement.querySelectorAll('mat-card-subtitle');
    expect(subtitles[0].textContent).toContain('claude-sonnet-4-20250514');
  });

  it('should display system prompt preview', () => {
    const fixture = TestBed.createComponent(AgentList);
    httpTesting.expectOne('/api/v1/agents').flush(mockAgents);
    fixture.detectChanges();

    const previews = fixture.nativeElement.querySelectorAll('.prompt-preview');
    expect(previews[0].textContent).toContain('You analyze facts carefully.');
  });

  it('should show empty state when no agents', () => {
    const fixture = TestBed.createComponent(AgentList);
    httpTesting.expectOne('/api/v1/agents').flush([]);
    fixture.detectChanges();

    const empty = fixture.nativeElement.querySelector('.empty-state');
    expect(empty).toBeTruthy();
    expect(empty.textContent).toContain('No agents yet');
  });

  it('should show error message on failure', () => {
    const fixture = TestBed.createComponent(AgentList);
    httpTesting.expectOne('/api/v1/agents').error(new ProgressEvent('error'));
    fixture.detectChanges();

    const error = fixture.nativeElement.querySelector('.error-message');
    expect(error).toBeTruthy();
  });

  it('should have a New Agent button linking to /agents/new', () => {
    const fixture = TestBed.createComponent(AgentList);
    httpTesting.expectOne('/api/v1/agents').flush([]);
    fixture.detectChanges();

    const btn = fixture.nativeElement.querySelector('.page-header a[href="/agents/new"]');
    expect(btn).toBeTruthy();
    expect(btn.textContent).toContain('New Agent');
  });
});
