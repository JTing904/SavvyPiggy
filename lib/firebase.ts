import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, connectAuthEmulator } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';

const env = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/** False until every VITE_FIREBASE_* value is present in .env.local. */
export const isFirebaseConfigured = Object.values(env).every(
  (v) => typeof v === 'string' && v.length > 0
);

/**
 * Cloud Storage needs the project on the paid Blaze plan, so it is off by
 * default. Flip VITE_ENABLE_STORAGE to true once Storage exists in the console
 * and `npm run deploy:rules:storage` has run — goal image uploads turn on then.
 */
export const isStorageEnabled = import.meta.env.VITE_ENABLE_STORAGE === 'true';

// Placeholders keep initializeApp from throwing before setup is done; App.tsx
// shows <SetupNotice /> instead of anything that would actually call Firebase.
const firebaseConfig = {
  apiKey: env.apiKey || 'not-configured',
  authDomain: env.authDomain || 'not-configured.firebaseapp.com',
  projectId: env.projectId || 'not-configured',
  storageBucket: env.storageBucket || 'not-configured.firebasestorage.app',
  messagingSenderId: env.messagingSenderId || '0',
  appId: env.appId || 'not-configured',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
/**
 * Firestore with a cache that survives the app being closed.
 *
 * Without it the ledger lived in memory only: a cold start was blank until
 * the network answered, a deposit made offline was queued in RAM and lost the
 * moment the app was killed, and every open re-read every kept record from
 * the server. That last one matters most — a free project allows fifty
 * thousand reads a day, and the whole retention system exists to protect it.
 * With a disk cache the listeners start from what is already on the phone and
 * the server only sends what changed.
 *
 * The tab manager is for the browser build; on the phone there is only ever
 * one, and it costs nothing to be right about both.
 */
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

// Opt-in local emulators: set VITE_USE_FIREBASE_EMULATOR=true in .env.local
if (isFirebaseConfigured && import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
}
