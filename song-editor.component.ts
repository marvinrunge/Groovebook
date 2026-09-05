import { Component, OnDestroy, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Song } from '../core/models';

/**
 * Ein Bearbeiten-Panel fuer beide Situationen: in Ruhe zu Hause
 * und schnell zwischen zwei Songs auf der Buehne.
 */
@Component({
  selector: 'gm-song-editor',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="sheet" (click)="close.emit()">
      <div class="sheet-inner stack" (click)="$event.stopPropagation()" style="gap: 14px">
        <div class="row spread">
          <h2>Song {{ position() }}</h2>
          <button class="ghost icon" (click)="close.emit()" aria-label="Schließen">✕</button>
        </div>

        <label class="field">
          <span>Titel</span>
          <input [ngModel]="draftTitle" (ngModelChange)="draftTitle = $event; touch()" placeholder="Songtitel" />
        </label>

        <div class="row wrap" style="gap: 12px">
          <label class="field" style="max-width: 140px">
            <span>Tonart</span>
            <input [ngModel]="draftKey" (ngModelChange)="draftKey = $event; touch()" placeholder="z. B. F#m" />
          </label>
          <label class="field" style="max-width: 140px">
            <span>Tempo</span>
            <input
              type="number"
              inputmode="numeric"
              [ngModel]="draftTempo"
              (ngModelChange)="draftTempo = $event; touch()"
              placeholder="BPM"
            />
          </label>
        </div>

        <label class="field">
          <span>Akkorde und Ablauf</span>
          <textarea
            class="chords"
            rows="6"
            [ngModel]="draftChords"
            (ngModelChange)="draftChords = $event; touch()"
            placeholder="Em  G  A  G | F#  B"
          ></textarea>
        </label>

        <label class="field">
          <span>Notizen</span>
          <textarea
            rows="5"
            [ngModel]="draftNotes"
            (ngModelChange)="draftNotes = $event; touch()"
            placeholder="Sound, Einsätze, Ending …"
          ></textarea>
        </label>

        <div class="row spread">
          <button class="danger" (click)="confirmDelete()">Song löschen</button>
          <span class="small muted">{{ dirty() ? 'Wird gespeichert …' : 'Gespeichert' }}</span>
        </div>
      </div>
    </div>
  `,
})
export class SongEditorComponent implements OnDestroy {
  readonly song = input.required<Song>();
  readonly position = input(1);

  readonly save = output<Song>();
  readonly delete = output<void>();
  readonly close = output<void>();

  draftTitle = '';
  draftKey = '';
  draftChords = '';
  draftNotes = '';
  draftTempo: number | null = null;

  readonly dirty = signal(false);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private loadedId = '';

  constructor() {
    effect(() => {
      const s = this.song();
      if (s.id === this.loadedId) return;
      this.loadedId = s.id;
      this.draftTitle = s.title;
      this.draftKey = s.key ?? '';
      this.draftChords = s.chords;
      this.draftNotes = s.notes;
      this.draftTempo = s.tempo ?? null;
      this.dirty.set(false);
    });
  }

  /** Autosave: nach kurzer Pause schreiben, damit auf der Buehne kein Klick noetig ist. */
  touch(): void {
    this.dirty.set(true);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 500);
  }

  flush(): void {
    if (!this.dirty()) return;
    this.save.emit({
      ...this.song(),
      title: this.draftTitle.trim(),
      key: this.draftKey.trim(),
      chords: this.draftChords,
      notes: this.draftNotes,
      tempo: this.draftTempo === null || Number.isNaN(this.draftTempo) ? null : +this.draftTempo,
      updatedAt: Date.now(),
    });
    this.dirty.set(false);
  }

  confirmDelete(): void {
    if (confirm('Diesen Song aus der Setlist entfernen?')) this.delete.emit();
  }

  ngOnDestroy(): void {
    this.flush();
  }
}
