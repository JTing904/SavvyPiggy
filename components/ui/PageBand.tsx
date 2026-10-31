import React from 'react';
import { useT } from '../../contexts/LanguageContext';
import { Icon } from './Icon';

interface PageBandProps {
  title?: React.ReactNode;
  /** Shows the back arrow. */
  onBack?: () => void;
  /** Shows a close cross instead, for a page that holds one job. */
  onClose?: () => void;
  /** The right end of the title row. */
  trailing?: React.ReactNode;
  /** Extra space under the content, for the card that rides up over the band. */
  overlap?: 0 | 12 | 16 | 20 | 24;
  children?: React.ReactNode;
}

const OVERLAP: Record<NonNullable<PageBandProps['overlap']>, string> = {
  0: 'pb-4',
  12: 'pb-12',
  16: 'pb-16',
  20: 'pb-20',
  24: 'pb-24',
};

/** The navy block every page opens with: title on top, the one figure that matters under it. */
export const PageBand: React.FC<PageBandProps> = ({ title, onBack, onClose, trailing, overlap = 0, children }) => {
  const t = useT();
  return (
    <header className={`relative isolate safe-pt bg-band px-5 font-figtree text-band-fg before:absolute before:inset-y-0 before:left-1/2 before:-z-10 before:w-screen before:-translate-x-1/2 before:bg-band ${OVERLAP[overlap]}`}>
      <div className="flex min-h-14 items-center justify-between gap-2 pt-2">
        <div className="flex min-w-0 items-center gap-1">
          {(onBack || onClose) && (
            <button
              type="button"
              onClick={onBack ?? onClose}
              aria-label={onBack ? t.common.back : t.ui.close}
              className="-ml-3 grid size-11 shrink-0 place-items-center active:opacity-70"
            >
              <Icon name={onBack ? 'back' : 'close'} size={22} strokeWidth={2.2} />
            </button>
          )}
          {title && <h1 className="min-w-0 truncate text-[18px] font-bold">{title}</h1>}
        </div>
        {trailing}
      </div>
      {children}
    </header>
  );
};

/** The band's caption over its figure. */
export const BandLabel: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <p className={`text-[13.5px] font-semibold text-band-sub ${className ?? ''}`}>{children}</p>
);
