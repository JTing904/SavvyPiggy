/**
 * A delete that waits a few seconds so it can be taken back.
 *
 * The row is hidden at once and only really deleted when the time is up, so an
 * undo costs nothing: no write was made and nothing has to be put back. Only
 * one delete waits at a time; starting another commits the first straight away.
 * Leaving the page (hidden, closed, signed out) must call flush, or the delete
 * would be lost.
 *
 * Timers are injected so the rules can be tested without waiting.
 */

export interface UndoQueueOptions<T extends { id: string }> {
  /** Defaults to 5 seconds. */
  delayMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /** The real delete. A rejection puts the row back through onRestore. */
  commit: (item: T) => Promise<void>;
  /** Deleting failed: the row is to be shown again. (An undo needs no call; the row just stops being hidden.) */
  onRestore: (item: T, error: unknown) => void;
  /** Whatever is hidden or waiting changed; lets a screen re-render. */
  onChange?: () => void;
}

export interface UndoQueue<T extends { id: string }> {
  push: (item: T, label: string) => void;
  /** True when a waiting delete was taken back. */
  undo: () => boolean;
  /** Commits whatever is waiting now, and resolves once every commit has finished. */
  flush: () => Promise<void>;
  /** The delete still waiting, which can still be undone. */
  pending: () => T | null;
  /** What the toast says about it. */
  pendingLabel: () => string | null;
  /** Rows to leave out of the list: the one waiting and any commit still under way. */
  hiddenIds: () => ReadonlySet<string>;
}

export const createUndoQueue = <T extends { id: string }>({
  delayMs = 5000,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  commit,
  onRestore,
  onChange,
}: UndoQueueOptions<T>): UndoQueue<T> => {
  let waiting: { item: T; label: string; timer: unknown } | null = null;
  const inFlight = new Map<string, Promise<void>>();

  const run = (item: T) => {
    let started: Promise<void>;
    try {
      started = commit(item);
    } catch (error) {
      started = Promise.reject(error);
    }
    const done = started
      .then(
        () => undefined,
        (error) => {
          inFlight.delete(item.id);
          onRestore(item, error);
        }
      )
      .then(() => {
        inFlight.delete(item.id);
        onChange?.();
      });
    inFlight.set(item.id, done);
  };

  const release = () => {
    const entry = waiting;
    if (!entry) return;
    waiting = null;
    clearTimer(entry.timer);
    run(entry.item);
    onChange?.();
  };

  return {
    push(item, label) {
      release();
      const entry = { item, label, timer: null as unknown };
      entry.timer = setTimer(() => {
        if (waiting === entry) release();
      }, delayMs);
      waiting = entry;
      onChange?.();
    },
    undo() {
      const entry = waiting;
      if (!entry) return false;
      waiting = null;
      clearTimer(entry.timer);
      onChange?.();
      return true;
    },
    async flush() {
      release();
      await Promise.all([...inFlight.values()]);
    },
    pending: () => waiting?.item ?? null,
    pendingLabel: () => waiting?.label ?? null,
    hiddenIds: () => new Set([...(waiting ? [waiting.item.id] : []), ...inFlight.keys()]),
  };
};
