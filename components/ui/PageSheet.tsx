import React from 'react';
import { useBackHandler } from '../../hooks/useBackHandler';

interface PageSheetProps {
  /** The PageBand on top, with the job's one figure in it. */
  band: React.ReactNode;
  onClose: () => void;
  /** False while money work is in flight: the back gesture waits for it. */
  dismissible?: boolean;
  /** Sits at the foot of the page, under everything else. */
  footer?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * A page that holds one job, opened over whatever is underneath: a sheet's place
 * in the stack (50, so a picker at 60 still lands on top) with a page's look.
 */
export const PageSheet: React.FC<PageSheetProps> = ({ band, onClose, dismissible = true, footer, children }) => {
  useBackHandler(true, () => {
    if (dismissible) onClose();
  });
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 overflow-y-auto bg-page font-figtree text-ink no-scrollbar">
      <div className="mx-auto flex min-h-full max-w-xl flex-col">
        {band}
        <div className="flex flex-1 flex-col gap-2.5 px-4 pt-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}>
          {children}
          {footer && <div className="mt-auto pt-1.5">{footer}</div>}
        </div>
      </div>
    </div>
  );
};
