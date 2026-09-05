import { Component, inject } from '@angular/core';
import { LibraryStore } from '../core/library.store';
import { AuthService } from '../core/auth.service';
import { HeaderComponent } from '../shell/header.component';
import { isFirebaseConfigured } from '../core/firebase';
import { ThemeMode, ThemeService } from '../core/theme.service';

@Component({
  selector: 'gm-settings',
  standalone: true,
  imports: [HeaderComponent],
  template: `
    <gm-header title="Einstellungen" [back]="true" />

    <main class="page stack">
      <section class="card stack" style="gap: 10px">
        <h2>Speicherort</h2>
        @if (store.mode() === 'cloud') {
          <p class="small">
            Deine Setlisten liegen in deinem Google-Konto und sind auf allen Geräten gleich.
            Ohne Netz arbeitet die App weiter und synchronisiert später.
          </p>
          <div class="row">
            <button (click)="push()">Lokale Listen hochladen</button>
            <button class="ghost" (click)="auth.signOut()">Abmelden</button>
          </div>
        } @else {
          <p class="small">
            Alles liegt in diesem Browser. Kein Konto nötig, funktioniert offline —
            aber nur auf diesem Gerät. Lade die Sicherung herunter, bevor du den
            Browserspeicher leerst.
          </p>
          @if (firebaseReady) {
            <button class="primary" (click)="signIn()">Mit Google anmelden</button>
          } @else {
            <p class="small muted">
              Firebase ist noch nicht eingetragen (src/environments/environment.ts).
              Bis dahin bleibt die App im lokalen Modus — voll nutzbar.
            </p>
          }
        }
      </section>

      <section class="card stack" style="gap: 10px">
        <h2>Darstellung</h2>
        <p class="small">Wähle die Farben, die für dich und deine Bühne am besten passen.</p>
        <label class="field">
          <span>Farbmodus</span>
          <select [value]="theme.mode()" (change)="setTheme($event)">
            <option value="current">Aktuell: Nachtblau mit Bernstein</option>
            <option value="light">Hell: weißer Hintergrund, schwarze Schrift</option>
            <option value="contrast">Kontrast: schwarzer Hintergrund, weiße Schrift</option>
          </select>
        </label>
      </section>

      <section class="card stack" style="gap: 10px">
        <h2>Sicherung</h2>
        <p class="small">
          Eine JSON-Datei mit allen Setlisten. Über „Importieren" kommt sie zurück.
        </p>
        <div class="row wrap">
          <button (click)="download()">Sicherung herunterladen</button>
          <button class="ghost" (click)="copy()">In Zwischenablage</button>
        </div>
      </section>

      <section class="card stack" style="gap: 10px">
        <h2>Auf der Bühne</h2>
        <ul class="small" style="margin: 0; padding-left: 18px; line-height: 1.7">
          <li>Rechts/links tippen oder wischen wechselt den Song.</li>
          <li>Pfeiltasten, Leertaste und Bild auf/ab funktionieren mit Fußschaltern.</li>
          <li>„Aa" öffnet Schriftgröße und Transponierung.</li>
          <li>Der Bildschirm bleibt an, solange die Bühnenansicht offen ist.</li>
          <li>Zum Installieren: im Browsermenü „Zum Startbildschirm hinzufügen".</li>
        </ul>
      </section>

      <section class="card stack" style="gap: 10px">
        <h2>Zurücksetzen</h2>
        <button class="danger" (click)="wipe()">Lokale Daten löschen</button>
      </section>
    </main>
  `,
})
export class SettingsComponent {
  readonly store = inject(LibraryStore);
  readonly auth = inject(AuthService);
  readonly theme = inject(ThemeService);
  readonly firebaseReady = isFirebaseConfigured();

  setTheme(event: Event): void {
    const mode = (event.target as HTMLSelectElement).value as ThemeMode;
    this.theme.setMode(mode);
  }

  async signIn(): Promise<void> {
    const hadLocal = await this.store.hasLocalData();
    await this.auth.signInWithGoogle();
    if (hadLocal) setTimeout(() => void this.store.pushLocalToCloud(), 1200);
  }

  async push(): Promise<void> {
    const n = await this.store.pushLocalToCloud();
    if (!n) this.store.notify('Nichts Neues zu übertragen.');
  }

  download(): void {
    const blob = new Blob([this.store.exportJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `setlisten-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async copy(): Promise<void> {
    await navigator.clipboard.writeText(this.store.exportJson());
    this.store.notify('Sicherung kopiert.');
  }

  wipe(): void {
    if (!confirm('Alle lokal gespeicherten Setlisten löschen? Das lässt sich nicht rückgängig machen.')) return;
    localStorage.removeItem('gm.setlists.v1');
    localStorage.removeItem('gm.seeded');
    location.reload();
  }
}
