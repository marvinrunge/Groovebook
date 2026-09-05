const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const INDEX: Record<string, number> = {};
SHARP.forEach((n, i) => (INDEX[n] = i));
FLAT.forEach((n, i) => (INDEX[n] = i));
INDEX['H'] = 11;
INDEX['Hb'] = 10;

const ROOT_RE =
  /\b([A-H])(b|#)?((?:maj|min|m|dim|aug|sus|add|M)?[\d#b/A-H]*)(?![a-zA-Z])/g;

/**
 * Verschiebt alle Akkorde um n Halbtoene. Nur fuer die Anzeige —
 * gespeichert wird immer das Original.
 */
export function transpose(text: string, steps: number): string {
  if (!steps) return text;
  const useFlats = /b(?![a-z])/.test(text) && !/#/.test(text);
  return text.replace(ROOT_RE, (match, letter: string, accidental = '', rest = '') => {
    const base = INDEX[letter + (accidental || '')];
    if (base === undefined) return match;
    const next = (((base + steps) % 12) + 12) % 12;
    const name = useFlats ? FLAT[next] : SHARP[next];
    return name + rest;
  });
}

export function stepLabel(steps: number): string {
  return steps === 0 ? '±0' : steps > 0 ? `+${steps}` : `${steps}`;
}
