import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Activity } from '../types';
import type { TradeDraft } from '../components/TradeSheet';
import type { OlderStatus } from '../services/olderLedger';
import { findTradeActivity } from '../services/ledgerArchive';

/**
 * The History row a trade being corrected wrote, when it is older than the
 * loaded ledger.
 *
 * Correcting or deleting a trade undoes what its row says moved, so the sheet
 * must not open without it: a buy would be undone by its total instead of what
 * was really paid, and a split sale refused. Only rows from before the kept
 * window count as gone, exactly as when the whole window was listened to.
 * One read, and only for a goal- or split-paid trade whose row is not loaded.
 */
export const useTradeRow = (
  uid: string | undefined,
  draft: TradeDraft | null,
  activities: Activity[],
  keptFrom: Date
): { status: OlderStatus; activities: Activity[]; retry: () => void } => {
  const trade = draft?.mode === 'edit' ? draft.trade : null;
  const money = trade?.money;
  const linked = !!trade && (money?.mode === 'goal' || money?.mode === 'split');
  const loaded =
    linked &&
    activities.some(
      (a) => (!!money && 'activityId' in money && a.id === money.activityId) || a.tradeId === trade!.id
    );
  const wanted = linked && !loaded ? trade!.id : null;

  const [found, setFound] = useState<{ id: string; row: Activity | null; failed: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const kept = keptFrom.toISOString();

  useEffect(() => {
    // Forgotten once the sheet closes: kept, reopening the same trade showed the
    // sheet, dropped it to loading while the row was read again, then showed it again.
    if (!wanted) setFound(null);
    if (!uid || !wanted || !trade) return;
    let live = true;
    setFound(null);
    findTradeActivity(uid, trade)
      .then((row) => {
        if (live) setFound({ id: wanted, row: row && row.date >= kept ? row : null, failed: false });
      })
      .catch(() => {
        if (live) setFound({ id: wanted, row: null, failed: true });
      });
    return () => {
      live = false;
    };
  }, [uid, wanted, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  const row = wanted && found?.id === wanted ? found : null;
  const withRow = useMemo(
    () => (row?.row && !activities.some((a) => a.id === row.row!.id) ? [row.row, ...activities] : activities),
    [row, activities]
  );

  if (!wanted) return { status: 'ready', activities, retry };
  if (!row) return { status: 'loading', activities, retry };
  if (row.failed) return { status: 'failed', activities, retry };
  return { status: 'ready', activities: withRow, retry };
};
