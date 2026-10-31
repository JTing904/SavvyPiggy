import React from 'react';
import { Icon } from './Icon';
import type { TileTint } from './Tile';

/** The meaning of the trailing figure: money in, spending, moved to investing. */
export type RowTone = 'ink' | 'mute' | 'pos' | 'neg' | 'info';

const TONE: Record<RowTone, string> = {
  ink: 'text-ink',
  mute: 'text-mute',
  pos: 'text-pos',
  neg: 'text-neg',
  info: 'text-info',
};
const TINT: Record<TileTint, string> = {
  peach: 'bg-peach text-tcoral',
  mint: 'bg-mint text-tteal',
  lav: 'bg-lav text-tviolet',
  sun: 'bg-sun text-tamber',
};

interface RowProps {
  /** An Icon name, or any node. */
  icon?: string | React.ReactNode;
  /** Background of the icon square. */
  tint?: TileTint;
  title: React.ReactNode;
  sub?: React.ReactNode;
  trailing?: React.ReactNode;
  onClick?: () => void;
  /** Colours the trailing content. */
  tone?: RowTone;
  className?: string;
}

export const Row: React.FC<RowProps> = ({ icon, tint = 'mint', title, sub, trailing, onClick, tone = 'ink', className }) => {
  const body = (
    <>
      {icon !== undefined && (
        <span className={`grid size-10 shrink-0 place-items-center rounded-[13px] ${TINT[tint]}`}>
          {typeof icon === 'string' ? <Icon name={icon} size={20} strokeWidth={2} /> : icon}
        </span>
      )}
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[14.5px] font-bold">{title}</span>
        {sub && <span className="block truncate text-[12.5px] font-semibold text-mute">{sub}</span>}
      </span>
      {trailing !== undefined && (
        <span className={`shrink-0 whitespace-nowrap text-right text-[14.5px] font-bold tabular-nums ${TONE[tone]}`}>{trailing}</span>
      )}
    </>
  );
  const layout = `flex min-h-14 w-full items-center gap-2.5 py-2 ${className ?? ''}`;
  if (!onClick) return <div className={layout}>{body}</div>;
  return (
    <button type="button" onClick={onClick} className={`${layout} active:opacity-70`}>
      {body}
    </button>
  );
};
