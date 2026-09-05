import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { LibraryStore } from './core/library.store';

@Component({
  selector: 'gm-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <router-outlet />

    @if (store.message(); as msg) {
      <div class="toast" role="status">{{ msg }}</div>
    }

    @if (updateReady()) {
      <div class="toast" role="status">
        Neue Version bereit.
        <button class="ghost small" (click)="reload()">Jetzt laden</button>
      </div>
    }
  `,
})
export class AppComponent {
  readonly store = inject(LibraryStore);
  readonly updateReady = signal(false);

  constructor() {
    const updates = inject(SwUpdate, { optional: true });
    if (updates?.isEnabled) {
      updates.versionUpdates.subscribe((event) => {
        if (event.type === 'VERSION_READY') this.updateReady.set(true);
      });
    }
  }

  reload(): void {
    location.reload();
  }
}
