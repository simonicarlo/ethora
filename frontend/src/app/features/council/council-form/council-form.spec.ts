import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { CouncilForm } from './council-form';
import { Agent } from '../../../core/models';

const mockAgents: Agent[] = [
  { id: 'a1', name: 'Analyst', system_prompt: 'You analyze facts carefully.', model: 'claude-sonnet-4-20250514' },
  { id: 'a2', name: 'Critic', system_prompt: 'You challenge assumptions.', model: 'claude-sonnet-4-20250514' },
  { id: 'a3', name: 'Synthesizer', system_prompt: 'You synthesize arguments.', model: 'claude-sonnet-4-20250514' },
];

describe('CouncilForm', () => {
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CouncilForm, NoopAnimationsModule],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should create the component', () => {
    const fixture = TestBed.createComponent(CouncilForm);
    expect(fixture.componentInstance).toBeTruthy();
    httpTesting.expectOne('/api/v1/agents').flush([]);
  });

  it('should load agents on init', () => {
    const fixture = TestBed.createComponent(CouncilForm);
    httpTesting.expectOne('/api/v1/agents').flush(mockAgents);
    fixture.detectChanges();

    expect(fixture.componentInstance.agents()).toEqual(mockAgents);
    expect(fixture.componentInstance.loadingAgents()).toBe(false);
  });

  it('should show loading spinner while agents load', () => {
    const fixture = TestBed.createComponent(CouncilForm);
    fixture.detectChanges();

    expect(fixture.componentInstance.loadingAgents()).toBe(true);
    const spinner = fixture.nativeElement.querySelector('mat-spinner');
    expect(spinner).toBeTruthy();

    httpTesting.expectOne('/api/v1/agents').flush([]);
  });

  it('should display agent list after loading', () => {
    const fixture = TestBed.createComponent(CouncilForm);
    httpTesting.expectOne('/api/v1/agents').flush(mockAgents);
    fixture.detectChanges();

    const options = fixture.nativeElement.querySelectorAll('mat-list-option');
    expect(options.length).toBe(3);
  });

  it('should show no-agents message when empty', () => {
    const fixture = TestBed.createComponent(CouncilForm);
    httpTesting.expectOne('/api/v1/agents').flush([]);
    fixture.detectChanges();

    const msg = fixture.nativeElement.querySelector('.no-agents');
    expect(msg).toBeTruthy();
    expect(msg.textContent).toContain('No agents available');
  });

  it('should have default form values', () => {
    const fixture = TestBed.createComponent(CouncilForm);
    httpTesting.expectOne('/api/v1/agents').flush([]);

    const values = fixture.componentInstance.form.getRawValue();
    expect(values.name).toBe('');
    expect(values.rounds).toBe(3);
    expect(values.voting_mechanism).toBe('majority');
    expect(values.allow_human_turns).toBe(false);
    expect(values.agent_ids).toEqual([]);
  });

  it('should have form invalid when name is empty', () => {
    const fixture = TestBed.createComponent(CouncilForm);
    httpTesting.expectOne('/api/v1/agents').flush([]);

    expect(fixture.componentInstance.form.valid).toBe(false);
  });

  it('should not emit save when form is invalid', () => {
    const fixture = TestBed.createComponent(CouncilForm);
    httpTesting.expectOne('/api/v1/agents').flush([]);

    const saveSpy = vi.fn();
    fixture.componentInstance.save.subscribe(saveSpy);

    fixture.componentInstance.onSubmit();
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('should not emit save when fewer than 2 agents selected', () => {
    const fixture = TestBed.createComponent(CouncilForm);
    httpTesting.expectOne('/api/v1/agents').flush(mockAgents);

    const saveSpy = vi.fn();
    fixture.componentInstance.save.subscribe(saveSpy);

    fixture.componentInstance.form.patchValue({ name: 'Test', agent_ids: ['a1'] });
    fixture.componentInstance.onSubmit();

    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('should emit save with form data when valid', () => {
    const fixture = TestBed.createComponent(CouncilForm);
    httpTesting.expectOne('/api/v1/agents').flush(mockAgents);

    const saveSpy = vi.fn();
    fixture.componentInstance.save.subscribe(saveSpy);

    fixture.componentInstance.form.patchValue({ name: 'Test Council', agent_ids: ['a1', 'a2'] });
    fixture.componentInstance.onSubmit();

    expect(saveSpy).toHaveBeenCalledWith({
      name: 'Test Council',
      rounds: 3,
      voting_mechanism: 'majority',
      allow_human_turns: false,
      agent_ids: ['a1', 'a2'],
    });
  });
});
