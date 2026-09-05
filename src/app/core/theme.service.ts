import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';

export type ThemeMode = 'current' | 'light' | 'contrast';

const THEME_KEY = 'gm.theme.v1';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  readonly mode = signal<ThemeMode>(this.readMode());

  constructor() {
    this.apply(this.mode());
  }

  setMode(mode: ThemeMode): void {
    this.mode.set(mode);
    localStorage.setItem(THEME_KEY, mode);
    this.apply(mode);
  }

  private readMode(): ThemeMode {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === 'light' || saved === 'contrast' || saved === 'current' ? saved : 'current';
  }

  private apply(mode: ThemeMode): void {
    if (mode === 'current') {
      this.document.documentElement.removeAttribute('data-theme');
    } else {
      this.document.documentElement.dataset['theme'] = mode;
    }
  }
}
