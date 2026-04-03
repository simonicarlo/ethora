import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter, convertToParamMap } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { CouncilForm } from './council-form';
import { mockAgents, mockCouncil1 } from '../../../../test-utils/fixtures';

/** Provider for ActivatedRoute without a route id (create mode). */
function createModeRoute() {
  return {
    provide: ActivatedRoute,
    useValue: { snapshot: { paramMap: convertToParamMap({}) } },
  };
}

/** Provider for ActivatedRoute with a council id (edit mode). */
function editModeRoute(id: string) {
  return {
    provide: ActivatedRoute,
    useValue: { snapshot: { paramMap: convertToParamMap({ id }) } },
  };
}

describe('CouncilForm — create mode', () => {
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CouncilForm, NoopAnimationsModule],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        createModeRoute(),
      ],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should create the component', () => {
    const fixture = TestBed.createComponent(CouncilForm);
    fixture.componentInstance.ngOnInit();
    expect(fixture.componentInstance).toBeTruthy();
    httpTesting.expectOne('/api/v1/agents').flush([]);
  });

  it('should load agents on construction', () => {
    const fixture = TestBed.createComponent(CouncilForm);
    const component = fixture.componentInstance;
    fixture.componentInstance.ngOnInit();

    httpTesting.expectOne('/api/v1/agents').flush(mockAgents);

    expect(component.agents()).toEqual(mockAgents);
    expect(component.loadingAgents()).toBe(false);
  });

  it('should not be in edit mode without route id', () => {
    const fixture = TestBed.createComponent(CouncilForm);
    const component = fixture.componentInstance;
    fixture.componentInstance.ngOnInit();

    httpTesting.expectOne('/api/v1/agents').flush([]);

    expect(component.isEditMode()).toBe(false);
    expect(component.loading()).toBe(false);
  });

  it('should set error when agents load fails', () => {
    const fixture = TestBed.createComponent(CouncilForm);
    fixture.componentInstance.ngOnInit();

    httpTesting.expectOne('/api/v1/agents').error(new ProgressEvent('error'));

    expect(fixture.componentInstance.error()).toBe('Failed to load agents');
    expect(fixture.componentInstance.loadingAgents()).toBe(false);
  });

  it('should initialise form with default values', () => {
    const fixture = TestBed.createComponent(CouncilForm);
    fixture.componentInstance.ngOnInit();
    httpTesting.expectOne('/api/v1/agents').flush([]);

    const values = fixture.componentInstance.form.getRawValue();
    expect(values.name).toBe('');
    expect(values.rounds).toBe(3);
    expect(values.voting_mechanism).toBe('majority');
    expect(values.allow_human_turns).toBe(false);
    expect(values.tools_enabled).toBe(false);
    expect(values.agent_ids).toEqual([]);
  });

  it('onSubmit() should set error when fewer than 2 agents are selected', () => {
    const fixture = TestBed.createComponent(CouncilForm);
    const component = fixture.componentInstance;
    fixture.componentInstance.ngOnInit();
    httpTesting.expectOne('/api/v1/agents').flush(mockAgents);

    component.form.patchValue({ name: 'Council', agent_ids: ['a1'] });
    component.onSubmit();

    expect(component.error()).toContain('at least 2 agents');
    httpTesting.expectNone('/api/v1/councils');
  });

  it('onSubmit() should POST and navigate to /councils on success', () => {
    const fixture = TestBed.createComponent(CouncilForm);
    const component = fixture.componentInstance;
    fixture.componentInstance.ngOnInit();
    httpTesting.expectOne('/api/v1/agents').flush(mockAgents);

    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.form.patchValue({ name: 'New Council', agent_ids: ['a1', 'a2'] });
    component.onSubmit();

    const req = httpTesting.expectOne('/api/v1/councils');
    expect(req.request.method).toBe('POST');
    req.flush(mockCouncil1);

    expect(router.navigate).toHaveBeenCalledWith(['/councils']);
  });

  it('onSubmit() should set error and stop submitting on failure', () => {
    const fixture = TestBed.createComponent(CouncilForm);
    const component = fixture.componentInstance;
    fixture.componentInstance.ngOnInit();
    httpTesting.expectOne('/api/v1/agents').flush(mockAgents);

    component.form.patchValue({ name: 'Bad Council', agent_ids: ['a1', 'a2'] });
    component.onSubmit();

    httpTesting.expectOne('/api/v1/councils').error(new ProgressEvent('error'));

    expect(component.error()).toContain('create council');
    expect(component.submitting()).toBe(false);
  });

  it('onSubmit() should not call API when form is invalid', () => {
    const fixture = TestBed.createComponent(CouncilForm);
    const component = fixture.componentInstance;
    fixture.componentInstance.ngOnInit();
    httpTesting.expectOne('/api/v1/agents').flush([]);

    // name is required — leave it blank so form is invalid
    component.form.patchValue({ name: '', agent_ids: ['a1', 'a2'] });
    component.onSubmit();

    httpTesting.expectNone('/api/v1/councils');
  });

  it('should not fire second submit while submitting', () => {
    const fixture = TestBed.createComponent(CouncilForm);
    const component = fixture.componentInstance;
    fixture.componentInstance.ngOnInit();
    httpTesting.expectOne('/api/v1/agents').flush(mockAgents);

    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.form.patchValue({ name: 'Council', agent_ids: ['a1', 'a2'] });
    component.onSubmit();
    component.onSubmit(); // ignored — submitting is true

    const requests = httpTesting.match('/api/v1/councils');
    expect(requests.length).toBe(1);
    requests[0].flush(mockCouncil1);
  });
});

describe('CouncilForm — edit mode', () => {
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CouncilForm, NoopAnimationsModule],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        editModeRoute('c1'),
      ],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should enter edit mode when route has an id', () => {
    const fixture = TestBed.createComponent(CouncilForm);
    fixture.componentInstance.ngOnInit();

    httpTesting.expectOne('/api/v1/agents').flush(mockAgents);
    httpTesting.expectOne('/api/v1/councils/c1').flush(mockCouncil1);

    expect(fixture.componentInstance.isEditMode()).toBe(true);
  });

  it('should populate the form with existing council data', () => {
    const fixture = TestBed.createComponent(CouncilForm);
    fixture.componentInstance.ngOnInit();

    httpTesting.expectOne('/api/v1/agents').flush(mockAgents);
    httpTesting.expectOne('/api/v1/councils/c1').flush(mockCouncil1);

    const values = fixture.componentInstance.form.getRawValue();
    expect(values.name).toBe(mockCouncil1.name);
    expect(values.rounds).toBe(mockCouncil1.rounds);
    expect(values.voting_mechanism).toBe(mockCouncil1.voting_mechanism);
    expect(values.agent_ids).toEqual(mockCouncil1.agents.map((a) => a.id));
  });

  it('onSubmit() should PUT and navigate to /councils on success', () => {
    const fixture = TestBed.createComponent(CouncilForm);
    const component = fixture.componentInstance;
    fixture.componentInstance.ngOnInit();

    httpTesting.expectOne('/api/v1/agents').flush(mockAgents);
    httpTesting.expectOne('/api/v1/councils/c1').flush(mockCouncil1);

    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.form.patchValue({ name: 'Updated Council' });
    component.onSubmit();

    const req = httpTesting.expectOne('/api/v1/councils/c1');
    expect(req.request.method).toBe('PUT');
    req.flush({ ...mockCouncil1, name: 'Updated Council' });

    expect(router.navigate).toHaveBeenCalledWith(['/councils']);
  });

  it('should set error on council load failure', () => {
    const fixture = TestBed.createComponent(CouncilForm);
    fixture.componentInstance.ngOnInit();

    httpTesting.expectOne('/api/v1/agents').flush(mockAgents);
    httpTesting.expectOne('/api/v1/councils/c1').error(new ProgressEvent('error'));

    expect(fixture.componentInstance.error()).toBe('Failed to load council');
    expect(fixture.componentInstance.loading()).toBe(false);
  });

  it('onSubmit() should set error mentioning "update" on PUT failure', () => {
    const fixture = TestBed.createComponent(CouncilForm);
    const component = fixture.componentInstance;
    fixture.componentInstance.ngOnInit();

    httpTesting.expectOne('/api/v1/agents').flush(mockAgents);
    httpTesting.expectOne('/api/v1/councils/c1').flush(mockCouncil1);

    component.form.patchValue({ name: 'Updated Council' });
    component.onSubmit();

    httpTesting.expectOne('/api/v1/councils/c1').error(new ProgressEvent('error'));

    expect(component.error()).toContain('update council');
  });
});
