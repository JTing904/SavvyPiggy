import React from 'react';
import { Icon } from './Icon';
import { useT } from '../../contexts/LanguageContext';

/** A tonal block (goal card, destination choice). Selected shows an ink outline and a check. */
export type TileTint = 'peach' | 'mint' | 'lav' | 'sun';

const TINT: Record<TileTint, string> = {
  peach: 'bg-peach',
  mint: 'bg-mint',
  lav: 'bg-lav',
  sun: 'bg-sun',
};

interface TileProps {
  tint: TileTint;
  selected?: boolean;
  /** Makes the tile a button. */
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
}

export const Tile: React.FC<TileProps> = ({ tint, selected = false, onClick, className, children }) => {
  const t = useT();
  const base = `relative block w-full rounded-3xl p-4 text-left text-ink ${TINT[tint]} ${
    selected ? 'outline outline-2 outline-ink' : ''
  } ${className ?? ''}`;
  const check = selected && (
    <span className="absolute right-3 top-3 grid size-6 place-items-center rounded-full bg-cta text-cta-fg">
      <Icon name="check" size={14} strokeWidth={2.4} />
      <span className="sr-only">{t.ui.selected}</span>
    </span>
  );

  if (!onClick) {
    return (
      <div className={base}>
        {children}
        {check}
      </div>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-pressed={selected} className={`${base} min-h-11 active:opacity-80`}>
      {children}
      {check}
    </button>
  );
};
