import { DestroyRef, Injectable, signal, effect, inject } from '@angular/core';

export type ThemeMode = 'light' | 'dark' | 'system';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly STORAGE_KEY = 'ac-theme';
  private readonly destroyRef = inject(DestroyRef);

  readonly mode = signal<ThemeMode>(this.loadSavedMode());
  readonly isDark = signal(false);

  constructor() {
    // Apply initial theme
    this.applyTheme(this.mode());

    // React to mode changes
    effect(() => {
      const mode = this.mode();
      this.applyTheme(mode);
      localStorage.setItem(this.STORAGE_KEY, mode);
    });

    // Listen for system preference changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => {
      if (this.mode() === 'system') {
        this.applyTheme('system');
      }
    };
    mediaQuery.addEventListener('change', listener);
    this.destroyRef.onDestroy(() => mediaQuery.removeEventListener('change', listener));
  }

  toggle(): void {
    this.mode.set(this.isDark() ? 'light' : 'dark');
  }

  setMode(mode: ThemeMode): void {
    this.mode.set(mode);
  }

  private applyTheme(mode: ThemeMode): void {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dark = mode === 'dark' || (mode === 'system' && prefersDark);

    this.isDark.set(dark);
    document.documentElement.classList.toggle('dark-theme', dark);
  }

  private loadSavedMode(): ThemeMode {
    const saved = localStorage.getItem(this.STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved;
    }
    return 'system';
  }
}
