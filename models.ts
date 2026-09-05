export interface Song {
  id: string;
  /** Songtitel, wie er auf der Liste steht. */
  title: string;
  /** Tonart, z. B. "F#m". Optional — steht oft schon in den Akkorden. */
  key?: string;
  /** Akkorde / Ablauf. Mehrzeilig, monospace dargestellt. */
  chords: string;
  /** Notizen: Sound, Einsätze, Endings. Mehrzeilig. */
  notes: string;
  /** BPM, falls gepflegt. */
  tempo?: number | null;
  updatedAt: number;
}

export interface Setlist {
  id: string;
  name: string;
  venue?: string;
  /** ISO-Datum (yyyy-mm-dd) des Gigs. */
  date?: string;
  songs: Song[];
  updatedAt: number;
  /** Nur in der Cloud gesetzt. */
  ownerId?: string;
}

export type StorageMode = 'local' | 'cloud';

export function uid(prefix = ''): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return prefix + Date.now().toString(36) + rnd;
}

export function emptySong(partial: Partial<Song> = {}): Song {
  return {
    id: uid('s_'),
    title: '',
    key: '',
    chords: '',
    notes: '',
    tempo: null,
    updatedAt: Date.now(),
    ...partial,
  };
}

export function emptySetlist(name: string): Setlist {
  return { id: uid('l_'), name, songs: [], updatedAt: Date.now() };
}

/** Entfernt undefined-Werte — Firestore lehnt die ab. */
export function clean<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    out[k] = Array.isArray(v)
      ? v.map((item) =>
          item && typeof item === 'object' ? clean(item as Record<string, unknown>) : item,
        )
      : v;
  }
  return out as T;
}
