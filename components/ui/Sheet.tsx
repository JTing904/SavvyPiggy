import React, { useEffect, useId, useRef } from 'react';
import { useBackHandler } from '../../hooks/useBackHandler';
import { useT } from '../../contexts/LanguageContext';
import { Icon } from './Icon';

/**
 * The bottom sheet every redesigned flow opens in. z layers across the app:
 * Sheet 50, Confirm and DateField 60, Toast 65.
 *
 * Closes by the X, the scrim, Escape, the Android back gesture, or by dragging
 * the handle / title area down. Only that top area captures the pointer, so the
 * body scrolls normally (and `overscroll-behavior: contain` keeps a fling from
 * dragging the page behind it). `dismissible={false}` is for a sheet that holds
 * unsaved money work: nothing but its own buttons closes it.
 */
interface SheetProps {
  onClose: () => void;
  title?: string;
  footer?: React.ReactNode;
  /** Stacking order; defaults to 50. */
  z?: number;
  height?: 'auto' | 'tall';
  dismissible?: boolean;
  children: React.ReactNode;
}

const CLOSE_DISTANCE = 96;
const CLOSE_VELOCITY = 0.6; // px per ms
const OUT_MS = 180;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const Sheet: React.FC<SheetProps> = ({ onClose, title, footer, z = 50, height = 'auto', dismissible = true, children }) => {
  const t = useT();
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; lastY: number; lastT: number; velocity: number } | null>(null);
  const closing = useRef(false);

  const requestClose = () => {
    if (dismissible && !closing.current) onClose();
  };
  // Registered once, on mount: the stack is LIFO, so a sheet opened on top of
  // this one takes the back gesture first. The hook reads the latest closure.
  useBackHandler(true, requestClose);

  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const moveTo = (y: number, animate: boolean) => {
    const el = panel.current;
    if (!el) return;
    el.style.transition = animate && !prefersReducedMotion() ? `transform ${OUT_MS}ms ease-out` : 'none';
    el.style.transform = y > 0 ? `translateY(${y}px)` : '';
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dismissible || closing.current) return;
    // The close button is its own target.
    if ((e.target as HTMLElement).closest('button')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, lastY: e.clientY, lastT: e.timeStamp, velocity: 0 };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.velocity = (e.clientY - d.lastY) / dt;
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    moveTo(Math.max(0, e.clientY - d.startY), false);
  };
  const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const dy = Math.max(0, e.clientY - d.startY);
    const cancelled = e.type === 'pointercancel';
    if (!cancelled && (dy > CLOSE_DISTANCE || (dy > 24 && d.velocity > CLOSE_VELOCITY))) {
      closing.current = true;
      moveTo(panel.current?.offsetHeight ?? 600, true);
      if (prefersReducedMotion()) onClose();
      else window.setTimeout(onClose, OUT_MS);
    } else {
      moveTo(0, true);
    }
  };

  return (
    <div
      className="fixed inset-0 font-figtree"
      style={{ zIndex: z }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
    >
      <div className="absolute inset-0 bg-black/50 veil-in" onClick={requestClose} aria-hidden="true" />
      <div
        ref={panel}
        tabIndex={-1}
        className={`sheet-rise absolute inset-x-0 bottom-0 mx-auto flex w-full max-w-md flex-col rounded-t-[32px] bg-sheet text-ink outline-none ${
          height === 'tall' ? 'h-[92dvh]' : 'max-h-[92dvh]'
        }`}
      >
        <div
          className="shrink-0 touch-none select-none px-5 pt-2.5"
          role="group"
          aria-label={t.ui.grabHandle}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
        >
          <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-line/10" aria-hidden="true" />
          <div className="flex min-h-11 items-center justify-between gap-3">
            {title ? (
              <h2 id={titleId} className="min-w-0 flex-1 truncate text-[17px] font-extrabold tracking-tight">
                {title}
              </h2>
            ) : (
              <span className="flex-1" />
            )}
            {dismissible && (
              <button
                type="button"
                onClick={requestClose}
                aria-label={t.ui.close}
                className="-mr-2 grid size-11 shrink-0 place-items-center rounded-full text-mute active:bg-line/10"
              >
                <Icon name="close" size={22} />
              </button>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 no-scrollbar">{children}</div>

        {footer && (
          <div className="shrink-0 px-5 pt-2" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}>
            {footer}
          </div>
        )}
        {!footer && <div className="shrink-0" style={{ height: 'env(safe-area-inset-bottom)' }} />}
      </div>
    </div>
  );
};
