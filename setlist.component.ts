import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { LibraryStore } from '../core/library.store';
import { Song } from '../core/models';
import { HeaderComponent } from '../shell/header.component';
import { SongEditorComponent } from './song-editor.component';

@Component({
  selector: 'gm-setlist',
  standalone: true,
  imports: [RouterLink, FormsModule, HeaderComponent, SongEditorComponent],
  template: `
    @if (list(); as list) {
      <gm-header [title]="list.name" [back]="true" />

      <main class="page stack">
        <div class="card stack" style="gap: 12px">
          <label class="field">
            <span>Name</span>
            <input [ngModel]="list.name" (ngModelChange)="rename($event)" />
          </label>
          <div class="row wrap" style="gap: 12px">
            <label class="field grow">
              <span>Ort</span>
              <input
                [ngModel]="list.venue ?? ''"
                (ngModelChange)="patch({ venue: $event })"
                placeholder="Location"
              />
            </label>
            <label class="field grow">
              <span>Datum</span>
              <input
                type="date"
                [ngModel]="list.date ?? ''"
                (ngModelChange)="patch({ date: $event })"
              />
            </label>
          </div>
        </div>

        @if (!list.songs.length) {
          <div class="empty">
            <p>Keine Songs in dieser Liste.</p>
            <a class="btn primary" routerLink="/import" [queryParams]="{ into: list.id }">
              Dokument importieren
            </a>
          </div>
        }

        <div class="list">
          @for (song of list.songs; track song.id; let i = $index) {
            <div class="list-item">
              <span class="pos">{{ i + 1 }}</span>
              <button class="ghost grow" style="justify-content: flex-start; min-height: 0; padding: 4px" (click)="editing.set(song.id)">
                <span class="grow truncate" style="text-align: left">
                  <span style="font-weight: 600">{{ song.title || '(ohne Titel)' }}</span>
                  @if (song.notes) {
                    <span class="small muted truncate"> · {{ song.notes.split('\n')[0] }}</span>
                  }
                </span>
              </button>
              @if (song.key) {
                <span class="chip">{{ song.key }}</span>
              }
              <button class="ghost icon" (click)="move(i, i - 1)" [disabled]="i === 0" aria-label="Nach oben">↑</button>
              <button
                class="ghost icon"
                (click)="move(i, i + 1)"
                [disabled]="i === list.songs.length - 1"
                aria-label="Nach unten"
              >
                ↓
              </button>
            </div>
          }
        </div>

        <div class="row wrap">
          <button (click)="addSong()">Song hinzufügen</button>
          <a class="btn ghost" routerLink="/import" [queryParams]="{ into: list.id }">
            Aus Dokument ergänzen
          </a>
        </div>
      </main>

      <nav class="bar-bottom">
        <div class="page-inner">
          <a class="btn primary grow" [routerLink]="['/l', list.id, 'play']">
            Bühnenansicht starten
          </a>
        </div>
      </nav>

      @if (currentSong(); as song) {
        <gm-song-editor
          [song]="song"
          [position]="indexOf(song) + 1"
          (save)="saveSong($event)"
          (delete)="deleteSong(song.id)"
          (close)="editing.set(null)"
        />
      }
    } @else {
      <gm-header title="Setlist" [back]="true" />
      <main class="page">
        <p class="muted">Diese Setlist gibt es nicht (mehr).</p>
        <a class="btn" routerLink="/">Zur Übersicht</a>
      </main>
    }
  `,
})
export class SetlistComponent {
  private readonly route = inject(ActivatedRoute);
  readonly store = inject(LibraryStore);

  readonly id = signal(this.route.snapshot.paramMap.get('id') ?? '');
  readonly list = computed(() => this.store.byId(this.id()));
  readonly editing = signal<string | null>(null);
  readonly currentSong = computed(
    () => this.list()?.songs.find((s) => s.id === this.editing()) ?? null,
  );

  firstLine(text: string): string {
    return text.split(/\r?\n/)[0];
  }

  indexOf(song: Song): number {
    return this.list()?.songs.findIndex((s) => s.id === song.id) ?? 0;
  }

  rename(name: string): void {
    this.patch({ name });
  }

  patch(change: Partial<{ name: string; venue: string; date: string }>): void {
    const list = this.list();
    if (!list) return;
    void this.store.saveSetlist({ ...list, ...change });
  }

  async addSong(): Promise<void> {
    const song = await this.store.addSong(this.id(), { title: '' });
    if (song) this.editing.set(song.id);
  }

  saveSong(song: Song): void {
    void this.store.updateSong(this.id(), song);
  }

  async deleteSong(songId: string): Promise<void> {
    this.editing.set(null);
    await this.store.removeSong(this.id(), songId);
  }

  move(from: number, to: number): void {
    void this.store.moveSong(this.id(), from, to);
  }
}
