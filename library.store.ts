import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { FirestoreRepository, LocalRepository, SetlistRepository } from './repository';
import { Setlist, Song, StorageMode, emptySetlist, emptySong, uid } from './models';
import { seedSetlist } from './seed';

/**
 * Eine Quelle der Wahrheit fuer die ganze App.
 *
 * Ohne Login laeuft alles ueber den lokalen Speicher. Meldet sich jemand an,
 * wird auf Firestore umgeschaltet — die lokalen Listen bleiben erhalten und
 * koennen einmalig hochgeladen werden.
 */
@Injectable({ providedIn: 'root' })
export class LibraryStore {
  private readonly auth = inject(AuthService);
  private readonly local = new LocalRepository();

  private repo: SetlistRepository = this.local;
  private unwatch: (() => void) | null = null;

  readonly setlists = signal<Setlist[]>([]);
  readonly loading = signal(true);
  readonly mode = signal<StorageMode>('local');
  readonly message = signal<string | null>(null);

  readonly sorted = computed(() =>
    [...this.setlists()].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)),
  );

  constructor() {
    effect(() => {
      const user = this.auth.user();
      if (user === undefined) return; // Auth-Status noch offen
      this.use(user ? new FirestoreRepository(user.uid) : this.local);
    });
  }

  private use(repo: SetlistRepository): void {
    this.unwatch?.();
    this.repo = repo;
    this.mode.set(repo.mode);
    this.loading.set(true);
    this.unwatch = repo.watch((lists) => {
      this.setlists.set(lists);
      this.loading.set(false);
      if (repo.mode === 'local' && lists.length === 0) void this.seedOnce();
    });
  }

  /** Beim allerersten Start eine Beispiel-Setlist anlegen, damit nichts leer ist. */
  private async seedOnce(): Promise<void> {
    if (localStorage.getItem('gm.seeded')) return;
    localStorage.setItem('gm.seeded', '1');
    await this.local.save(seedSetlist());
  }

  byId(id: string): Setlist | undefined {
    return this.setlists().find((l) => l.id === id);
  }

  async saveSetlist(list: Setlist): Promise<void> {
    const next = { ...list, updatedAt: Date.now() };
    // Optimistisch anzeigen, damit die Buehne nie auf das Netz wartet.
    this.setlists.update((all) => {
      const i = all.findIndex((l) => l.id === next.id);
      return i >= 0 ? all.map((l) => (l.id === next.id ? next : l)) : [...all, next];
    });
    await this.repo.save(next);
  }

  async createSetlist(name: string): Promise<Setlist> {
    const list = emptySetlist(name.trim() || 'Neue Setlist');
    await this.saveSetlist(list);
    return list;
  }

  async duplicateSetlist(id: string): Promise<Setlist | null> {
    const src = this.byId(id);
    if (!src) return null;
    const copy: Setlist = {
      ...src,
      id: uid('l_'),
      name: `${src.name} (Kopie)`,
      songs: src.songs.map((s) => ({ ...s, id: uid('s_') })),
      updatedAt: Date.now(),
    };
    await this.saveSetlist(copy);
    return copy;
  }

  async deleteSetlist(id: string): Promise<void> {
    this.setlists.update((all) => all.filter((l) => l.id !== id));
    await this.repo.remove(id);
  }

  async addSong(listId: string, song: Partial<Song> = {}): Promise<Song | null> {
    const list = this.byId(listId);
    if (!list) return null;
    const created = emptySong({ title: 'Neuer Song', ...song });
    await this.saveSetlist({ ...list, songs: [...list.songs, created] });
    return created;
  }

  async updateSong(listId: string, song: Song): Promise<void> {
    const list = this.byId(listId);
    if (!list) return;
    const songs = list.songs.map((s) =>
      s.id === song.id ? { ...song, updatedAt: Date.now() } : s,
    );
    await this.saveSetlist({ ...list, songs });
  }

  async removeSong(listId: string, songId: string): Promise<void> {
    const list = this.byId(listId);
    if (!list) return;
    await this.saveSetlist({ ...list, songs: list.songs.filter((s) => s.id !== songId) });
  }

  async moveSong(listId: string, from: number, to: number): Promise<void> {
    const list = this.byId(listId);
    if (!list) return;
    if (to < 0 || to >= list.songs.length || from === to) return;
    const songs = [...list.songs];
    const [moved] = songs.splice(from, 1);
    songs.splice(to, 0, moved);
    await this.saveSetlist({ ...list, songs });
  }

  /** Lokale Listen in die Cloud schieben (nach dem ersten Login). */
  async pushLocalToCloud(): Promise<number> {
    if (this.mode() !== 'cloud') return 0;
    const localLists = await this.local.list();
    const cloudIds = new Set(this.setlists().map((l) => l.id));
    let count = 0;
    for (const list of localLists) {
      if (cloudIds.has(list.id)) continue;
      await this.repo.save(list);
      count++;
    }
    if (count) this.message.set(`${count} Setlist(s) in dein Konto uebernommen.`);
    return count;
  }

  async hasLocalData(): Promise<boolean> {
    return (await this.local.list()).length > 0;
  }

  exportJson(): string {
    return JSON.stringify({ version: 1, setlists: this.setlists() }, null, 2);
  }

  async importJson(raw: string): Promise<number> {
    const data = JSON.parse(raw) as { setlists?: Setlist[] } | Setlist[];
    const lists = Array.isArray(data) ? data : (data.setlists ?? []);
    for (const list of lists) {
      await this.saveSetlist({ ...list, id: uid('l_'), updatedAt: Date.now() });
    }
    return lists.length;
  }

  notify(text: string): void {
    this.message.set(text);
    setTimeout(() => this.message.set(null), 3500);
  }
}
