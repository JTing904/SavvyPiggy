import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
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
export const db = getFirestore(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

// Opt-in local emulators: set VITE_USE_FIREBASE_EMULATOR=true in .env.local
if (isFirebaseConfigured && import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
}
