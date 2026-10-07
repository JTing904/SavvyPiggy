import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useT } from './LanguageContext';

/**
 * One line of feedback at the bottom of the screen, above the nav bar.
 *
 *     const toast = useToast();
 *     toast.show({ message: 'Entry deleted', action: { label: 'Undo', run: restore }, onExpire: commitDelete });
 *
 * One toast is visible at a time; the rest wait in a FIFO queue of at most 3.
 * `onExpire` is how a delayed delete commits: it runs exactly once, when the
 * toast times out, is dismissed, is replaced by a newer toast, falls off a full
 * queue, or the provider goes away — and never after the action was taken.
 * A toast that carries an action is replaced the moment another toast arrives
 * (the undo window ends there), so a second delete cannot strand the first.
 */

export type ToastTone = 'info' | 'success' | 'error';

export interface ToastOptions {
  message: string;
  tone?: ToastTone;
  action?: { label: string; run: () => void };
  /** Defaults: error 6 s, a toast with an action (undo) 5 s, otherwise 4 s. */
  durationMs?: number;
  onExpire?: () => void;
}

interface ToastApi {
  show: (options: ToastOptions) => number;
  dismiss: (id: number) => void;
}

interface Item extends ToastOptions {
  id: number;
  tone: ToastTone;
  duration: number;
  /** Set once onExpire has run or the action was taken, so it never runs twice. */
  settled: boolean;
}

const MAX_QUEUED = 3;

const durationFor = (o: ToastOptions) =>
  o.durationMs ?? (o.tone === 'error' ? 6000 : o.action ? 5000 : 4000);

const ToastContext = createContext<ToastApi | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const t = useT();
  const [view, setView] = useState<Item | null>(null);
  const current = useRef<Item | null>(null);
  const queue = useRef<Item[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextId = useRef(1);

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  /** Ends a toast's life. `commit` false is the action path: nothing expires. */
  const settle = (item: Item, commit: boolean) => {
    if (item.settled) return;
    item.settled = true;
    if (!commit) return;
    try {
      item.onExpire?.();
    } catch (error) {
      console.error('Toast onExpire failed', error);
    }
  };

  // Everything below reads refs, never state, so the functions can be built
  // once and a stale closure can never show or expire the wrong toast.
  const api = useRef<{ present: (item: Item) => void; advance: () => void }>({
    present: () => {},
    advance: () => {},
  });
  api.current.present = (item) => {
    current.current = item;
    setView(item);
    clearTimer();
    timer.current = setTimeout(() => {
      if (current.current?.id !== item.id) return;
      settle(item, true);
      api.current.advance();
    }, item.duration);
  };
  api.current.advance = () => {
    clearTimer();
    const next = queue.current.shift();
    if (next) api.current.present(next);
    else {
      current.current = null;
      setView(null);
    }
  };

  const show = useCallback((options: ToastOptions) => {
    const item: Item = {
      ...options,
      id: nextId.current++,
      tone: options.tone ?? 'info',
      duration: durationFor(options),
      settled: false,
    };
    const shown = current.current;
    if (!shown) {
      api.current.present(item);
      return item.id;
    }
    queue.current.push(item);
    while (queue.current.length > MAX_QUEUED) {
      const dropped = queue.current.shift();
      if (dropped) settle(dropped, true);
    }
    if (shown.action) {
      // The undo window closes when anything else needs the space.
      settle(shown, true);
      api.current.advance();
    }
    return item.id;
  }, []);

  const dismiss = useCallback((id: number) => {
    const shown = current.current;
    if (shown && shown.id === id) {
      settle(shown, true);
      api.current.advance();
      return;
    }
    const at = queue.current.findIndex((q) => q.id === id);
    if (at >= 0) settle(queue.current.splice(at, 1)[0], true);
  }, []);

  // Closing the app's root must not drop a delete that was waiting to commit.
  useEffect(
    () => () => {
      clearTimer();
      const pending = [current.current, ...queue.current];
      current.current = null;
      queue.current = [];
      pending.forEach((item) => item && settle(item, true));
    },
    [],
  );

  const takeAction = () => {
    const shown = current.current;
    if (!shown?.action) return;
    settle(shown, false);
    try {
      shown.action.run();
    } finally {
      api.current.advance();
    }
  };

  const value = useMemo(() => ({ show, dismiss }), [show, dismiss]);
  const error = view?.tone === 'error';
  const tint =
    view?.tone === 'error' ? 'bg-neg text-cta-fg' : view?.tone === 'success' ? 'bg-pos text-cta-fg' : 'bg-cta text-cta-fg';

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 z-[65] flex justify-center px-4"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 84px)' }}
      >
        {view && (
          <div
            key={view.id}
            role={error ? 'alert' : 'status'}
            className={`toast-in pointer-events-auto flex w-full max-w-md items-center gap-2 rounded-2xl py-1.5 pl-4 pr-1.5 font-figtree text-sm font-bold ${tint}`}
          >
            <span className="min-h-11 flex-1 break-words py-2.5 leading-snug">
              {view.message || (error ? t.ui.toastError : t.ui.toastDefault)}
            </span>
            {view.action && (
              <button
                type="button"
                onClick={takeAction}
                className="min-h-11 shrink-0 rounded-xl px-4 font-extrabold underline underline-offset-2"
              >
                {view.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside a ToastProvider.');
  return api;
};
