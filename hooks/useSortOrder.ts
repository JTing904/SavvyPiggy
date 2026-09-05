import { useCallback, useState } from 'react';
import { DEFAULT_ORDER, SORT_OPTIONS, type SortOrder } from '../services/sorting';

const isOrder = (v: unknown): v is SortOrder =>
  typeof v === 'object' &&
  v !== null &&
  SORT_OPTIONS.some((o) => o.key === (v as SortOrder).key) &&
  ((v as SortOrder).dir === 'asc' || (v as SortOrder).dir === 'desc');

/**
 * The chosen ordering for one list, remembered on this device only. It is a
 * viewing preference, not data, so it never touches Firestore.
 */
export const useSortOrder = (storageKey: string): [SortOrder, (next: SortOrder) => void] => {
  const [order, setOrder] = useState<SortOrder>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : null;
      return isOrder(parsed) ? parsed : DEFAULT_ORDER;
    } catch {
      return DEFAULT_ORDER;
    }
  });

  const update = useCallback(
    (next: SortOrder) => {
      setOrder(next);
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Storage may be unavailable; the choice still applies for this session.
      }
    },
    [storageKey]
  );

  return [order, update];
};
