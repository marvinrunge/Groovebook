import { Setlist, StorageMode, clean } from './models';
import { getFirebase } from './firebase';

export interface SetlistRepository {
  readonly mode: StorageMode;
  list(): Promise<Setlist[]>;
  save(setlist: Setlist): Promise<void>;
  remove(id: string): Promise<void>;
  /** Live-Updates; gibt eine Abmeldefunktion zurueck. */
  watch(onChange: (lists: Setlist[]) => void): () => void;
}

const KEY = 'gm.setlists.v1';

/** Speichert im Browser. Braucht kein Login, kein Netz, kein Firebase. */
export class LocalRepository implements SetlistRepository {
  readonly mode: StorageMode = 'local';
  private listeners = new Set<(lists: Setlist[]) => void>();

  constructor() {
    // Aenderungen aus einem anderen Tab uebernehmen.
    addEventListener('storage', (e) => {
      if (e.key === KEY) this.emit();
    });
  }

  private read(): Setlist[] {
    try {
      const raw = localStorage.getItem(KEY);
      const parsed = raw ? (JSON.parse(raw) as Setlist[]) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private write(lists: Setlist[]): void {
    localStorage.setItem(KEY, JSON.stringify(lists));
    this.emit();
  }

  private emit(): void {
    const lists = this.read();
    this.listeners.forEach((fn) => fn(lists));
  }

  async list(): Promise<Setlist[]> {
    return this.read();
  }

  async save(setlist: Setlist): Promise<void> {
    const lists = this.read();
    const i = lists.findIndex((l) => l.id === setlist.id);
    if (i >= 0) lists[i] = setlist;
    else lists.push(setlist);
    this.write(lists);
  }

  async remove(id: string): Promise<void> {
    this.write(this.read().filter((l) => l.id !== id));
  }

  watch(onChange: (lists: Setlist[]) => void): () => void {
    this.listeners.add(onChange);
    onChange(this.read());
    return () => this.listeners.delete(onChange);
  }
}

/** Speichert unter users/{uid}/setlists/{id}. Firestore cached offline selbst. */
export class FirestoreRepository implements SetlistRepository {
  readonly mode: StorageMode = 'cloud';
  constructor(private readonly uid: string) {}

  private async col() {
    const { db } = await getFirebase();
    const { collection } = await import('firebase/firestore');
    return collection(db, 'users', this.uid, 'setlists');
  }

  async list(): Promise<Setlist[]> {
    const { getDocs } = await import('firebase/firestore');
    const snap = await getDocs(await this.col());
    return snap.docs.map((d) => ({ ...(d.data() as Setlist), id: d.id }));
  }

  async save(setlist: Setlist): Promise<void> {
    const { db } = await getFirebase();
    const { doc, setDoc } = await import('firebase/firestore');
    const payload = clean({ ...setlist, ownerId: this.uid, updatedAt: Date.now() });
    await setDoc(doc(db, 'users', this.uid, 'setlists', setlist.id), payload);
  }

  async remove(id: string): Promise<void> {
    const { db } = await getFirebase();
    const { doc, deleteDoc } = await import('firebase/firestore');
    await deleteDoc(doc(db, 'users', this.uid, 'setlists', id));
  }

  watch(onChange: (lists: Setlist[]) => void): () => void {
    let stop: (() => void) | null = null;
    let cancelled = false;
    void (async () => {
      const { onSnapshot } = await import('firebase/firestore');
      const c = await this.col();
      if (cancelled) return;
      stop = onSnapshot(
        c,
        (snap) => onChange(snap.docs.map((d) => ({ ...(d.data() as Setlist), id: d.id }))),
        (err) => console.error('[sync]', err),
      );
    })();
    return () => {
      cancelled = true;
      stop?.();
    };
  }
}
