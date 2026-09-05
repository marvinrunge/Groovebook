import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { Functions } from 'firebase/functions';
import type { FirebaseStorage } from 'firebase/storage';
import { environment } from '../../environments/environment';

/**
 * Firebase wird erst geladen, wenn es wirklich gebraucht wird.
 * Ohne Konfiguration in environment.ts wird nichts nachgeladen —
 * die App bleibt eine reine Offline-App.
 */

export interface FirebaseBundle {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  functions: Functions;
  storage: FirebaseStorage;
}

let bundle: Promise<FirebaseBundle> | null = null;

export function isFirebaseConfigured(): boolean {
  const c = environment.firebase;
  return Boolean(c.apiKey && c.projectId && c.appId);
}

export function getFirebase(): Promise<FirebaseBundle> {
  if (!isFirebaseConfigured()) {
    return Promise.reject(new Error('Firebase ist nicht konfiguriert.'));
  }
  bundle ??= (async () => {
    const [{ initializeApp, getApps, getApp }, authMod, storeMod, fnMod, storageMod] =
      await Promise.all([
        import('firebase/app'),
        import('firebase/auth'),
        import('firebase/firestore'),
        import('firebase/functions'),
        import('firebase/storage'),
      ]);

    const app = getApps().length ? getApp() : initializeApp(environment.firebase);
    const auth = authMod.getAuth(app);
    await authMod.setPersistence(auth, authMod.browserLocalPersistence).catch(() => void 0);

    // Offline-Cache: die App bleibt im Funkloch auf der Buehne benutzbar.
    let db: Firestore;
    try {
      db = storeMod.initializeFirestore(app, {
        localCache: storeMod.persistentLocalCache({
          tabManager: storeMod.persistentMultipleTabManager(),
        }),
      });
    } catch {
      db = storeMod.getFirestore(app);
    }

    const functions = fnMod.getFunctions(app, environment.functionsRegion);
    const storage = storageMod.getStorage(app);

    if (environment.useEmulators && location.hostname === 'localhost') {
      authMod.connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
      storeMod.connectFirestoreEmulator(db, 'localhost', 8080);
      fnMod.connectFunctionsEmulator(functions, 'localhost', 5001);
      storageMod.connectStorageEmulator(storage, 'localhost', 9199);
    }

    return { app, auth, db, functions, storage };
  })();
  return bundle;
}

/** Ruft eine Callable Function auf; wirft, wenn Firebase nicht eingerichtet ist. */
export async function callFunction<Req, Res>(name: string, payload: Req): Promise<Res> {
  const { functions } = await getFirebase();
  const { httpsCallable } = await import('firebase/functions');
  const fn = httpsCallable<Req, Res>(functions, name);
  const result = await fn(payload);
  return result.data;
}
