# Start Session Flow Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Material dialog to start deliberation sessions from council cards, wiring through to the session view.

**Architecture:** A standalone `StartSessionDialog` component receives a `Council` via `MAT_DIALOG_DATA`, collects the claim text, and returns it on close. `CouncilList` opens the dialog, calls `ApiService.createSession()`, and navigates to `/sessions/:id`.

**Tech Stack:** Angular 17+ standalone components, Angular Material Dialog, Signals, Vitest

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/src/app/features/session/start-session-dialog/start-session-dialog.ts` | Create | Dialog component (template + styles inline) |
| `frontend/src/app/features/session/start-session-dialog/start-session-dialog.spec.ts` | Create | Tests for dialog |
| `frontend/src/app/features/council/council-list/council-list.ts` | Modify | Add dialog opening + session creation + navigation |
| `frontend/src/app/features/council/council-list/council-list.html` | Modify | Add "Start Session" button to cards |
| `frontend/src/app/features/council/council-list/council-list.spec.ts` | Modify | Add tests for new button + dialog flow |

---

## Chunk 1: StartSessionDialog Component

### Task 1: Create StartSessionDialog with tests

**Files:**
- Create: `frontend/src/app/features/session/start-session-dialog/start-session-dialog.ts`
- Create: `frontend/src/app/features/session/start-session-dialog/start-session-dialog.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/features/session/start-session-dialog/start-session-dialog.spec.ts`:

```typescript
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
    expect(dialogRef.close).toHaveBeenCalledWith('Is the earth flat?');
  });

  it('should close without result when Cancel is clicked', () => {
    const fixture = TestBed.createComponent(StartSessionDialog);
    fixture.detectChanges();
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="cancel-btn"]');
    btn.click();
    expect(dialogRef.close).toHaveBeenCalledWith();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx ng test --watch=false 2>&1 | tail -20`
Expected: FAIL — `StartSessionDialog` does not exist

- [ ] **Step 3: Write the StartSessionDialog component**

Create `frontend/src/app/features/session/start-session-dialog/start-session-dialog.ts`:

```typescript
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import { Council } from '../../../core/models';

@Component({
  selector: 'app-start-session-dialog',
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  template: `
    <h2 mat-dialog-title>Start Session — {{ council.name }}</h2>
    <mat-dialog-content>
      <p class="agent-count">{{ council.agents.length }} agent{{ council.agents.length === 1 ? '' : 's' }} will deliberate</p>
      <mat-chip-set>
        @for (agent of council.agents; track agent.id) {
          <mat-chip>{{ agent.name }}</mat-chip>
        }
      </mat-chip-set>
      <mat-form-field class="claim-field">
        <mat-label>Claim or question</mat-label>
        <textarea
          matInput
          rows="3"
          placeholder="Enter a claim or question for the council to deliberate..."
          [ngModel]="claim()"
          (ngModelChange)="claim.set($event)"
        ></textarea>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button data-testid="cancel-btn" (click)="onCancel()">Cancel</button>
      <button
        mat-flat-button
        data-testid="start-btn"
        [disabled]="!claim().trim()"
        (click)="onStart()"
      >
        Start Session
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    mat-dialog-content {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 400px;
    }
    .agent-count {
      margin: 0;
      opacity: 0.7;
      font-size: 0.9rem;
    }
    .claim-field {
      width: 100%;
    }
  `,
})
export class StartSessionDialog {
  private readonly dialogRef = inject(MatDialogRef<StartSessionDialog>);
  readonly council: Council = inject(MAT_DIALOG_DATA);
  readonly claim = signal('');

  onCancel(): void {
    this.dialogRef.close();
  }

  onStart(): void {
    this.dialogRef.close(this.claim().trim());
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx ng test --watch=false 2>&1 | tail -20`
Expected: All StartSessionDialog tests PASS

- [ ] **Step 5: Commit**

```
git add frontend/src/app/features/session/start-session-dialog/start-session-dialog.ts frontend/src/app/features/session/start-session-dialog/start-session-dialog.spec.ts
git commit -m "feat: add StartSessionDialog component with tests"
```

---

## Chunk 2: Wire CouncilList to Dialog

### Task 2: Add "Start Session" button and dialog wiring to CouncilList

**Files:**
- Modify: `frontend/src/app/features/council/council-list/council-list.ts`
- Modify: `frontend/src/app/features/council/council-list/council-list.html`
- Modify: `frontend/src/app/features/council/council-list/council-list.spec.ts`

- [ ] **Step 1: Update test setup and write failing tests**

In `frontend/src/app/features/council/council-list/council-list.spec.ts`:

First, add imports at the top of the file:
```typescript
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';
```

Then add `NoopAnimationsModule` and `MatDialogModule` to the `TestBed` configuration:
```typescript
    await TestBed.configureTestingModule({
      imports: [CouncilList, NoopAnimationsModule, MatDialogModule],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
```

Then add the following tests inside the existing `describe` block, before the closing `});`:

```typescript
  it('should show a Start Session button on each council card', () => {
    const fixture = TestBed.createComponent(CouncilList);
    httpTesting.expectOne('/api/v1/councils').flush(mockCouncils);
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll('[data-testid="start-session-btn"]');
    expect(buttons.length).toBe(2);
    expect(buttons[0].textContent).toContain('Start Session');
  });

  it('should open dialog and navigate to session on Start Session', () => {
    const fixture = TestBed.createComponent(CouncilList);
    httpTesting.expectOne('/api/v1/councils').flush(mockCouncils);
    fixture.detectChanges();

    const dialog = TestBed.inject(MatDialog);
    const mockDialogRef = { afterClosed: () => of('Is the earth flat?') } as MatDialogRef<unknown>;
    vi.spyOn(dialog, 'open').mockReturnValue(mockDialogRef);

    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="start-session-btn"]');
    btn.click();
    fixture.detectChanges();

    expect(dialog.open).toHaveBeenCalled();

    const req = httpTesting.expectOne('/api/v1/sessions');
    expect(req.request.body).toEqual({ council_id: 'c1', input_claim: 'Is the earth flat?' });
    req.flush({ id: 's1', council_id: 'c1', input_claim: 'Is the earth flat?', status: 'pending', created_at: '2026-01-01T00:00:00Z' });
  });

  it('should not call API when dialog is cancelled', () => {
    const fixture = TestBed.createComponent(CouncilList);
    httpTesting.expectOne('/api/v1/councils').flush(mockCouncils);
    fixture.detectChanges();

    const dialog = TestBed.inject(MatDialog);
    const mockDialogRef = { afterClosed: () => of(undefined) } as MatDialogRef<unknown>;
    vi.spyOn(dialog, 'open').mockReturnValue(mockDialogRef);

    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="start-session-btn"]');
    btn.click();
    fixture.detectChanges();

    // No session creation request should be made
    httpTesting.expectNone('/api/v1/sessions');
  });
```

- [ ] **Step 2: Run tests to verify the new test fails**

Run: `cd frontend && npx ng test --watch=false 2>&1 | tail -20`
Expected: FAIL — no element with `[data-testid="start-session-btn"]`

- [ ] **Step 3: Add the Start Session button to the template**

In `frontend/src/app/features/council/council-list/council-list.html`, add `<mat-card-actions>` after `</mat-card-content>` (before `</mat-card>`):

```html
        <mat-card-actions>
          <button mat-flat-button data-testid="start-session-btn" (click)="startSession(council)">
            <mat-icon>play_arrow</mat-icon>
            Start Session
          </button>
        </mat-card-actions>
```

- [ ] **Step 4: Add the startSession method and imports to the component**

In `frontend/src/app/features/council/council-list/council-list.ts`:

Add imports:
```typescript
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { StartSessionDialog } from '../../session/start-session-dialog/start-session-dialog';
```

Add to the `imports` array in `@Component`:
```typescript
MatCardModule,  // already present — no change
```

Add injected services and the method to the class:
```typescript
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);

  startSession(council: Council): void {
    const ref = this.dialog.open(StartSessionDialog, {
      data: council,
      width: '520px',
    });
    ref.afterClosed().subscribe((claim) => {
      if (!claim) return;
      this.api.createSession({ council_id: council.id, input_claim: claim }).subscribe({
        next: (session) => this.router.navigate(['/sessions', session.id]),
        error: (err) => this.error.set(err?.message ?? 'Failed to create session'),
      });
    });
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npx ng test --watch=false 2>&1 | tail -20`
Expected: All tests PASS (including the new "Start Session button" test)

- [ ] **Step 6: Commit**

```
git add frontend/src/app/features/council/council-list/council-list.ts frontend/src/app/features/council/council-list/council-list.html frontend/src/app/features/council/council-list/council-list.spec.ts
git commit -m "feat: add Start Session button to council cards with dialog wiring"
```

- [ ] **Step 7: Update TODO.md — check off all 3 items in section 4**

Mark the three items in section 4 as complete (`[x]`).

```
git add TODO.md
git commit -m "docs: mark Start Session Flow tasks complete"
```
