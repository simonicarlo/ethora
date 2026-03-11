import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonToggleModule } from '@angular/material/button-toggle';

import { Council, QuestionType } from '../../../core/models';

@Component({
  selector: 'app-start-session-dialog',
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatButtonToggleModule,
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
      <div class="question-type-row">
        <label class="toggle-label">Question type</label>
        <mat-button-toggle-group
          [value]="questionType()"
          (change)="questionType.set($event.value)"
          data-testid="question-type-toggle"
        >
          <mat-button-toggle value="binary">Binary</mat-button-toggle>
          <mat-button-toggle value="open">Open-ended</mat-button-toggle>
        </mat-button-toggle-group>
      </div>
      <mat-form-field class="claim-field">
        <mat-label>{{ questionType() === 'binary' ? 'Claim to evaluate' : 'Question to answer' }}</mat-label>
        <textarea
          matInput
          rows="3"
          required
          [placeholder]="questionType() === 'binary' ? 'Enter a claim for the council to evaluate...' : 'Enter a question for the council to answer...'"
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
  changeDetection: ChangeDetectionStrategy.OnPush,
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
    .question-type-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .toggle-label {
      font-size: 0.9rem;
      opacity: 0.7;
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
  readonly questionType = signal<QuestionType>('binary');

  onCancel(): void {
    this.dialogRef.close();
  }

  onStart(): void {
    this.dialogRef.close({ claim: this.claim().trim(), questionType: this.questionType() });
  }
}
