import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink, MatButtonModule, MatCardModule, MatIconModule],
  template: `
    <div class="not-found-container">
      <mat-card>
        <mat-card-content>
          <mat-icon class="not-found-icon">explore_off</mat-icon>
          <h2>Page not found</h2>
          <p>The page you're looking for doesn't exist or has been moved.</p>
          <a mat-raised-button color="primary" routerLink="/">Go Home</a>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: `
    .not-found-container {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 60vh;
      padding: 24px;
    }
    mat-card-content {
      text-align: center;
      padding: 48px 32px;
    }
    .not-found-icon {
      font-size: 64px;
      width: 64px;
      height: 64px;
      opacity: 0.5;
    }
    h2 { margin-top: 16px; }
    p {
      opacity: 0.7;
      margin-bottom: 24px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFound {}
