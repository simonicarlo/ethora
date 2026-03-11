import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
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
          required
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
