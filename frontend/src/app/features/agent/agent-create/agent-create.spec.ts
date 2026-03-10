import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { AgentCreate } from './agent-create';

describe('AgentCreate', () => {
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AgentCreate, NoopAnimationsModule],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should create the component', () => {
    const fixture = TestBed.createComponent(AgentCreate);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should have default form values', () => {
    const fixture = TestBed.createComponent(AgentCreate);
    const values = fixture.componentInstance.form.getRawValue();
    expect(values.name).toBe('');
    expect(values.system_prompt).toBe('');
    expect(values.model).toBe('claude-sonnet-4-20250514');
  });

  it('should have form invalid when name is empty', () => {
    const fixture = TestBed.createComponent(AgentCreate);
    expect(fixture.componentInstance.form.valid).toBe(false);
  });

  it('should have form invalid when system_prompt is empty', () => {
    const fixture = TestBed.createComponent(AgentCreate);
    fixture.componentInstance.form.patchValue({ name: 'Test Agent' });
    expect(fixture.componentInstance.form.valid).toBe(false);
  });

  it('should have form valid when name and system_prompt are filled', () => {
    const fixture = TestBed.createComponent(AgentCreate);
    fixture.componentInstance.form.patchValue({ name: 'Test Agent', system_prompt: 'You are a test agent.' });
    expect(fixture.componentInstance.form.valid).toBe(true);
  });

  it('should not submit when form is invalid', () => {
    const fixture = TestBed.createComponent(AgentCreate);
    fixture.componentInstance.onSubmit();
    expect(fixture.componentInstance.submitting()).toBe(false);
  });

  it('should submit and navigate on success', () => {
    const fixture = TestBed.createComponent(AgentCreate);
    const component = fixture.componentInstance;
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    component.form.patchValue({ name: 'Test Agent', system_prompt: 'You are a test agent.' });
    component.onSubmit();

    expect(component.submitting()).toBe(true);

    const req = httpTesting.expectOne('/api/v1/agents');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.name).toBe('Test Agent');
    expect(req.request.body.system_prompt).toBe('You are a test agent.');
    expect(req.request.body.model).toBe('claude-sonnet-4-20250514');
    req.flush({ id: 'a1', name: 'Test Agent', system_prompt: 'You are a test agent.', model: 'claude-sonnet-4-20250514' });

    expect(navigateSpy).toHaveBeenCalledWith(['/agents']);
  });

  it('should show error on API failure', () => {
    const fixture = TestBed.createComponent(AgentCreate);
    const component = fixture.componentInstance;

    component.form.patchValue({ name: 'Test Agent', system_prompt: 'You are a test agent.' });
    component.onSubmit();

    httpTesting.expectOne('/api/v1/agents').flush(
      { detail: 'Something went wrong' },
      { status: 500, statusText: 'Server Error' },
    );

    expect(component.error()).toBe('Something went wrong');
    expect(component.submitting()).toBe(false);
  });

  it('should display the page title', () => {
    const fixture = TestBed.createComponent(AgentCreate);
    fixture.detectChanges();

    const h1 = fixture.nativeElement.querySelector('h1');
    expect(h1.textContent).toContain('Create Agent');
  });

  it('should have model options', () => {
    const fixture = TestBed.createComponent(AgentCreate);
    expect(fixture.componentInstance.modelOptions.length).toBeGreaterThan(0);
    expect(fixture.componentInstance.modelOptions[0].value).toBe('claude-sonnet-4-20250514');
  });
});
