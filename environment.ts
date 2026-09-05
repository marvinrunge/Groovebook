/**
 * Firebase-Zugangsdaten.
 *
 * Solange `apiKey` leer ist, laeuft die App komplett lokal:
 * kein Login, keine Netzwerkzugriffe, alles liegt im Browser-Speicher.
 * Sobald du die Werte aus der Firebase-Konsole hier eintraegst
 * (Projekt-Einstellungen > Deine Apps > Web-App > SDK-Konfiguration),
 * erscheint der Google-Login und die Cloud-Synchronisation.
 */
export const environment = {
  production: false,
  firebase: {
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: '',
  },
  /** Region der Cloud Functions. */
  functionsRegion: 'europe-west3',
  /** Emulatoren nutzen, wenn lokal entwickelt wird. */
  useEmulators: false,
};
