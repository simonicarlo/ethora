import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { AgentCreate } from './agent-create';
import { AgentForm } from '../agent-form/agent-form';

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

  it('should display the page title', () => {
    const fixture = TestBed.createComponent(AgentCreate);
    fixture.detectChanges();

    const h1 = fixture.nativeElement.querySelector('h1');
    expect(h1.textContent).toContain('Create Agent');
  });

  it('should contain the agent form component', () => {
    const fixture = TestBed.createComponent(AgentCreate);
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('app-agent-form');
    expect(form).toBeTruthy();
  });

  it('should submit and navigate on success', () => {
    const fixture = TestBed.createComponent(AgentCreate);
    const component = fixture.componentInstance;
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    component.onSave({ name: 'Test Agent', system_prompt: 'You are a test agent.', model: 'claude-sonnet-4-20250514' });

    expect(component.submitting()).toBe(true);

    const req = httpTesting.expectOne('/api/v1/agents');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.name).toBe('Test Agent');
    req.flush({ id: 'a1', name: 'Test Agent', system_prompt: 'You are a test agent.', model: 'claude-sonnet-4-20250514' });

    expect(navigateSpy).toHaveBeenCalledWith(['/agents']);
  });

  it('should show error on API failure', () => {
    const fixture = TestBed.createComponent(AgentCreate);
    const component = fixture.componentInstance;

    component.onSave({ name: 'Test Agent', system_prompt: 'You are a test agent.' });

    httpTesting.expectOne('/api/v1/agents').flush(
      { detail: 'Something went wrong' },
      { status: 500, statusText: 'Server Error' },
    );

    expect(component.error()).toBe('Something went wrong');
    expect(component.submitting()).toBe(false);
  });
});
