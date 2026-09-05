/* Identisch mit src/app/core/parser.ts — beide Dateien synchron halten. */

import { emptySong, type Song } from './models';

export interface ParsedSong {
  title: string;
  key: string;
  chords: string;
  notes: string;
}

export interface ParseResult {
  name: string | null;
  songs: ParsedSong[];
  /** Kurze Beschreibung, wie erkannt wurde — hilft beim Nachbessern. */
  strategy: string;
}

export function toSongs(parsed: ParsedSong[]): Song[] {
  return parsed.map((song) =>
    emptySong({
      title: song.title,
      key: song.key,
      chords: song.chords,
      notes: song.notes,
    }),
  );
}

/** Akkord-Token: C, F#m7, Bbmaj7, A/C#, Em9, N.C. */
const CHORD_RE =
  /^(?:N\.?C\.?|[A-H](?:b|#)?(?:maj|min|m|dim|aug|sus|add|M)?\d{0,2}(?:sus[24]|add\d{1,2}|[b#](?:5|9|11|13))*(?:\/[A-H](?:b|#)?)?)$/;
const FILLER_RE = /^(?:\||\|\||:\||\|:|x\d+|\d+x|-|–|\/)$/i;
const NUMBERED_RE = /^\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*[.)\]:-]?\s+(\S.*)$/;
const KEY_LABEL_RE = /^(?:tonart|key)\s*[:=]\s*(.+)$/i;
const TEMPO_LABEL_RE = /^(?:bpm|tempo)\s*[:=]\s*(\d{2,3})/i;
const NOISE_RE = /^(?:seite\s*\d+|page\s*\d+|\d+\s*\/\s*\d+)$/i;

export function isChordToken(token: string): boolean {
  return CHORD_RE.test(token) || FILLER_RE.test(token);
}

export function looksLikeChordLine(line: string): boolean {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length || tokens.length > 24) return false;
  const hits = tokens.filter(isChordToken).length;
  return hits / tokens.length >= 0.6 && tokens.some((t) => CHORD_RE.test(t));
}

/** Zerlegt eine Tabellenzeile in Spalten — Tab, Pipe oder mehrere Leerzeichen. */
function splitColumns(line: string): string[] | null {
  if (line.includes('\t')) {
    const cols = line.split('\t').map((c) => c.trim());
    return cols.filter(Boolean).length >= 2 ? cols : null;
  }
  // Mehrere Leerzeichen zuerst: '| ' steht in Akkorden fuer Taktstriche.
  if (/\S {3,}\S/.test(line)) return line.split(/ {3,}/).map((c) => c.trim());
  if ((line.match(/\|/g)?.length ?? 0) >= 2 && !looksLikeChordLine(line)) {
    const cols = line
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((c) => c.trim());
    if (cols.filter(Boolean).length >= 2) return cols;
  }
  return null;
}

function stripNumber(text: string): string {
  return text.replace(/^\s*\d{1,3}(?:[.,]\d{1,2})?\s*[.)\]:-]?\s*/, '').trim();
}

/** Trennt "Long Train Runnin' G" in Titel und Akkorde. */
function splitTitleAndChords(text: string): { title: string; chords: string } {
  const dash = text.match(/^(.{2,}?)\s+[–—-]\s+(.+)$/);
  if (dash && looksLikeChordLine(dash[2])) {
    return { title: dash[1].trim(), chords: dash[2].trim() };
  }
  const tokens = text.split(/\s+/).filter(Boolean);
  let cut = tokens.length;
  while (cut > 1 && isChordToken(tokens[cut - 1])) cut--;
  const trailing = tokens.slice(cut);
  if (trailing.length && trailing.some((t) => CHORD_RE.test(t)) && cut >= 1) {
    return { title: tokens.slice(0, cut).join(' '), chords: trailing.join(' ') };
  }
  return { title: text.trim(), chords: '' };
}

function push(target: string, line: string): string {
  return target ? `${target}\n${line}` : line;
}

/**
 * Erkennt Setlisten aus Freitext: nummerierte Listen, Tabellen (Tab/Pipe/Spalten)
 * und Bloecke, die durch Leerzeilen getrennt sind.
 */
export function parseSetlistText(input: string): ParseResult {
  const lines = input.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').split('\n');
  // Gibt es ueberhaupt eine Struktur (Nummern oder Spalten)? Sonst gleich
  // absatzweise lesen, sonst frisst die Namenserkennung den ersten Titel.
  const structured = lines.some((l) => {
    const t = l.trim();
    if (!t) return false;
    return NUMBERED_RE.test(t) || (splitColumns(l.trimEnd())?.length ?? 0) >= 2;
  });
  const songs: ParsedSong[] = [];
  let current: ParsedSong | null = null;
  let name: string | null = null;
  let tableMode = false;
  let colMap: { title: number; chords: number; notes: number[] } | null = null;
  let sawNumbered = false;

  const begin = (title: string, chords = '', notes = ''): ParsedSong => {
    const song: ParsedSong = {
      title: title.trim(),
      key: '',
      chords: chords.trim(),
      notes: notes.trim(),
    };
    songs.push(song);
    return song;
  };

  for (const raw of structured ? lines : []) {
    const line = raw.trim();
    if (!line || NOISE_RE.test(line)) continue;

    const cols = splitColumns(raw.trimEnd());

    // Kopfzeile einer Tabelle: Song | Akkorde | Sound
    if (!tableMode && cols && cols.length >= 2) {
      const lower = cols.map((c) => c.toLowerCase());
      const t = lower.findIndex((c) => /^(song|titel|title|nummer|stueck|stück)$/.test(c));
      const c = lower.findIndex((x) => /akkord|chord|tonart|key/.test(x));
      if (t >= 0 && c >= 0) {
        tableMode = true;
        colMap = {
          title: t,
          chords: c,
          notes: cols.map((_, i) => i).filter((i) => i !== t && i !== c),
        };
        continue;
      }
    }

    const numbered = NUMBERED_RE.exec(cols ? cols[0] || line : line);

    if (cols && cols.length >= 2 && (tableMode || numbered || !current)) {
      const map = colMap ?? { title: 0, chords: 1, notes: cols.map((_, i) => i).slice(2) };
      const title = stripNumber(cols[map.title] ?? '');
      const chords = cols[map.chords] ?? '';
      const notes = map.notes
        .map((i) => cols[i])
        .filter((v) => v && v.trim())
        .join('\n');
      if (title || chords) {
        current = begin(title || '(ohne Titel)', chords, notes);
        if (numbered) sawNumbered = true;
        continue;
      }
    }

    if (numbered) {
      sawNumbered = true;
      const rest = numbered[2];
      const split = splitTitleAndChords(rest);
      current = begin(split.title, split.chords);
      continue;
    }

    if (!current) {
      // Erste Zeile vor dem ersten Song: als Listenname merken.
      if (!name && !songs.length && line.length <= 60) {
        name = line;
        continue;
      }
      current = begin(line);
      continue;
    }

    const keyLabel = KEY_LABEL_RE.exec(line);
    if (keyLabel) {
      current.key = keyLabel[1].trim();
      continue;
    }
    const tempoLabel = TEMPO_LABEL_RE.exec(line);
    if (tempoLabel) {
      current.notes = push(current.notes, `Tempo ${tempoLabel[1]} BPM`);
      continue;
    }
    if (looksLikeChordLine(line)) {
      current.chords = push(current.chords, line);
    } else {
      current.notes = push(current.notes, line);
    }
  }

  // Ohne Nummerierung und ohne Tabelle: Bloecke nach Leerzeilen nachziehen.
  if (!songs.length) {
    const blocks = input.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
    for (const block of blocks) {
      const [first, ...rest] = block.split('\n');
      const split = splitTitleAndChords(first);
      songs.push({
        title: split.title,
        key: '',
        chords: [split.chords, ...rest.filter(looksLikeChordLine)].filter(Boolean).join('\n'),
        notes: rest.filter((l) => !looksLikeChordLine(l)).join('\n'),
      });
    }
  }

  for (const s of songs) {
    if (!s.key) {
      const first = s.chords.split(/\s+/).find((t) => CHORD_RE.test(t));
      if (first) s.key = first;
    }
  }

  const strategy = tableMode
    ? 'Tabelle mit Spaltenüberschriften erkannt'
    : sawNumbered
      ? 'Nummerierte Liste erkannt'
      : 'Absätze als einzelne Songs gelesen';

  return { name, songs: songs.filter((s) => s.title || s.chords || s.notes), strategy };
}
