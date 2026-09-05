import {
  Component,
  HostListener,
  OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LibraryStore } from '../core/library.store';
import { Song } from '../core/models';
import { transpose, stepLabel } from '../core/transpose';
import { SongEditorComponent } from './song-editor.component';

const SIZE_KEY = 'gm.stageSize';

/**
 * Buehnenansicht. Alles ist auf einen Blick aus zwei Metern Entfernung
 * ausgelegt: grosse Akkorde, ruhiger Hintergrund, keine Menues im Weg.
 */
@Component({
  selector: 'gm-perform',
  standalone: true,
  imports: [SongEditorComponent],
  template: `
    @if (list(); as list) {
      <div class="stage">
        <header class="stage-head">
          <button class="ghost icon" (click)="exit()" aria-label="Ansicht verlassen">✕</button>
          <div class="grow truncate">
            <div class="stage-title truncate">{{ song()?.title || '(ohne Titel)' }}</div>
            <div class="small muted">
              {{ index() + 1 }} von {{ list.songs.length }} · {{ list.name }}
              @if (song()?.tempo) {
                · {{ song()?.tempo }} BPM
              }
            </div>
          </div>
          @if (song()?.key) {
            <span class="chip">{{ displayKey() }}</span>
          }
          <button class="ghost icon" (click)="editing.set(true)" aria-label="Song bearbeiten">✎</button>
          <button class="ghost icon" (click)="showTools.set(!showTools())" aria-label="Anzeige">Aa</button>
        </header>

        @if (showTools()) {
          <div class="row wrap" style="padding: 10px 14px; border-bottom: 1px solid var(--line)">
            <span class="small muted">Schrift</span>
            <button class="ghost icon" (click)="resize(-4)" aria-label="Kleiner">−</button>
            <span class="pos">{{ size() }}</span>
            <button class="ghost icon" (click)="resize(4)" aria-label="Größer">+</button>
            <span class="small muted" style="margin-left: 14px">Transponieren</span>
            <button class="ghost icon" (click)="shift(-1)" aria-label="Halbton runter">−</button>
            <button class="ghost" (click)="steps.set(0)">{{ stepLabel(steps()) }}</button>
            <button class="ghost icon" (click)="shift(1)" aria-label="Halbton hoch">+</button>
            <button class="ghost small" (click)="toggleWakeLock()" style="margin-left: auto">
              {{ awake() ? 'Display bleibt an' : 'Display an lassen' }}
            </button>
          </div>
        }

        <div
          class="stage-body"
          [class.two-col]="twoCol()"
          [style.--stage-size]="size() + 'px'"
          (touchstart)="onTouchStart($event)"
          (touchend)="onTouchEnd($event)"
        >
          @if (song(); as song) {
            @if (song.chords) {
              <pre class="stage-chords">{{ displayChords() }}</pre>
            }
            @if (song.chords && song.notes) {
              <hr class="stage-sep" />
            }
            @if (song.notes) {
              <p class="stage-notes">{{ song.notes }}</p>
            }
            @if (!song.chords && !song.notes) {
              <p class="stage-notes muted">
                Noch nichts hinterlegt. Tippe oben auf ✎ und schreib die Akkorde rein.
              </p>
            }
          }
        </div>

        <button class="tapzone left" (click)="prev()" aria-label="Vorheriger Song"></button>
        <button class="tapzone right" (click)="next()" aria-label="Nächster Song"></button>

        <footer class="stage-foot">
          <button class="ghost icon" (click)="prev()" [disabled]="index() === 0" aria-label="Zurück">‹</button>
          <div class="rail">
            @for (s of list.songs; track s.id; let i = $index) {
              <button
                class="tick"
                [class.done]="i < index()"
                [class.now]="i === index()"
                (click)="go(i)"
                [attr.aria-label]="i + 1 + '. ' + s.title"
              ></button>
            }
          </div>
          <button
            class="ghost icon"
            (click)="next()"
            [disabled]="index() >= list.songs.length - 1"
            aria-label="Weiter"
          >
            ›
          </button>
        </footer>
      </div>

      @if (editing()) {
        @if (song(); as song) {
          <gm-song-editor
            [song]="song"
            [position]="index() + 1"
            (save)="saveSong($event)"
            (delete)="removeSong(song.id)"
            (close)="editing.set(false)"
          />
        }
      }
    } @else {
      <main class="page">
        <p class="muted">Setlist nicht gefunden.</p>
        <button (click)="exit()">Zurück</button>
      </main>
    }
  `,
})
export class PerformComponent implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly store = inject(LibraryStore);
  readonly stepLabel = stepLabel;

  readonly id = signal(this.route.snapshot.paramMap.get('id') ?? '');
  readonly index = signal(Number(this.route.snapshot.queryParamMap.get('i') ?? 0));
  readonly editing = signal(false);
  readonly showTools = signal(false);
  readonly steps = signal(0);
  readonly awake = signal(false);
  readonly size = signal(Number(localStorage.getItem(SIZE_KEY) ?? 46));

  readonly list = computed(() => this.store.byId(this.id()));
  readonly song = computed<Song | undefined>(() => this.list()?.songs[this.index()]);
  readonly displayChords = computed(() => transpose(this.song()?.chords ?? '', this.steps()));
  readonly displayKey = computed(() => transpose(this.song()?.key ?? '', this.steps()));
  readonly twoCol = computed(() => {
    const s = this.song();
    return ((s?.chords.length ?? 0) + (s?.notes.length ?? 0)) > 420;
  });

  private wakeLock: { release(): Promise<void> } | null = null;
  private touchX = 0;
  private touchY = 0;

  constructor() {
    void this.toggleWakeLock();
  }

  go(i: number): void {
    const list = this.list();
    if (!list) return;
    const next = Math.max(0, Math.min(i, list.songs.length - 1));
    this.index.set(next);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { i: next },
      replaceUrl: true,
    });
    document.querySelector('.stage-body')?.scrollTo({ top: 0 });
  }

  next(): void {
    this.go(this.index() + 1);
  }

  prev(): void {
    this.go(this.index() - 1);
  }

  exit(): void {
    void this.router.navigate(['/l', this.id()]);
  }

  resize(delta: number): void {
    const next = Math.max(18, Math.min(140, this.size() + delta));
    this.size.set(next);
    localStorage.setItem(SIZE_KEY, String(next));
  }

  shift(delta: number): void {
    this.steps.set(Math.max(-11, Math.min(11, this.steps() + delta)));
  }

  saveSong(song: Song): void {
    void this.store.updateSong(this.id(), song);
  }

  async removeSong(songId: string): Promise<void> {
    this.editing.set(false);
    await this.store.removeSong(this.id(), songId);
    this.go(Math.min(this.index(), (this.list()?.songs.length ?? 1) - 1));
  }

  // --- Wischen ---
  onTouchStart(e: TouchEvent): void {
    this.touchX = e.changedTouches[0].clientX;
    this.touchY = e.changedTouches[0].clientY;
  }

  onTouchEnd(e: TouchEvent): void {
    const dx = e.changedTouches[0].clientX - this.touchX;
    const dy = e.changedTouches[0].clientY - this.touchY;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) {
      dx < 0 ? this.next() : this.prev();
    }
  }

  // --- Tastatur (Fussschalter senden meist Pfeiltasten oder Bild auf/ab) ---
  @HostListener('window:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if (this.editing()) return;
    const target = e.target as HTMLElement | null;
    if (target && /input|textarea/i.test(target.tagName)) return;
    switch (e.key) {
      case 'ArrowRight':
      case 'PageDown':
      case ' ':
        e.preventDefault();
        this.next();
        break;
      case 'ArrowLeft':
      case 'PageUp':
        e.preventDefault();
        this.prev();
        break;
      case '+':
      case '=':
        this.resize(4);
        break;
      case '-':
        this.resize(-4);
        break;
      case 'e':
        this.editing.set(true);
        break;
      case 'Escape':
        this.exit();
        break;
    }
  }

  /** Bildschirm wach halten — sonst geht das Handy mitten im Song aus. */
  async toggleWakeLock(): Promise<void> {
    const nav = navigator as Navigator & {
      wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> };
    };
    if (!nav.wakeLock) return;
    if (this.wakeLock) {
      await this.wakeLock.release().catch(() => void 0);
      this.wakeLock = null;
      this.awake.set(false);
      return;
    }
    try {
      this.wakeLock = await nav.wakeLock.request('screen');
      this.awake.set(true);
    } catch {
      this.awake.set(false);
    }
  }

  ngOnDestroy(): void {
    void this.wakeLock?.release().catch(() => void 0);
  }
}
