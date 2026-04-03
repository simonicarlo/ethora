import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { AgentTemplates } from './agent-templates';
import { AGENT_TEMPLATES } from './templates.data';
import { mockAgent1 } from '../../../../../test-utils/fixtures';

describe('AgentTemplates', () => {
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AgentTemplates, NoopAnimationsModule],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should create the component', () => {
    const fixture = TestBed.createComponent(AgentTemplates);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should display all predefined templates', () => {
    const fixture = TestBed.createComponent(AgentTemplates);
    fixture.detectChanges();

    const cards = fixture.nativeElement.querySelectorAll('mat-card');
    expect(cards.length).toBe(AGENT_TEMPLATES.length);
  });

  it('should display template names', () => {
    const fixture = TestBed.createComponent(AgentTemplates);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    for (const template of AGENT_TEMPLATES) {
      expect(text).toContain(template.name);
    }
  });

  it('should call createAgent API when clone() is called', () => {
    const fixture = TestBed.createComponent(AgentTemplates);
    fixture.detectChanges();

    const template = AGENT_TEMPLATES[0];
    fixture.componentInstance.clone(template);

    const req = httpTesting.expectOne('/api/v1/agents');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      name: template.name,
      system_prompt: template.system_prompt,
      model: template.model,
      icon: template.icon,
    });
    req.flush(mockAgent1);
    fixture.detectChanges();

    expect(fixture.componentInstance.cloning()).toBeNull();
    expect(fixture.componentInstance.error()).toBeNull();
  });

  it('should emit cloned event after successful clone', () => {
    const fixture = TestBed.createComponent(AgentTemplates);
    fixture.detectChanges();

    const emitted: any[] = [];
    fixture.componentInstance.cloned.subscribe((agent: any) => emitted.push(agent));

    fixture.componentInstance.clone(AGENT_TEMPLATES[0]);
    httpTesting.expectOne('/api/v1/agents').flush(mockAgent1);

    expect(emitted.length).toBe(1);
    expect(emitted[0]).toEqual(mockAgent1);
  });

  it('should set error signal on clone failure', () => {
    const fixture = TestBed.createComponent(AgentTemplates);
    fixture.detectChanges();

    fixture.componentInstance.clone(AGENT_TEMPLATES[0]);
    httpTesting.expectOne('/api/v1/agents').error(new ProgressEvent('error'));
    fixture.detectChanges();

    expect(fixture.componentInstance.error()).toBeTruthy();
    expect(fixture.componentInstance.cloning()).toBeNull();
  });

  it('should set cloning signal to template name while cloning', () => {
    const fixture = TestBed.createComponent(AgentTemplates);
    fixture.detectChanges();

    const template = AGENT_TEMPLATES[1];
    fixture.componentInstance.clone(template);

    expect(fixture.componentInstance.cloning()).toBe(template.name);

    httpTesting.expectOne('/api/v1/agents').flush(mockAgent1);
    expect(fixture.componentInstance.cloning()).toBeNull();
  });

  it('should not clone a second template while one is already cloning', () => {
    const fixture = TestBed.createComponent(AgentTemplates);
    fixture.detectChanges();

    fixture.componentInstance.clone(AGENT_TEMPLATES[0]);
    fixture.componentInstance.clone(AGENT_TEMPLATES[1]); // blocked

    const requests = httpTesting.match('/api/v1/agents');
    expect(requests.length).toBe(1);
    requests[0].flush(mockAgent1);
  });
});
