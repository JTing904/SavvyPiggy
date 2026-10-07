import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { APP_VERSION } from './version';
import { buildBackup } from './backupFormat';

/**
 * Everything in the account except receipt photos, read from the server once,
 * for the "export everything" file. Reads each collection whole; that is a few
 * thousand documents at most, once, and only when the person asks.
 */
const COLLECTIONS = ['banks', 'activities', 'schedules', 'bills', 'loans', 'liabilities', 'trades', 'dividendsPaid', 'snapshots', 'netWorth', 'alerts'];
const SETTINGS = ['savings', 'general', 'invest', 'wallet', 'budgets', 'notifications'];

export const readBackup = async (uid: string, now: Date = new Date()) => {
  const collections: Record<string, Array<{ id: string; data: unknown }>> = {};
  for (const name of COLLECTIONS) {
    const snap = await getDocs(collection(db, 'users', uid, name));
    collections[name] = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
  }
  const settings: Record<string, unknown> = {};
  for (const name of SETTINGS) {
    const snap = await getDoc(doc(db, 'users', uid, 'settings', name));
    if (snap.exists()) settings[name] = snap.data();
  }
  return buildBackup({ appVersion: APP_VERSION, exportedAt: now, collections, settings });
};
