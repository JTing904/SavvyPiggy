import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { Activity } from '../types';
import { OlderLedger, type OlderStatus } from '../services/olderLedger';
import { loadActivitiesBetween, readActivity } from '../services/ledgerArchive';
import { onActivityRowsChanged } from '../services/ledgerEvents';
import { olderNeed, parseStreakMemory, type StreakMemory } from '../services/ledgerWindow';
import { localKey, readLocal, writeLocal } from '../services/localFlags';

/**
 * What the screens know about how far back the ledger they were given goes,
 * and how to ask for more. `activities` always runs from `loadedFrom` to now.
 */
export interface Ledger {
  /** Where the live listener starts. */
  liveFrom: Date;
  /** Where the kept window starts; nothing older is ever shown. */
  keptFrom: Date;
  /** Where the loaded ledger starts: liveFrom, or earlier once older rows are read. */
  loadedFrom: Date;
  /** Whether everything from `from` is loaded. Null asks for nothing. */
  status: (from: Date | null) => OlderStatus;
  /** Reads everything from `from` (clamped to the kept window), once per session. */
  need: (from: Date | null) => void;
  retry: () => void;
  /** A new object whenever the store behind this is replaced (another account, a new live window). */
  session: object | null;
}

/* -------------------------------------------------------- streak memory */

const streakKey = (uid: string) => localKey('streak', uid);

export const readStreakMemory = (uid: string | undefined): StreakMemory | null =>
  uid ? parseStreakMemory(readLocal(streakKey(uid))) : null;

export const writeStreakMemory = (uid: string, memory: StreakMemory | null) => {
  const next = memory ? JSON.stringify(memory) : null;
  if (readLocal(streakKey(uid)) !== next) writeLocal(streakKey(uid), next);
};

/* ----------------------------------------------------------------- store */

/**
 * The on-demand older ledger for one account, for the session. A new store
 * whenever the account or the live window's start changes, so coverage never
 * has a gap between the two.
 */
export const useOlderLedgerStore = (uid: string | undefined, liveFrom: Date, keptFrom: Date) => {
  const store = useMemo(
    () => (uid ? new OlderLedger(liveFrom, (from, to) => loadActivitiesBetween(uid, from, to)) : null),
    [uid, liveFrom]
  );

  useEffect(() => {
    if (!store || !uid) return;
    const stopRows = onActivityRowsChanged((changes) => {
      for (const change of changes) {
        const known = store.has(change.id);
        // A row not read yet can still belong in the older ledger (a back-dated
        // catch-up deposit), but only once some of it is loaded is it worth a read.
        if (!known && (change.deleted || !store.hasOlder)) continue;
        // An older row changed on this phone: a remembered streak may no longer hold.
        if (known) writeStreakMemory(uid, null);
        if (change.deleted) store.patch(change.id, null);
        else
          void readActivity(uid, change.id, change.server)
            .then((row) => {
              if (store.patch(change.id, row)) writeStreakMemory(uid, null);
            })
            .catch(() => undefined);
      }
    });
    // Coming back online is the moment a failed read is worth trying again.
    const online = () => store.retry();
    window.addEventListener('online', online);
    return () => {
      stopRows();
      window.removeEventListener('online', online);
      // Not closed: StrictMode re-runs this with the same store. A replaced
      // store simply goes unused, and a read still under way lands nowhere.
    };
  }, [store, uid]);

  const noop = useMemo(() => () => () => undefined, []);
  const version = useSyncExternalStore(store?.subscribe ?? noop, store?.getVersion ?? (() => 0));

  const older: Activity[] = useMemo(() => store?.list ?? [], [store, version]); // eslint-disable-line react-hooks/exhaustive-deps

  const ledger: Ledger = useMemo(() => {
    const clamp = (from: Date | null) => olderNeed(from, liveFrom, keptFrom);
    const loadedFrom = store ? store.loadedFrom : liveFrom;
    return {
      liveFrom,
      keptFrom,
      loadedFrom: loadedFrom.getTime() < keptFrom.getTime() ? keptFrom : loadedFrom,
      status: (from) => (store ? store.status(clamp(from)) : 'ready'),
      need: (from) => store?.need(clamp(from)),
      retry: () => store?.retry(),
      session: store,
    };
  }, [store, version, liveFrom, keptFrom]); // eslint-disable-line react-hooks/exhaustive-deps

  return { older, ledger };
};

/** Asks for the ledger from `from` while a screen shows it, and says whether it is there. */
export const useLedgerRange = (ledger: Ledger, from: Date | null): OlderStatus => {
  const ms = from ? from.getTime() : null;
  const { need, session } = ledger;
  useEffect(() => {
    need(ms === null ? null : new Date(ms));
    // The store is in the list: a new account or live window brings a new one, which has read nothing yet.
  }, [ms, ledger.keptFrom.getTime(), session]); // eslint-disable-line react-hooks/exhaustive-deps
  return ledger.status(from);
};
