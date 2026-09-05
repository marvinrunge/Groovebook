/**
 * Liest Text aus einer .docx-Datei — direkt im Browser, ohne Bibliothek
 * und ohne Server. Damit funktioniert der Import auch ohne Firebase:
 * Google Docs -> Datei -> Herunterladen -> Word (.docx) -> hier reinziehen.
 *
 * Tabellenzellen werden zu Tabs, Zeilen zu Zeilenumbruechen. Genau das
 * versteht der Parser in parser.ts als Spalten.
 */

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;

interface ZipEntry {
  name: string;
  method: number;
  offset: number;
  compressedSize: number;
}

function readEntries(view: DataView): ZipEntry[] {
  const len = view.byteLength;
  let eocd = -1;
  for (let i = len - 22; i >= Math.max(0, len - 66000); i--) {
    if (view.getUint32(i, true) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Keine gültige ZIP-Struktur (ist das wirklich eine .docx?).');

  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];

  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== SIG_CENTRAL) break;
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const offset = view.getUint32(p + 42, true);
    const name = decoder.decode(new Uint8Array(view.buffer, view.byteOffset + p + 46, nameLen));
    entries.push({ name, method, offset, compressedSize });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function inflate(bytes: Uint8Array, method: number): Promise<Uint8Array> {
  if (method === 0) return bytes;
  if (method !== 8) throw new Error(`Unbekannte Komprimierung (${method}).`);
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Dieser Browser kann .docx nicht direkt entpacken. Bitte Text einfügen.');
  }
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readFile(buffer: ArrayBuffer, wanted: string): Promise<string> {
  const view = new DataView(buffer);
  const entry = readEntries(view).find((e) => e.name === wanted);
  if (!entry) throw new Error(`${wanted} nicht gefunden.`);

  const nameLen = view.getUint16(entry.offset + 26, true);
  const extraLen = view.getUint16(entry.offset + 28, true);
  const start = entry.offset + 30 + nameLen + extraLen;
  const size = entry.compressedSize || buffer.byteLength - start;
  const raw = new Uint8Array(buffer, start, size);
  return new TextDecoder().decode(await inflate(raw, entry.method));
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&nbsp;': ' ',
};

export function wordXmlToText(xml: string): string {
  const BR = '\u2028';
  let s = xml
    .replace(/<w:tab\b[^>]*\/>/g, '\t')
    .replace(/<w:br\b[^>]*\/>/g, BR)
    .replace(/<\/w:p>/g, BR)
    .replace(/<\/w:tc>/g, '\t')
    .replace(/<\/w:tr>/g, '\n')
    .replace(/<[^>]+>/g, '');

  s = s.replace(/&[a-z]+;|&#\d+;/gi, (m) =>
    ENTITIES[m.toLowerCase()] ?? (m.startsWith('&#') ? String.fromCharCode(+m.slice(2, -1)) : m),
  );

  return s
    .split('\n')
    .map((row) =>
      row.includes('\t')
        ? // Tabellenzeile: Zellen bleiben durch Tabs getrennt,
          // mehrere Absaetze in einer Zelle werden zu einer Zeile.
          row
            .split('\t')
            .map((cell) => cell.split(BR).map((x) => x.trim()).filter(Boolean).join(' '))
            .join('\t')
            .replace(/\t+$/, '')
        : row.split(BR).map((x) => x.trimEnd()).join('\n'),
    )
    .join('\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function docxToText(file: File | ArrayBuffer): Promise<string> {
  const buffer = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  return wordXmlToText(await readFile(buffer, 'word/document.xml'));
}
