import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';

import { AgentConfig } from './agent-config';
import { DEFAULT_AGENT_ICON } from '../../../../core/models';
import { mockAgents, mockAgent1, mockAgent2 } from '../../../../../test-utils/fixtures';

describe('AgentConfig', () => {
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AgentConfig, NoopAnimationsModule, MatDialogModule],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should create the component', () => {
    const fixture = TestBed.createComponent(AgentConfig);
    expect(fixture.componentInstance).toBeTruthy();
    httpTesting.expectOne('/api/v1/agents').flush([]);
  });

  it('should show loading spinner while fetching agents', () => {
    const fixture = TestBed.createComponent(AgentConfig);
    fixture.detectChanges();

    const spinner = fixture.nativeElement.querySelector('mat-spinner');
    expect(spinner).toBeTruthy();
    httpTesting.expectOne('/api/v1/agents').flush([]);
  });

  it('should populate agents signal after successful load', () => {
    const fixture = TestBed.createComponent(AgentConfig);
    httpTesting.expectOne('/api/v1/agents').flush(mockAgents);

    expect(fixture.componentInstance.agents()).toEqual(mockAgents);
    expect(fixture.componentInstance.loading()).toBe(false);
  });

  it('should set error signal on agents load failure', () => {
    const fixture = TestBed.createComponent(AgentConfig);
    httpTesting.expectOne('/api/v1/agents').error(new ProgressEvent('error'));
    fixture.detectChanges();

    expect(fixture.componentInstance.error()).toBeTruthy();
    expect(fixture.componentInstance.loading()).toBe(false);
  });

  it('should start with no selection and hasSelection false', () => {
    const fixture = TestBed.createComponent(AgentConfig);
    httpTesting.expectOne('/api/v1/agents').flush([]);

    const c = fixture.componentInstance;
    expect(c.selectedAgent()).toBeNull();
    expect(c.isCreateMode()).toBe(false);
    expect(c.hasSelection()).toBe(false);
  });

  it('selectAgent() should populate the form and set selectedAgent', () => {
    const fixture = TestBed.createComponent(AgentConfig);
    httpTesting.expectOne('/api/v1/agents').flush(mockAgents);

    fixture.componentInstance.selectAgent(mockAgent1);

    const c = fixture.componentInstance;
    expect(c.selectedAgent()).toEqual(mockAgent1);
    expect(c.isCreateMode()).toBe(false);
    expect(c.hasSelection()).toBe(true);
    expect(c.form.getRawValue().name).toBe(mockAgent1.name);
    expect(c.form.getRawValue().system_prompt).toBe(mockAgent1.system_prompt);
    expect(c.form.getRawValue().model).toBe(mockAgent1.model);
  });

  it('startCreate() should reset form and enter create mode', () => {
    const fixture = TestBed.createComponent(AgentConfig);
    httpTesting.expectOne('/api/v1/agents').flush(mockAgents);

    // First select an agent, then switch to create
    fixture.componentInstance.selectAgent(mockAgent1);
    fixture.componentInstance.startCreate();

    const c = fixture.componentInstance;
    expect(c.selectedAgent()).toBeNull();
    expect(c.isCreateMode()).toBe(true);
    expect(c.hasSelection()).toBe(true);
    expect(c.form.getRawValue().name).toBe('');
    expect(c.form.getRawValue().icon).toBe(DEFAULT_AGENT_ICON);
  });

  it('onSave() should POST and add to agents list in create mode', () => {
    const fixture = TestBed.createComponent(AgentConfig);
    const component = fixture.componentInstance;
    httpTesting.expectOne('/api/v1/agents').flush([mockAgent2]);

    component.startCreate();
    component.form.patchValue({
      name: 'New Agent',
      system_prompt: 'You are new.',
      model: 'claude-sonnet-4-20250514',
      icon: 'smart_toy',
    });
    component.onSave();

    const req = httpTesting.expectOne('/api/v1/agents');
    expect(req.request.method).toBe('POST');
    req.flush(mockAgent1);

    expect(component.agents()).toContain(mockAgent1);
    expect(component.agents()).toContain(mockAgent2);
    expect(component.selectedAgent()).toEqual(mockAgent1);
    expect(component.isCreateMode()).toBe(false);
    expect(component.saving()).toBe(false);
  });

  it('onSave() should PUT and update agent in edit mode', () => {
    const fixture = TestBed.createComponent(AgentConfig);
    const component = fixture.componentInstance;
    httpTesting.expectOne('/api/v1/agents').flush([mockAgent1, mockAgent2]);

    component.selectAgent(mockAgent1);
    const updated = { ...mockAgent1, name: 'Updated Analyst' };
    component.form.patchValue({ name: 'Updated Analyst' });
    component.onSave();

    const req = httpTesting.expectOne(`/api/v1/agents/${mockAgent1.id}`);
    expect(req.request.method).toBe('PUT');
    req.flush(updated);

    const agents = component.agents();
    const found = agents.find((a) => a.id === mockAgent1.id);
    expect(found?.name).toBe('Updated Analyst');
    expect(component.selectedAgent()).toEqual(updated);
  });

  it('onSave() should not call API when form is invalid', () => {
    const fixture = TestBed.createComponent(AgentConfig);
    const component = fixture.componentInstance;
    httpTesting.expectOne('/api/v1/agents').flush([]);

    component.startCreate();
    component.form.patchValue({ name: '' }); // name is required — form should be invalid
    component.onSave();

    httpTesting.expectNone('/api/v1/agents');
  });

  it('onSave() should set error signal on save failure', () => {
    const fixture = TestBed.createComponent(AgentConfig);
    const component = fixture.componentInstance;
    httpTesting.expectOne('/api/v1/agents').flush([]);

    component.startCreate();
    component.form.patchValue({ name: 'Bad Agent', system_prompt: 'Fail me.' });
    component.onSave();

    httpTesting.expectOne('/api/v1/agents').error(new ProgressEvent('error'));

    expect(component.error()).toBeTruthy();
    expect(component.saving()).toBe(false);
  });

  it('onDelete() should open confirm dialog and call deleteAgent on confirmation', () => {
    const fixture = TestBed.createComponent(AgentConfig);
    const component = fixture.componentInstance;
    httpTesting.expectOne('/api/v1/agents').flush([mockAgent1, mockAgent2]);

    const dialog = TestBed.inject(MatDialog);
    const mockRef = {
      afterClosed: () => of(true),
    } as MatDialogRef<unknown>;
    vi.spyOn(dialog, 'open').mockReturnValue(mockRef);

    component.selectAgent(mockAgent1);
    component.onDelete();

    const req = httpTesting.expectOne(`/api/v1/agents/${mockAgent1.id}`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);

    expect(component.agents().find((a) => a.id === mockAgent1.id)).toBeUndefined();
    expect(component.selectedAgent()).toBeNull();
  });

  it('onDelete() should not call API when dialog is cancelled', () => {
    const fixture = TestBed.createComponent(AgentConfig);
    const component = fixture.componentInstance;
    httpTesting.expectOne('/api/v1/agents').flush([mockAgent1]);

    const dialog = TestBed.inject(MatDialog);
    const mockRef = { afterClosed: () => of(false) } as MatDialogRef<unknown>;
    vi.spyOn(dialog, 'open').mockReturnValue(mockRef);

    component.selectAgent(mockAgent1);
    component.onDelete();

    httpTesting.expectNone(`/api/v1/agents/${mockAgent1.id}`);
  });

  it('onDelete() should do nothing when no agent is selected', () => {
    const fixture = TestBed.createComponent(AgentConfig);
    httpTesting.expectOne('/api/v1/agents').flush([]);

    const dialog = TestBed.inject(MatDialog);
    vi.spyOn(dialog, 'open');

    fixture.componentInstance.onDelete();

    expect(dialog.open).not.toHaveBeenCalled();
  });

  it('onAgentCloned() should add agent to list and select it', () => {
    const fixture = TestBed.createComponent(AgentConfig);
    const component = fixture.componentInstance;
    httpTesting.expectOne('/api/v1/agents').flush([mockAgent2]);

    component.onAgentCloned(mockAgent1);

    expect(component.agents()).toContain(mockAgent1);
    expect(component.selectedAgent()).toEqual(mockAgent1);
  });

  it('should not fire a second save while one is in flight', () => {
    const fixture = TestBed.createComponent(AgentConfig);
    const component = fixture.componentInstance;
    httpTesting.expectOne('/api/v1/agents').flush([]);

    component.startCreate();
    component.form.patchValue({ name: 'Agent A', system_prompt: 'Prompt A' });
    component.onSave();
    component.onSave(); // second call ignored — saving is true

    const requests = httpTesting.match('/api/v1/agents');
    expect(requests.length).toBe(1);
    requests[0].flush(mockAgent1);
  });
});
