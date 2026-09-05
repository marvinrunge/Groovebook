import { Injectable, signal } from '@angular/core';
import { getFirebase, isFirebaseConfigured } from './firebase';

export interface SessionUser {
  uid: string;
  name: string;
  email: string;
  photo: string | null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  /** null = nicht angemeldet, undefined = Status noch unbekannt. */
  readonly user = signal<SessionUser | null | undefined>(
    isFirebaseConfigured() ? undefined : null,
  );
  readonly available = isFirebaseConfigured();
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    if (this.available) void this.listen();
  }

  private async listen(): Promise<void> {
    try {
      const { auth } = await getFirebase();
      const { onAuthStateChanged, getRedirectResult } = await import('firebase/auth');
      await getRedirectResult(auth).catch(() => null);
      onAuthStateChanged(auth, (u) => {
        this.user.set(
          u
            ? {
                uid: u.uid,
                name: u.displayName ?? u.email ?? 'Angemeldet',
                email: u.email ?? '',
                photo: u.photoURL,
              }
            : null,
        );
      });
    } catch {
      this.user.set(null);
    }
  }

  async signInWithGoogle(): Promise<void> {
    if (!this.available) {
      this.error.set('Firebase ist noch nicht konfiguriert — die App speichert lokal.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const { auth } = await getFirebase();
      const { GoogleAuthProvider, signInWithPopup, signInWithRedirect } = await import(
        'firebase/auth'
      );
      const provider = new GoogleAuthProvider();
      // Zugriff auf Google Docs/Drive fuer den Direktimport — optional,
      // der Nutzer kann das im Consent-Dialog auch ablehnen.
      provider.addScope('https://www.googleapis.com/auth/drive.readonly');
      provider.setCustomParameters({ prompt: 'select_account' });
      try {
        const cred = await signInWithPopup(auth, provider);
        const token = GoogleAuthProvider.credentialFromResult(cred)?.accessToken;
        if (token) sessionStorage.setItem('gm.googleToken', token);
      } catch (popupError: unknown) {
        const code = (popupError as { code?: string }).code ?? '';
        if (code.includes('popup')) {
          await signInWithRedirect(auth, provider);
          return;
        }
        throw popupError;
      }
    } catch (e) {
      this.error.set(readableError(e));
    } finally {
      this.busy.set(false);
    }
  }

  async signOut(): Promise<void> {
    if (!this.available) return;
    const { auth } = await getFirebase();
    const { signOut } = await import('firebase/auth');
    sessionStorage.removeItem('gm.googleToken');
    await signOut(auth);
  }

  /** OAuth-Token fuer den Google-Docs-Import, falls im Login mitgegeben. */
  googleAccessToken(): string | null {
    return sessionStorage.getItem('gm.googleToken');
  }
}

export function readableError(e: unknown): string {
  const code = (e as { code?: string }).code;
  switch (code) {
    case 'auth/popup-closed-by-user':
      return 'Login abgebrochen.';
    case 'auth/network-request-failed':
      return 'Keine Verbindung. Die Daten bleiben lokal gespeichert.';
    case 'auth/unauthorized-domain':
      return 'Diese Domain ist in Firebase Auth noch nicht freigegeben.';
    default:
      return (e as Error)?.message ?? 'Unbekannter Fehler.';
  }
}
