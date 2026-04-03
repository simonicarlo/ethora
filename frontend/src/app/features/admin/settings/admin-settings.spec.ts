import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatSnackBar } from '@angular/material/snack-bar';

import { AdminSettings } from './admin-settings';
import { mockAppSetting } from '../../../../test-utils/fixtures';

describe('AdminSettings', () => {
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminSettings, NoopAnimationsModule],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should create the component', () => {
    const fixture = TestBed.createComponent(AdminSettings);
    expect(fixture.componentInstance).toBeTruthy();
    httpTesting.expectOne('/api/v1/admin/settings').flush([]);
  });

  it('should show loading spinner initially', () => {
    const fixture = TestBed.createComponent(AdminSettings);
    fixture.detectChanges();

    const spinner = fixture.nativeElement.querySelector('mat-spinner');
    expect(spinner).toBeTruthy();
    httpTesting.expectOne('/api/v1/admin/settings').flush([]);
  });

  it('should populate signals from loaded settings', () => {
    const fixture = TestBed.createComponent(AdminSettings);
    const component = fixture.componentInstance;

    httpTesting.expectOne('/api/v1/admin/settings').flush([
      mockAppSetting('anthropic_api_key', 'sk-ant-test'),
      mockAppSetting('default_model', 'claude-opus-4-20250514'),
      mockAppSetting('temperature', '0.7'),
      mockAppSetting('max_tokens', '2048'),
    ]);
    fixture.detectChanges();

    expect(component.loading()).toBe(false);
    expect(component.currentApiKey()).toBe('sk-ant-test');
    expect(component.selectedModel()).toBe('claude-opus-4-20250514');
    expect(component.temperature()).toBeCloseTo(0.7);
    expect(component.maxTokens()).toBe(2048);
  });

  it('should hide spinner after settings load', () => {
    const fixture = TestBed.createComponent(AdminSettings);
    httpTesting.expectOne('/api/v1/admin/settings').flush([]);
    fixture.detectChanges();

    const spinner = fixture.nativeElement.querySelector('mat-spinner');
    expect(spinner).toBeFalsy();
  });

  it('should stop loading on settings fetch error', () => {
    const fixture = TestBed.createComponent(AdminSettings);
    httpTesting.expectOne('/api/v1/admin/settings').error(new ProgressEvent('error'));
    fixture.detectChanges();

    expect(fixture.componentInstance.loading()).toBe(false);
  });

  it('saveApiKey() should PUT the new key and update currentApiKey', () => {
    const fixture = TestBed.createComponent(AdminSettings);
    const component = fixture.componentInstance;
    httpTesting.expectOne('/api/v1/admin/settings').flush([]);

    component.newApiKey.set('sk-ant-new-key');
    component.saveApiKey();

    const req = httpTesting.expectOne('/api/v1/admin/settings/anthropic_api_key');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ value: 'sk-ant-new-key' });
    req.flush(mockAppSetting('anthropic_api_key', 'sk-ant-new-key'));
    fixture.detectChanges();

    expect(component.currentApiKey()).toBe('sk-ant-new-key');
    expect(component.newApiKey()).toBe('');
    expect(component.saving()).toBe(false);
  });

  it('saveApiKey() should not call API when newApiKey is empty', () => {
    const fixture = TestBed.createComponent(AdminSettings);
    httpTesting.expectOne('/api/v1/admin/settings').flush([]);

    fixture.componentInstance.newApiKey.set('');
    fixture.componentInstance.saveApiKey();

    httpTesting.expectNone('/api/v1/admin/settings/anthropic_api_key');
  });

  it('saveApiKey() should show snackbar on success', () => {
    const fixture = TestBed.createComponent(AdminSettings);
    httpTesting.expectOne('/api/v1/admin/settings').flush([]);

    const snackBar = TestBed.inject(MatSnackBar);
    vi.spyOn(snackBar, 'open');

    fixture.componentInstance.newApiKey.set('sk-new');
    fixture.componentInstance.saveApiKey();
    httpTesting.expectOne('/api/v1/admin/settings/anthropic_api_key').flush(
      mockAppSetting('anthropic_api_key', 'sk-new'),
    );

    expect(snackBar.open).toHaveBeenCalledWith('API key updated', 'OK', { duration: 3000 });
  });

  it('saveApiKey() should show error snackbar on failure', () => {
    const fixture = TestBed.createComponent(AdminSettings);
    httpTesting.expectOne('/api/v1/admin/settings').flush([]);

    const snackBar = TestBed.inject(MatSnackBar);
    vi.spyOn(snackBar, 'open');

    fixture.componentInstance.newApiKey.set('sk-bad');
    fixture.componentInstance.saveApiKey();
    httpTesting
      .expectOne('/api/v1/admin/settings/anthropic_api_key')
      .error(new ProgressEvent('error'));

    expect(snackBar.open).toHaveBeenCalledWith('Failed to update API key', 'OK', { duration: 3000 });
  });

  it('saveModelConfig() should PUT model, temperature, and maxTokens in parallel', () => {
    const fixture = TestBed.createComponent(AdminSettings);
    const component = fixture.componentInstance;
    httpTesting.expectOne('/api/v1/admin/settings').flush([]);

    component.selectedModel.set('claude-haiku-4-20250514');
    component.temperature.set(0.5);
    component.maxTokens.set(2000);
    component.saveModelConfig();

    const modelReq = httpTesting.expectOne('/api/v1/admin/settings/default_model');
    const tempReq = httpTesting.expectOne('/api/v1/admin/settings/temperature');
    const tokensReq = httpTesting.expectOne('/api/v1/admin/settings/max_tokens');

    expect(modelReq.request.body).toEqual({ value: 'claude-haiku-4-20250514' });
    expect(tempReq.request.body).toEqual({ value: '0.5' });
    expect(tokensReq.request.body).toEqual({ value: '2000' });

    modelReq.flush(mockAppSetting('default_model', 'claude-haiku-4-20250514'));
    tempReq.flush(mockAppSetting('temperature', '0.5'));
    tokensReq.flush(mockAppSetting('max_tokens', '2000'));

    expect(component.saving()).toBe(false);
  });

  it('saveModelConfig() should show success snackbar', () => {
    const fixture = TestBed.createComponent(AdminSettings);
    httpTesting.expectOne('/api/v1/admin/settings').flush([]);

    const snackBar = TestBed.inject(MatSnackBar);
    vi.spyOn(snackBar, 'open');

    fixture.componentInstance.saveModelConfig();

    httpTesting.expectOne('/api/v1/admin/settings/default_model').flush(
      mockAppSetting('default_model', 'claude-sonnet-4-20250514'),
    );
    httpTesting.expectOne('/api/v1/admin/settings/temperature').flush(
      mockAppSetting('temperature', '1'),
    );
    httpTesting.expectOne('/api/v1/admin/settings/max_tokens').flush(
      mockAppSetting('max_tokens', '4096'),
    );

    expect(snackBar.open).toHaveBeenCalledWith('Model configuration saved', 'OK', {
      duration: 3000,
    });
  });

  it('saveModelConfig() should show error snackbar on failure', () => {
    const fixture = TestBed.createComponent(AdminSettings);
    httpTesting.expectOne('/api/v1/admin/settings').flush([]);

    const snackBar = TestBed.inject(MatSnackBar);
    vi.spyOn(snackBar, 'open');

    fixture.componentInstance.saveModelConfig();

    httpTesting
      .expectOne('/api/v1/admin/settings/default_model')
      .error(new ProgressEvent('error'));
    httpTesting.expectOne('/api/v1/admin/settings/temperature').flush(
      mockAppSetting('temperature', '1'),
    );
    httpTesting.expectOne('/api/v1/admin/settings/max_tokens').flush(
      mockAppSetting('max_tokens', '4096'),
    );

    expect(snackBar.open).toHaveBeenCalledWith('Failed to save model config', 'OK', {
      duration: 3000,
    });
  });

  it('should use 1.0 as fallback for invalid temperature setting', () => {
    const fixture = TestBed.createComponent(AdminSettings);
    const component = fixture.componentInstance;

    httpTesting.expectOne('/api/v1/admin/settings').flush([
      mockAppSetting('temperature', 'not-a-number'),
    ]);
    fixture.detectChanges();

    expect(component.temperature()).toBe(1.0);
  });

  it('should use 4096 as fallback for invalid max_tokens setting', () => {
    const fixture = TestBed.createComponent(AdminSettings);
    const component = fixture.componentInstance;

    httpTesting.expectOne('/api/v1/admin/settings').flush([
      mockAppSetting('max_tokens', 'bad'),
    ]);
    fixture.detectChanges();

    expect(component.maxTokens()).toBe(4096);
  });
});
