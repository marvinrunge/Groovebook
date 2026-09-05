import { Setlist, emptySetlist, emptySong } from './models';

/**
 * Startdaten aus dem oeffentlich sichtbaren Anfang des Google-Docs
 * "Groove Max Light" (Spalten: Song | Akkorde | Sound).
 * Der Rest des Dokuments ist nur mit Login lesbar — dafuer gibt es den Import.
 */
export function seedSetlist(): Setlist {
  const list = emptySetlist('Groove Max Light');
  list.venue = '';
  list.songs = [
    { title: 'Bad Girls', key: 'D', chords: 'D  G D  C  C D  C  Bb', notes: 'Sound: clean' },
    { title: 'Lost in Music', key: 'D', chords: 'D', notes: '' },
    { title: 'Billie Jean', key: 'F#m', chords: 'F#m', notes: 'Ende: Akzente des Gesangs' },
    {
      title: 'I Wish / Wild Wild West',
      key: 'Eb',
      chords: 'Eb',
      notes: 'Ende: Wild Wild West mit Eb',
    },
    { title: 'Long Train Runnin’', key: 'G', chords: 'G', notes: '' },
    {
      title: 'Let’s Groove',
      key: 'Em',
      chords: 'Em  G  A  G | F#  B',
      notes: 'Intro: Drums + Keys',
    },
  ].map((s) => emptySong(s));
  return list;
}
