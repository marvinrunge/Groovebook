import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { setGlobalOptions } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { ParsedSong, parseSetlistText } from './parser';

admin.initializeApp();
setGlobalOptions({ region: 'europe-west3', maxInstances: 10 });

/**
 * Schluessel fuer die KI-gestuetzte Analyse. Wird erst gebraucht, wenn du ihn
 * hinterlegst:  firebase functions:secrets:set LLM_API_KEY
 * Ohne Schluessel laeuft alles ueber die Regel-Erkennung in parser.ts.
 */
const LLM_API_KEY = defineSecret('LLM_API_KEY');

interface ParseDocRequest {
  fileName: string;
  contentType?: string;
  /** Base64, ohne data:-Praefix. */
  data: string;
}

interface ParseDocResponse {
  text: string;
  songs: ParsedSong[];
  source: 'regeln' | 'ki';
}

function requireUser(req: CallableRequest): string {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Bitte zuerst anmelden.');
  return uid;
}

async function extractText(fileName: string, buffer: Buffer): Promise<string> {
  const name = fileName.toLowerCase();
  if (name.endsWith('.pdf')) {
    const pdfParse = (await import('pdf-parse')).default;
    const parsed = await pdfParse(buffer);
    return parsed.text;
  }
  if (name.endsWith('.docx')) {
    const mammoth = await import('mammoth');
    // Tabellen als HTML holen, damit Spalten erhalten bleiben.
    const html = await mammoth.convertToHtml({ buffer });
    return htmlTableToText(html.value);
  }
  return buffer.toString('utf8');
}

/** <td>-Zellen zu Tabs, <tr> zu Zeilen — das versteht der Parser als Spalten. */
export function htmlTableToText(html: string): string {
  return html
    .replace(/<\/t[dh]>\s*/gi, '\t')
    .replace(/<\/tr>\s*/gi, '\n')
    .replace(/<\/(p|div|li|h\d)>\s*/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(+code))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Optionale KI-Analyse. Erwartet eine Anthropic-kompatible Messages-API.
 * Bekommst du kein Ergebnis zurueck, greift automatisch die Regel-Erkennung.
 */
async function structureWithLlm(text: string, apiKey: string): Promise<ParsedSong[] | null> {
  const prompt = [
    'Du bekommst den Text einer Setlist einer Live-Band.',
    'Gib ausschliesslich ein JSON-Array zurueck, ohne Markdown und ohne Vorrede.',
    'Jedes Element: {"title": string, "key": string, "chords": string, "notes": string}.',
    'title = Songtitel ohne Nummer. chords = Akkorde und Ablauf.',
    'notes = Sound, Einsaetze, Endings. Fehlt etwas, nimm einen leeren String.',
    '',
    text.slice(0, 60000),
  ].join('\n');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) return null;
  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const raw = (data.content ?? [])
    .map((block) => (block.type === 'text' ? (block.text ?? '') : ''))
    .join('')
    .replace(/```json|```/g, '')
    .trim();
  try {
    const parsed = JSON.parse(raw) as ParsedSong[];
    return Array.isArray(parsed) && parsed.length ? parsed : null;
  } catch {
    return null;
  }
}

/** Datei hochladen, Text ziehen, Songs erkennen. */
export const parseDocument = onCall(
  { secrets: [LLM_API_KEY], memory: '512MiB', timeoutSeconds: 120 },
  async (req: CallableRequest<ParseDocRequest>): Promise<ParseDocResponse> => {
    requireUser(req);
    const { fileName, data } = req.data ?? ({} as ParseDocRequest);
    if (!data) throw new HttpsError('invalid-argument', 'Keine Datei erhalten.');

    const buffer = Buffer.from(data, 'base64');
    if (buffer.byteLength > 12 * 1024 * 1024) {
      throw new HttpsError('invalid-argument', 'Die Datei ist grösser als 12 MB.');
    }

    const text = await extractText(fileName ?? 'datei.txt', buffer);
    const key = LLM_API_KEY.value();
    if (key) {
      const songs = await structureWithLlm(text, key);
      if (songs) return { text, songs, source: 'ki' };
    }
    return { text, songs: parseSetlistText(text).songs, source: 'regeln' };
  },
);

/**
 * Liest ein Google Doc direkt. Der Client schickt das OAuth-Token mit,
 * das beim Google-Login mit drive.readonly-Scope ausgegeben wurde.
 */
export const importGoogleDoc = onCall(
  { secrets: [LLM_API_KEY], timeoutSeconds: 120 },
  async (
    req: CallableRequest<{ docId: string; accessToken: string }>,
  ): Promise<ParseDocResponse> => {
    requireUser(req);
    const { docId, accessToken } = req.data ?? { docId: '', accessToken: '' };
    if (!docId || !accessToken) {
      throw new HttpsError('invalid-argument', 'Dokument-ID und Zugriffstoken werden gebraucht.');
    }

    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(docId)}/export?mimeType=text/html`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) {
      throw new HttpsError('permission-denied', `Google Drive antwortet mit ${res.status}.`);
    }

    const text = htmlTableToText(await res.text());
    const key = LLM_API_KEY.value();
    if (key) {
      const songs = await structureWithLlm(text, key);
      if (songs) return { text, songs, source: 'ki' };
    }
    return { text, songs: parseSetlistText(text).songs, source: 'regeln' };
  },
);

/** Kleiner Selbsttest fuer das Deployment. */
export const ping = onCall(async () => ({ ok: true, time: Date.now() }));
