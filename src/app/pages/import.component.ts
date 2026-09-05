import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { LibraryStore } from '../core/library.store';
import { HeaderComponent } from '../shell/header.component';
import { ParsedSong, parseSetlistText, toSongs } from '../core/parser';
import { docxToText } from '../core/docx';
import { callFunction, isFirebaseConfigured } from '../core/firebase';
import { AuthService } from '../core/auth.service';

interface ParseDocResponse {
  text: string;
  songs?: ParsedSong[];
  source?: string;
}

@Component({
  selector: 'gm-import',
  standalone: true,
  imports: [FormsModule, HeaderComponent],
  template: `
    <gm-header title="Importieren" [back]="true" />

    <main class="page stack">
      <div class="card stack" style="gap: 12px">
        <h2>Datei einlesen</h2>
        <p class="small muted">
          Word (.docx), Text, Markdown und CSV liest die App direkt im Browser.
          Aus Google Docs: Datei → Herunterladen → Microsoft Word (.docx).
          PDF und Scans gehen über die Cloud Function, sobald Firebase eingerichtet ist.
        </p>
        <div class="row wrap">
          <input
            type="file"
            accept=".txt,.md,.csv,.tsv,.docx,.pdf,.json,text/plain"
            (change)="onFile($event)"
          />
          <button class="ghost" (click)="downloadCsvTemplate()">CSV-Vorlage herunterladen</button>
        </div>
        @if (fileNote(); as note) {
          <p class="small">{{ note }}</p>
        }
      </div>

      <div class="card stack" style="gap: 12px">
        <h2>Oder Text einfügen</h2>
        <textarea
          rows="8"
          [ngModel]="raw"
          (ngModelChange)="raw = $event; analyse()"
          placeholder="01. Bad Girls   D G D C   Clean&#10;02. Lost in Music   D"
        ></textarea>
        <div class="row wrap">
          <button (click)="analyse()">Erneut analysieren</button>
          @if (result(); as r) {
            <span class="small muted">{{ r.strategy }} · {{ r.songs.length }} Songs</span>
          }
        </div>
      </div>

      @if (songs().length) {
        <div class="card stack" style="gap: 12px">
          <div class="row spread">
            <h2>Vorschau</h2>
            <span class="small muted">Zellen sind direkt editierbar</span>
          </div>
          <div style="overflow-x: auto">
            <table class="preview">
              <thead>
                <tr>
                  <th></th>
                  <th>Song</th>
                  <th>Akkorde</th>
                  <th>Notizen</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                @for (song of songs(); track $index; let i = $index) {
                  <tr>
                    <td class="pos">{{ i + 1 }}</td>
                    <td><input [(ngModel)]="song.title" /></td>
                    <td class="chords"><input [(ngModel)]="song.chords" /></td>
                    <td><input [(ngModel)]="song.notes" /></td>
                    <td>
                      <button class="ghost icon" (click)="drop(i)" aria-label="Zeile entfernen">✕</button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          @if (!targetId()) {
            <label class="field">
              <span>Name der neuen Setlist</span>
              <input [(ngModel)]="listName" />
            </label>
          } @else {
            <p class="small muted">Wird an „{{ targetName() }}" angehängt.</p>
          }
        </div>
      } @else if (raw) {
        <div class="empty">Aus diesem Text konnte ich keine Songs lesen. Schau, ob Titel und Akkorde durch Tabs, Striche oder mehrere Leerzeichen getrennt sind.</div>
      }
    </main>

    <nav class="bar-bottom">
      <div class="page-inner">
        <button class="primary grow" [disabled]="!songs().length" (click)="commit()">
          {{ targetId() ? 'Songs anhängen' : 'Setlist anlegen' }}
        </button>
      </div>
    </nav>
  `,
})
export class ImportComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  readonly store = inject(LibraryStore);

  raw = '';
  listName = 'Importierte Setlist';

  readonly result = signal<ReturnType<typeof parseSetlistText> | null>(null);
  readonly songs = signal<ParsedSong[]>([]);
  readonly fileNote = signal<string | null>(null);
  readonly targetId = signal(this.route.snapshot.queryParamMap.get('into'));
  readonly targetName = computed(() => this.store.byId(this.targetId() ?? '')?.name ?? '');

  analyse(): void {
    const parsed = parseSetlistText(this.raw);
    this.result.set(parsed);
    this.songs.set(parsed.songs.map((s) => ({ ...s })));
    if (parsed.name && !this.targetId()) this.listName = parsed.name;
  }

  downloadCsvTemplate(): void {
    const csv = [
      '"Song","Akkorde","Notizen"',
      '"Bad Girls","D G D C","Clean"',
      '"Lost in Music","D",""',
      '"Ain\'t No Mountain High Enough","D G D C","Intro 2x, Solo 1x"',
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'groovebook-csv-vorlage.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async onFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.fileNote.set(`Lese ${file.name} …`);
    try {
      const name = file.name.toLowerCase();
      if (name.endsWith('.json')) {
        const count = await this.store.importJson(await file.text());
        this.fileNote.set(`${count} Setlist(s) übernommen.`);
        void this.router.navigate(['/']);
        return;
      }
      if (name.endsWith('.docx')) {
        this.raw = await docxToText(file);
      } else if (name.endsWith('.pdf')) {
        this.raw = await this.viaFunction(file);
      } else {
        this.raw = await file.text();
      }
      this.analyse();
      this.fileNote.set(`${file.name} gelesen.`);
    } catch (e) {
      this.fileNote.set((e as Error).message);
    } finally {
      input.value = '';
    }
  }

  /** PDF und alles Unbekannte geht an die Cloud Function. */
  private async viaFunction(file: File): Promise<string> {
    if (!isFirebaseConfigured() || !this.auth.user()) {
      throw new Error(
        'PDF-Import braucht Firebase und einen Login. Bis dahin: Text kopieren und unten einfügen.',
      );
    }
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
      reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'));
      reader.readAsDataURL(file);
    });
    const res = await callFunction<
      { fileName: string; contentType: string; data: string },
      ParseDocResponse
    >('parseDocument', { fileName: file.name, contentType: file.type, data: base64 });
    if (res.songs?.length) this.songs.set(res.songs);
    return res.text ?? '';
  }

  drop(i: number): void {
    this.songs.update((all) => all.filter((_, idx) => idx !== i));
  }

  async commit(): Promise<void> {
    const songs = toSongs(this.songs());
    const targetId = this.targetId();
    if (targetId) {
      const list = this.store.byId(targetId);
      if (!list) return;
      await this.store.saveSetlist({ ...list, songs: [...list.songs, ...songs] });
      this.store.notify(`${songs.length} Songs angehängt.`);
      void this.router.navigate(['/l', targetId]);
      return;
    }
    const list = await this.store.createSetlist(this.listName);
    await this.store.saveSetlist({ ...list, songs });
    this.store.notify(`${songs.length} Songs importiert.`);
    void this.router.navigate(['/l', list.id]);
  }
}
