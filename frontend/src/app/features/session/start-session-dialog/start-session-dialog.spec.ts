import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { StartSessionDialog } from './start-session-dialog';
import { Council } from '../../../core/models';

const mockCouncil: Council = {
  id: 'c1',
  name: 'Fact Checkers',
  rounds: 3,
  voting_mechanism: 'majority',
  allow_human_turns: false,
  tools_enabled: false,
  agents: [
    { id: 'a1', name: 'Analyst', system_prompt: 'You are an analyst.', model: 'claude-sonnet-4-20250514' },
    { id: 'a2', name: 'Critic', system_prompt: 'You are a critic.', model: 'claude-sonnet-4-20250514' },
  ],
};

describe('StartSessionDialog', () => {
  let dialogRef: { close: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    dialogRef = { close: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [StartSessionDialog, NoopAnimationsModule],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: mockCouncil },
        { provide: MatDialogRef, useValue: dialogRef },
      ],
    }).compileComponents();
  });

  it('should create the component', () => {
    const fixture = TestBed.createComponent(StartSessionDialog);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should display council name in title', () => {
    const fixture = TestBed.createComponent(StartSessionDialog);
    fixture.detectChanges();
    const title = fixture.nativeElement.querySelector('[mat-dialog-title]');
    expect(title.textContent).toContain('Fact Checkers');
  });

  it('should display agent names as chips', () => {
    const fixture = TestBed.createComponent(StartSessionDialog);
    fixture.detectChanges();
    const chips = fixture.nativeElement.querySelectorAll('mat-chip');
    const names = Array.from(chips).map((c: any) => c.textContent.trim());
    expect(names).toContain('Analyst');
    expect(names).toContain('Critic');
  });

  it('should disable Start button when claim is empty', () => {
    const fixture = TestBed.createComponent(StartSessionDialog);
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector('[data-testid="start-btn"]');
    expect(btn.disabled).toBe(true);
  });

  it('should enable Start button when claim is entered', () => {
    const fixture = TestBed.createComponent(StartSessionDialog);
    fixture.detectChanges();
    const textarea = fixture.nativeElement.querySelector('textarea');
    textarea.value = 'Is the earth flat?';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector('[data-testid="start-btn"]');
    expect(btn.disabled).toBe(false);
  });

  it('should close with claim text when Start is clicked', () => {
    const fixture = TestBed.createComponent(StartSessionDialog);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.claim.set('Is the earth flat?');
    fixture.detectChanges();
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="start-btn"]');
    btn.click();
    expect(dialogRef.close).toHaveBeenCalledWith({ claim: 'Is the earth flat?', questionType: 'binary' });
  });

  it('should close without result when Cancel is clicked', () => {
    const fixture = TestBed.createComponent(StartSessionDialog);
    fixture.detectChanges();
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="cancel-btn"]');
    btn.click();
    expect(dialogRef.close).toHaveBeenCalledWith();
  });
});
