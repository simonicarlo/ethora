import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { HumanTurnInput } from './human-turn-input';

@Component({
  imports: [HumanTurnInput],
  template: `<app-human-turn-input
    [sessionId]="sessionId()"
    (submitted)="submitted = true" />`,
})
class TestHost {
  readonly sessionId = signal('sess-1');
  submitted = false;
}

describe('HumanTurnInput', () => {
  let fixture: ComponentFixture<TestHost>;
  let host: TestHost;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHost, NoopAnimationsModule],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHost);
    host = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('should render the card with title', () => {
    const title = fixture.nativeElement.querySelector('mat-card-title');
    expect(title.textContent).toContain('Your Turn');
  });

  it('should disable send button when textarea is empty', () => {
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button[mat-flat-button]');
    expect(button.disabled).toBe(true);
  });

  it('should enable send button when textarea has content', () => {
    const textarea: HTMLTextAreaElement = fixture.nativeElement.querySelector('textarea');
    textarea.value = 'My input';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button[mat-flat-button]');
    expect(button.disabled).toBe(false);
  });

  it('should POST human turn and emit submitted on success', () => {
    const textarea: HTMLTextAreaElement = fixture.nativeElement.querySelector('textarea');
    textarea.value = 'I think we should consider...';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button[mat-flat-button]');
    button.click();
    fixture.detectChanges();

    const req = httpMock.expectOne('/api/v1/sessions/sess-1/human-turn');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ content: 'I think we should consider...' });

    req.flush({ status: 'accepted' });
    fixture.detectChanges();

    expect(host.submitted).toBe(true);
  });

  it('should show error message on failure', () => {
    const textarea: HTMLTextAreaElement = fixture.nativeElement.querySelector('textarea');
    textarea.value = 'test';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button[mat-flat-button]');
    button.click();
    fixture.detectChanges();

    const req = httpMock.expectOne('/api/v1/sessions/sess-1/human-turn');
    req.flush({ detail: 'Session is not awaiting human turn' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();

    const errorText = fixture.nativeElement.querySelector('.error-text');
    expect(errorText.textContent).toContain('Session is not awaiting human turn');
    expect(host.submitted).toBe(false);
  });

  it('should not submit when content is only whitespace', () => {
    const textarea: HTMLTextAreaElement = fixture.nativeElement.querySelector('textarea');
    textarea.value = '   ';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button[mat-flat-button]');
    expect(button.disabled).toBe(true);
  });
});
