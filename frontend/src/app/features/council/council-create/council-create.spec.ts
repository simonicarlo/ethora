import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { CouncilCreate } from './council-create';
import { Agent } from '../../../core/models';

const mockAgents: Agent[] = [
  { id: 'a1', name: 'Analyst', system_prompt: 'You analyze facts carefully.', model: 'claude-sonnet-4-20250514' },
  { id: 'a2', name: 'Critic', system_prompt: 'You challenge assumptions.', model: 'claude-sonnet-4-20250514' },
  { id: 'a3', name: 'Synthesizer', system_prompt: 'You synthesize arguments.', model: 'claude-sonnet-4-20250514' },
];

describe('CouncilCreate', () => {
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CouncilCreate, NoopAnimationsModule],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should create the component', () => {
    const fixture = TestBed.createComponent(CouncilCreate);
    expect(fixture.componentInstance).toBeTruthy();
    httpTesting.expectOne('/api/v1/agents').flush([]);
  });

  it('should load agents on init', () => {
    const fixture = TestBed.createComponent(CouncilCreate);
    httpTesting.expectOne('/api/v1/agents').flush(mockAgents);
    fixture.detectChanges();

    expect(fixture.componentInstance.agents()).toEqual(mockAgents);
    expect(fixture.componentInstance.loadingAgents()).toBe(false);
  });

  it('should show loading spinner while agents load', () => {
    const fixture = TestBed.createComponent(CouncilCreate);
    fixture.detectChanges();

    expect(fixture.componentInstance.loadingAgents()).toBe(true);
    const spinner = fixture.nativeElement.querySelector('mat-spinner');
    expect(spinner).toBeTruthy();

    httpTesting.expectOne('/api/v1/agents').flush([]);
  });

  it('should display agent list after loading', () => {
    const fixture = TestBed.createComponent(CouncilCreate);
    httpTesting.expectOne('/api/v1/agents').flush(mockAgents);
    fixture.detectChanges();

    const options = fixture.nativeElement.querySelectorAll('mat-list-option');
    expect(options.length).toBe(3);
  });

  it('should show no-agents message when empty', () => {
    const fixture = TestBed.createComponent(CouncilCreate);
    httpTesting.expectOne('/api/v1/agents').flush([]);
    fixture.detectChanges();

    const msg = fixture.nativeElement.querySelector('.no-agents');
    expect(msg).toBeTruthy();
    expect(msg.textContent).toContain('No agents available');
  });

  it('should have default form values', () => {
    const fixture = TestBed.createComponent(CouncilCreate);
    httpTesting.expectOne('/api/v1/agents').flush([]);

    const values = fixture.componentInstance.form.getRawValue();
    expect(values.name).toBe('');
    expect(values.rounds).toBe(3);
    expect(values.voting_mechanism).toBe('majority');
    expect(values.allow_human_turns).toBe(false);
    expect(values.agent_ids).toEqual([]);
  });

  it('should have form invalid when name is empty', () => {
    const fixture = TestBed.createComponent(CouncilCreate);
    httpTesting.expectOne('/api/v1/agents').flush([]);

    expect(fixture.componentInstance.form.valid).toBe(false);
  });

  it('should submit and navigate on success', () => {
    const fixture = TestBed.createComponent(CouncilCreate);
    httpTesting.expectOne('/api/v1/agents').flush(mockAgents);

    const component = fixture.componentInstance;
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    component.form.patchValue({ name: 'Test Council', agent_ids: ['a1', 'a2'] });
    component.onSubmit();

    const req = httpTesting.expectOne('/api/v1/councils');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.name).toBe('Test Council');
    expect(req.request.body.agent_ids).toEqual(['a1', 'a2']);
    req.flush({ id: 'c1', name: 'Test Council', rounds: 3, voting_mechanism: 'majority', allow_human_turns: false, agents: [] });

    expect(navigateSpy).toHaveBeenCalledWith(['/councils']);
  });

  it('should show error when fewer than 2 agents selected', () => {
    const fixture = TestBed.createComponent(CouncilCreate);
    httpTesting.expectOne('/api/v1/agents').flush(mockAgents);

    const component = fixture.componentInstance;
    component.form.patchValue({ name: 'Test', agent_ids: ['a1'] });
    component.onSubmit();

    expect(component.error()).toBe('Select at least 2 agents for a council');
  });

  it('should show error on API failure', () => {
    const fixture = TestBed.createComponent(CouncilCreate);
    httpTesting.expectOne('/api/v1/agents').flush(mockAgents);

    const component = fixture.componentInstance;
    component.form.patchValue({ name: 'Test', agent_ids: ['a1', 'a2'] });
    component.onSubmit();

    httpTesting.expectOne('/api/v1/councils').flush(
      { detail: 'Something went wrong' },
      { status: 500, statusText: 'Server Error' },
    );

    expect(component.error()).toBe('Something went wrong');
    expect(component.submitting()).toBe(false);
  });

  it('should display the page title', () => {
    const fixture = TestBed.createComponent(CouncilCreate);
    httpTesting.expectOne('/api/v1/agents').flush([]);
    fixture.detectChanges();

    const h1 = fixture.nativeElement.querySelector('h1');
    expect(h1.textContent).toContain('Create Council');
  });
});
