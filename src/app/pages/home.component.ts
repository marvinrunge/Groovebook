import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { LibraryStore } from '../core/library.store';
import { HeaderComponent } from '../shell/header.component';

@Component({
  selector: 'gm-home',
  standalone: true,
  imports: [RouterLink, FormsModule, DatePipe, HeaderComponent],
  template: `
    <gm-header title="Setlisten" />

    <main class="page stack">
      @if (store.loading()) {
        <p class="muted">Lade …</p>
      } @else if (!store.sorted().length) {
        <div class="empty">
          <p>Noch keine Setlist da.</p>
          <p class="small">
            Leg eine an oder importiere dein bestehendes Dokument.
          </p>
        </div>
      }

      <div class="list">
        @for (list of store.sorted(); track list.id) {
          <div class="list-item">
            <a class="grow truncate" [routerLink]="['/l', list.id]" style="color: inherit">
              <div class="truncate" style="font-weight: 600">{{ list.name }}</div>
              <div class="small muted">
                {{ list.songs.length }} Songs · {{ list.updatedAt | date: 'dd.MM.yy, HH:mm' }}
              </div>
            </a>
            <a class="btn primary" [routerLink]="['/l', list.id, 'play']">Spielen</a>
            <button class="ghost icon" (click)="menuFor.set(menuFor() === list.id ? null : list.id)" aria-label="Mehr">⋯</button>
          </div>

          @if (menuFor() === list.id) {
            <div class="row wrap" style="padding: 10px 4px 14px">
              <a class="btn ghost" [routerLink]="['/l', list.id]">Bearbeiten</a>
              <button class="ghost" (click)="duplicate(list.id)">Duplizieren</button>
              <a class="btn ghost" [routerLink]="['/import']" [queryParams]="{ into: list.id }">
                Songs importieren
              </a>
              <button class="danger" (click)="remove(list.id, list.name)">Löschen</button>
            </div>
          }
        }
      </div>
    </main>

    <nav class="bar-bottom">
      <div class="page-inner">
        <input
          class="grow"
          [(ngModel)]="newName"
          (keydown.enter)="create()"
          placeholder="Name der neuen Setlist"
          aria-label="Name der neuen Setlist"
        />
        <button class="primary" (click)="create()">Anlegen</button>
        <a class="btn ghost" routerLink="/import">Import</a>
      </div>
    </nav>
  `,
})
export class HomeComponent {
  readonly store = inject(LibraryStore);
  private readonly router = inject(Router);

  newName = '';
  readonly menuFor = signal<string | null>(null);

  async create(): Promise<void> {
    const list = await this.store.createSetlist(this.newName);
    this.newName = '';
    void this.router.navigate(['/l', list.id]);
  }

  async duplicate(id: string): Promise<void> {
    await this.store.duplicateSetlist(id);
    this.menuFor.set(null);
    this.store.notify('Kopie angelegt.');
  }

  async remove(id: string, name: string): Promise<void> {
    if (!confirm(`„${name}“ wirklich löschen?`)) return;
    await this.store.deleteSetlist(id);
    this.menuFor.set(null);
  }
}
