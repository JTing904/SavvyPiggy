import React from 'react';
import { Icon } from './Icon';

export type IconTint = 'blue' | 'teal' | 'amber' | 'coral' | 'violet' | 'plain';

// Full literal class strings so the build keeps every one of them.
const TINT: Record<IconTint, string> = {
  blue: 'bg-hero text-tblue',
  teal: 'bg-mint text-tteal',
  amber: 'bg-sun text-tamber',
  coral: 'bg-peach text-tcoral',
  violet: 'bg-lav text-tviolet',
  plain: 'bg-page text-ink',
};

/** The order goals and categories take a colour in, the same as the charts'. */
export const TINT_ORDER: IconTint[] = ['blue', 'teal', 'amber', 'coral', 'violet'];

interface IconTileProps {
  /** An Icon name, or any node. */
  icon: React.ReactNode;
  tint?: IconTint;
  size?: number;
  /** A round tile marks a record; a square one an action or a place. */
  round?: boolean;
  className?: string;
}

/** A tinted square (or circle) holding one icon. */
export const IconTile: React.FC<IconTileProps> = ({ icon, tint = 'blue', size = 40, round = false, className }) => (
  <span
    className={`grid shrink-0 place-items-center ${TINT[tint]} ${className ?? ''}`}
    style={{ width: size, height: size, borderRadius: round ? size / 2 : Math.round(size / 3) }}
  >
    {typeof icon === 'string' ? <Icon name={icon} size={Math.round(size * 0.52)} strokeWidth={2} /> : icon}
  </span>
);

interface QuickActionProps {
  icon: string;
  tint: IconTint;
  label: string;
  onClick: () => void;
}

/** One of the row of labelled actions under a band. */
export const QuickAction: React.FC<QuickActionProps> = ({ icon, tint, label, onClick }) => (
  <button type="button" onClick={onClick} className="flex min-h-11 min-w-0 flex-col items-center gap-1.5 text-[12.5px] font-bold active:opacity-70">
    <IconTile icon={icon} tint={tint} size={44} />
    <span className="w-full truncate text-center">{label}</span>
  </button>
);
