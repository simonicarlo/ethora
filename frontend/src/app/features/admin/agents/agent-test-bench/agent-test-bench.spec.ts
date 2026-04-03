import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { AgentTestBench } from './agent-test-bench';
import { Agent } from '../../../../core/models';
import { mockAgent1 } from '../../../../../test-utils/fixtures';

@Component({
  selector: 'app-test-host',
  imports: [AgentTestBench],
  template: `<app-agent-test-bench [agent]="agent()" />`,
})
class TestHost {
  agent = signal<Agent>(mockAgent1);
}

describe('AgentTestBench', () => {
  let fixture: ComponentFixture<TestHost>;
  let host: TestHost;
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHost, NoopAnimationsModule],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHost);
    host = fixture.componentInstance;
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should create the component', () => {
    fixture.detectChanges();
    const bench = fixture.nativeElement.querySelector('app-agent-test-bench');
    expect(bench).toBeTruthy();
  });

  it('should render a send button', () => {
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector('button');
    expect(btn).toBeTruthy();
  });

  it('should call testAgent API when send() is triggered', () => {
    fixture.detectChanges();
    const component = fixture.debugElement.children[0].componentInstance as AgentTestBench;

    component.testMessage.set('Is AI reliable?');
    component.send();

    const req = httpTesting.expectOne('/api/v1/agents/a1/test');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ message: 'Is AI reliable?' });
    req.flush({ response: 'Yes, with proper oversight.' });
    fixture.detectChanges();

    expect(component.response()).toBe('Yes, with proper oversight.');
    expect(component.sending()).toBe(false);
  });

  it('should set error signal on API failure', () => {
    fixture.detectChanges();
    const component = fixture.debugElement.children[0].componentInstance as AgentTestBench;

    component.testMessage.set('Test question');
    component.send();

    httpTesting.expectOne('/api/v1/agents/a1/test').error(new ProgressEvent('error'));
    fixture.detectChanges();

    expect(component.error()).toBeTruthy();
    expect(component.sending()).toBe(false);
  });

  it('should not send when message is empty', () => {
    fixture.detectChanges();
    const component = fixture.debugElement.children[0].componentInstance as AgentTestBench;

    component.testMessage.set('');
    component.send();

    httpTesting.expectNone('/api/v1/agents/a1/test');
  });

  it('should not send when already sending', () => {
    fixture.detectChanges();
    const component = fixture.debugElement.children[0].componentInstance as AgentTestBench;

    component.testMessage.set('A question');
    component.send();

    // Attempt a second send before the first resolves
    component.send();

    // Only one request should be outstanding
    const requests = httpTesting.match('/api/v1/agents/a1/test');
    expect(requests.length).toBe(1);
    requests[0].flush({ response: 'Done' });
  });

  it('should clear previous response and error when send() is called again', () => {
    fixture.detectChanges();
    const component = fixture.debugElement.children[0].componentInstance as AgentTestBench;

    // First call
    component.testMessage.set('First question');
    component.send();
    httpTesting.expectOne('/api/v1/agents/a1/test').flush({ response: 'First answer' });
    fixture.detectChanges();
    expect(component.response()).toBe('First answer');

    // Second call should clear previous response
    component.testMessage.set('Second question');
    component.send();

    expect(component.response()).toBeNull();
    expect(component.error()).toBeNull();

    httpTesting.expectOne('/api/v1/agents/a1/test').flush({ response: 'Second answer' });
  });
});
