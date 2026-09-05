import { Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Location } from '@angular/common';
import { AuthService } from '../core/auth.service';
import { LibraryStore } from '../core/library.store';

@Component({
  selector: 'gm-header',
  standalone: true,
  imports: [RouterLink],
  template: `
    <header class="appbar">
      @if (back()) {
        <button class="ghost icon" (click)="location.back()" aria-label="Zurück">←</button>
      }

      <div class="brand grow truncate">
        <span
          class="dot"
          [class.cloud]="store.mode() === 'cloud'"
          [title]="store.mode() === 'cloud' ? 'Mit deinem Konto synchronisiert' : 'Lokal in diesem Browser gespeichert'"
        ></span>
        <span class="truncate">{{ title() }}</span>
      </div>

      @if (auth.available) {
        @if (auth.user(); as user) {
          <button class="ghost small" (click)="auth.signOut()">
            {{ user.name.split(' ')[0] }} abmelden
          </button>
        } @else {
          <button class="ghost small" [disabled]="auth.busy()" (click)="signIn()">
            Mit Google anmelden
          </button>
        }
      }

      <a class="btn ghost icon" routerLink="/settings" aria-label="Einstellungen">⚙</a>
    </header>
  `,
})
export class HeaderComponent {
  readonly title = input('Groove Setlist');
  readonly back = input(false);

  readonly auth = inject(AuthService);
  readonly store = inject(LibraryStore);
  readonly location = inject(Location);

  async signIn(): Promise<void> {
    const hadLocal = await this.store.hasLocalData();
    await this.auth.signInWithGoogle();
    if (this.auth.error()) {
      this.store.notify(this.auth.error()!);
      return;
    }
    if (hadLocal) {
      // kurz warten, bis der Cloud-Repo-Wechsel durch ist
      setTimeout(() => void this.store.pushLocalToCloud(), 1200);
    }
  }
}
