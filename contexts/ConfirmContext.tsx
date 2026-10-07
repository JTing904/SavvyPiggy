import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Button } from '../components/ui/Button';
import { Sheet } from '../components/ui/Sheet';
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
  /** Tailwind classes for the icon chip, e.g. 'bg-peach text-ink'. */
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

  const danger = request?.tone === 'danger';

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {request && (
        // Above z-50, which every other sheet in the app uses. The sheet registers
        // the back button itself, and registers after whatever asked the question,
        // so back lands here first and cancels.
        <Sheet
          z={60}
          title={request.title}
          onClose={() => settle(false)}
          footer={
            <div className="flex gap-3">
              <Button variant="ghost" full={false} className="flex-1" onClick={() => settle(false)}>
                {request.cancelLabel ?? t.common.cancel}
              </Button>
              <Button variant={danger ? 'danger' : 'primary'} full={false} className="flex-1" onClick={() => settle(true)}>
                {request.confirmLabel ?? t.common.confirm}
              </Button>
            </div>
          }
        >
          {request.body && <p className="px-1 text-[14px] font-medium leading-relaxed text-mute">{request.body}</p>}

          {request.detail && (
            <div className="mt-4 flex items-center gap-3 rounded-3xl bg-card p-4">
              <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${request.detail.tint ?? 'bg-line/10 text-mute'}`}>
                <span className="material-symbols-rounded" style={{ fontSize: 20 }}>
                  {request.detail.icon}
                </span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold">{request.detail.label}</p>
                {request.detail.meta && <p className="truncate text-[12px] font-medium text-mute">{request.detail.meta}</p>}
              </div>
              {request.detail.amount && <p className={`shrink-0 text-[15px] font-extrabold tabular-nums ${request.detail.amountTint ?? ''}`}>{request.detail.amount}</p>}
            </div>
          )}
        </Sheet>
      )}
    </ConfirmContext.Provider>
  );
};

export const useConfirm = () => {
  const ask = useContext(ConfirmContext);
  if (!ask) throw new Error('useConfirm must be used inside a ConfirmProvider.');
  return ask;
};
