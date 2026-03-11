import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { AgentForm } from './agent-form';

describe('AgentForm', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AgentForm, NoopAnimationsModule],
    }).compileComponents();
  });

  it('should create the component', () => {
    const fixture = TestBed.createComponent(AgentForm);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should have default form values', () => {
    const fixture = TestBed.createComponent(AgentForm);
    const values = fixture.componentInstance.form.getRawValue();
    expect(values.name).toBe('');
    expect(values.system_prompt).toBe('');
    expect(values.model).toBe('claude-sonnet-4-20250514');
  });

  it('should have form invalid when name is empty', () => {
    const fixture = TestBed.createComponent(AgentForm);
    expect(fixture.componentInstance.form.valid).toBe(false);
  });

  it('should have form invalid when system_prompt is empty', () => {
    const fixture = TestBed.createComponent(AgentForm);
    fixture.componentInstance.form.patchValue({ name: 'Test Agent' });
    expect(fixture.componentInstance.form.valid).toBe(false);
  });

  it('should have form valid when name and system_prompt are filled', () => {
    const fixture = TestBed.createComponent(AgentForm);
    fixture.componentInstance.form.patchValue({ name: 'Test Agent', system_prompt: 'You are a test agent.' });
    expect(fixture.componentInstance.form.valid).toBe(true);
  });

  it('should not emit save when form is invalid', () => {
    const fixture = TestBed.createComponent(AgentForm);
    const saveSpy = vi.fn();
    fixture.componentInstance.save.subscribe(saveSpy);

    fixture.componentInstance.onSubmit();
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('should emit save with form data when valid', () => {
    const fixture = TestBed.createComponent(AgentForm);
    const saveSpy = vi.fn();
    fixture.componentInstance.save.subscribe(saveSpy);

    fixture.componentInstance.form.patchValue({ name: 'Test Agent', system_prompt: 'You are a test agent.' });
    fixture.componentInstance.onSubmit();

    expect(saveSpy).toHaveBeenCalledWith({
      name: 'Test Agent',
      system_prompt: 'You are a test agent.',
      model: 'claude-sonnet-4-20250514',
    });
  });

  it('should have model options', () => {
    const fixture = TestBed.createComponent(AgentForm);
    expect(fixture.componentInstance.modelOptions.length).toBeGreaterThan(0);
    expect(fixture.componentInstance.modelOptions[0].value).toBe('claude-sonnet-4-20250514');
  });
});
