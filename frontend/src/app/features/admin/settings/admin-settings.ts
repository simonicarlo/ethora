import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSliderModule } from '@angular/material/slider';
import { MatSnackBar } from '@angular/material/snack-bar';

import { ApiService } from '../../../core/api.service';
import { AppSetting } from '../../../core/models';

@Component({
  selector: 'app-admin-settings',
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSliderModule,
  ],
  templateUrl: './admin-settings.html',
  styleUrl: './admin-settings.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSettings {
  private readonly api = inject(ApiService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(true);
  readonly saving = signal(false);

  readonly currentApiKey = signal('');
  readonly newApiKey = signal('');

  readonly modelOptions = [
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { value: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
    { value: 'claude-haiku-4-20250514', label: 'Claude Haiku 4' },
  ];

  readonly selectedModel = signal('claude-sonnet-4-20250514');
  readonly temperature = signal(1.0);
  readonly maxTokens = signal(4096);

  constructor() {
    this.loadSettings();
  }

  private loadSettings(): void {
    this.api.getSettings().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (settings) => {
        for (const s of settings) {
          this.applySetting(s);
        }
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  private applySetting(s: AppSetting): void {
    switch (s.key) {
      case 'anthropic_api_key':
        this.currentApiKey.set(s.value);
        break;
      case 'default_model':
        this.selectedModel.set(s.value);
        break;
      case 'temperature':
        this.temperature.set(parseFloat(s.value) || 1.0);
        break;
      case 'max_tokens':
        this.maxTokens.set(parseInt(s.value, 10) || 4096);
        break;
    }
  }

  saveApiKey(): void {
    const key = this.newApiKey();
    if (!key) return;
    this.saving.set(true);
    this.api.updateSetting('anthropic_api_key', key)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (s) => {
          this.currentApiKey.set(s.value);
          this.newApiKey.set('');
          this.saving.set(false);
          this.snackBar.open('API key updated', 'OK', { duration: 3000 });
        },
        error: () => {
          this.saving.set(false);
          this.snackBar.open('Failed to update API key', 'OK', { duration: 3000 });
        },
      });
  }

  saveModelConfig(): void {
    this.saving.set(true);
    forkJoin([
      this.api.updateSetting('default_model', this.selectedModel()),
      this.api.updateSetting('temperature', this.temperature().toString()),
      this.api.updateSetting('max_tokens', this.maxTokens().toString()),
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.snackBar.open('Model configuration saved', 'OK', { duration: 3000 });
        },
        error: () => {
          this.saving.set(false);
          this.snackBar.open('Failed to save model config', 'OK', { duration: 3000 });
        },
      });
  }
}
