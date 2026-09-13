import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { useBackHandler } from '../hooks/useBackHandler';
import { useT } from './LanguageContext';

/**
 * Asking "are you sure?" without handing the question to Android.
 *
 * Every one of these was `window.confirm` before. That dialog is the system's,
 * not the app's: grey Material chrome and a teal OK in the middle of a black
 * and green app, titled with the WebView's origin, and — the part that
 * actually matters — invisible to the back-button stack in `services/back.ts`,
 * so pressing back did nothing at all. It also blocks the JS thread, which is
 * why the sheet behind it froze.
 *
 * The API is a promise rather than a component so a call site stays one line
 * and an async handler keeps its shape:
 *
 *     if (!(await confirm({ title: '…' }))) return;
 *
 * The look is lifted from the archive sheet in `components/GoalDetail.tsx`,
 * which had already solved this by hand; this is that design promoted to the
 * one place every confirmation now comes from, so it cannot drift.
 */

export interface ConfirmDetail {
  /** Material symbol name. */
  icon: string;
  /** Tailwind classes for the icon chip, e.g. 'bg-amber-500/10 text-amber-400'. */
  tint?: string;
  label: string;
  /** A second line under the label — a time, a counter, a running total. */
  meta?: string;
  /** Already formatted, because only the caller knows how it should read. */
  amount?: string;
  /** Tailwind text colour for the amount. */
  amountTint?: string;
}

export interface ConfirmRequest {
  title: string;
  body?: string;
  /**
   * The thing being acted on, shown as it appears in the app. Money should
   * never leave on a question alone — you should be able to see which row you
   * are about to delete, which is precisely what the system dialog could not
   * show.
   */
  detail?: ConfirmDetail;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'normal';
}

type Ask = (request: ConfirmRequest) => Promise<boolean>;

const ConfirmContext = createContext<Ask | null>(null);

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const t = useT();
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const settle = useCallback((ok: boolean) => {
    // Answer first, then close: the caller's `await` resumes either way, and a
    // promise left hanging would strand an async handler forever.
    resolver.current?.(ok);
    resolver.current = null;
    setRequest(null);
  }, []);

  const ask = useCallback<Ask>((next) => {
    // A second ask while one is open cancels the first rather than replacing
    // it silently, so no caller is left waiting on a sheet nobody can see.
    resolver.current?.(false);
    setRequest(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  // The back stack is LIFO, and this registers when the sheet opens — after
  // whatever sheet asked the question — so back lands here first and cancels.
  useBackHandler(request !== null, () => settle(false));

  const danger = request?.tone === 'danger';

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {request && (
        <div
          /* Above z-50, which every other sheet in the app uses. */
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/85 veil-in"
          onClick={() => settle(false)}
        >
          <div
            className="w-full max-w-md bg-surface rounded-t-[3rem] sm:rounded-[3rem] sm:mb-6 shadow-2xl sheet-rise p-7 safe-pb"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={`size-12 rounded-2xl flex items-center justify-center mb-4 ${
                danger ? 'bg-red-500/10 text-red-400' : 'bg-primary/10 text-primary'
              }`}
            >
              <span className="material-symbols-rounded text-2xl">
                {danger ? 'delete' : 'help'}
              </span>
            </div>

            <h3 className="text-white text-2xl font-black tracking-tight">{request.title}</h3>
            {request.body && (
              <p className="text-slate-400 text-sm font-medium mt-3 leading-relaxed">{request.body}</p>
            )}

            {request.detail && (
              <div className="mt-5 rounded-3xl bg-white/5 p-4 flex items-center gap-3">
                <span
                  className={`size-10 shrink-0 rounded-2xl flex items-center justify-center ${
                    request.detail.tint ?? 'bg-white/5 text-slate-400'
                  }`}
                >
                  <span className="material-symbols-rounded text-xl">{request.detail.icon}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-white text-sm font-black truncate">{request.detail.label}</p>
                  {request.detail.meta && (
                    <p className="text-slate-500 text-[11px] font-bold mt-0.5 truncate">
                      {request.detail.meta}
                    </p>
                  )}
                </div>
                {request.detail.amount && (
                  <p className={`text-[15px] font-black shrink-0 ${request.detail.amountTint ?? 'text-white'}`}>
                    {request.detail.amount}
                  </p>
                )}
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => settle(false)}
                className="flex-1 h-14 rounded-2xl glass text-slate-300 font-black active:scale-95 transition-transform"
              >
                {request.cancelLabel ?? t.common.cancel}
              </button>
              <button
                onClick={() => settle(true)}
                className={`flex-1 h-14 rounded-2xl font-black active:scale-95 transition-transform ${
                  danger ? 'bg-red-500 text-white' : 'bg-primary text-black'
                }`}
              >
                {request.confirmLabel ?? t.common.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
};

export const useConfirm = () => {
  const ask = useContext(ConfirmContext);
  if (!ask) throw new Error('useConfirm must be used inside a ConfirmProvider.');
  return ask;
};
