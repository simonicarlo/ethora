import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { CouncilCreate } from './council-create';

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
    // CouncilForm fetches agents on init
    httpTesting.expectOne('/api/v1/agents').flush([]);
  });

  it('should display the page title', () => {
    const fixture = TestBed.createComponent(CouncilCreate);
    httpTesting.expectOne('/api/v1/agents').flush([]);
    fixture.detectChanges();

    const h1 = fixture.nativeElement.querySelector('h1');
    expect(h1.textContent).toContain('Create Council');
  });

  it('should contain the council form component', () => {
    const fixture = TestBed.createComponent(CouncilCreate);
    httpTesting.expectOne('/api/v1/agents').flush([]);
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('app-council-form');
    expect(form).toBeTruthy();
  });

  it('should submit and navigate on success', () => {
    const fixture = TestBed.createComponent(CouncilCreate);
    httpTesting.expectOne('/api/v1/agents').flush([]);

    const component = fixture.componentInstance;
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    component.onSave({ name: 'Test Council', agent_ids: ['a1', 'a2'] });

    const req = httpTesting.expectOne('/api/v1/councils');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.name).toBe('Test Council');
    expect(req.request.body.agent_ids).toEqual(['a1', 'a2']);
    req.flush({ id: 'c1', name: 'Test Council', rounds: 3, voting_mechanism: 'majority', allow_human_turns: false, agents: [] });

    expect(navigateSpy).toHaveBeenCalledWith(['/councils']);
  });

  it('should show error on API failure', () => {
    const fixture = TestBed.createComponent(CouncilCreate);
    httpTesting.expectOne('/api/v1/agents').flush([]);

    const component = fixture.componentInstance;
    component.onSave({ name: 'Test', agent_ids: ['a1', 'a2'] });

    httpTesting.expectOne('/api/v1/councils').flush(
      { detail: 'Something went wrong' },
      { status: 500, statusText: 'Server Error' },
    );

    expect(component.error()).toBe('Something went wrong');
    expect(component.submitting()).toBe(false);
  });
});
