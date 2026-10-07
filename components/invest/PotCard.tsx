import React from 'react';
import { toCents } from '../../services/money';
import { useT } from '../../contexts/LanguageContext';
import { Amount } from '../ui/Amount';
import { Icon } from '../ui/Icon';

/**
 * The investment pot on the investing Home: the cash waiting to buy shares.
 *
 * Savings reach it only by being moved in, and it reaches savings only by
 * being moved back, so the two kinds of money never mix. Buys come out of it;
 * sales and dividends come back into it.
 */
const PotCard: React.FC<{
  balance: number;
  onMoveIn: () => void;
  onMoveOut: () => void;
}> = ({ balance, onMoveIn, onMoveOut }) => {
  const t = useT();
  const w = t.invest.potCard;
  const cents = toCents(balance);

  return (
    <div className="rounded-3xl bg-card p-5 text-ink">
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-mint">
          <Icon name="wallet" size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-bold text-mute">{t.invest.pot}</p>
          <Amount cents={cents} size="md" tone={cents < 0 ? 'neg' : 'ink'} />
        </div>
      </div>
      <p className="mt-2 text-[12.5px] font-medium leading-relaxed text-mute">{w.hint}</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onMoveIn}
          className="flex min-h-12 items-center justify-center gap-1.5 rounded-full bg-info text-[13.5px] font-extrabold text-cta-fg active:opacity-80"
        >
          <Icon name="dep" size={16} />
          {w.moveIn}
        </button>
        <button
          type="button"
          onClick={onMoveOut}
          disabled={cents <= 0}
          className="flex min-h-12 items-center justify-center gap-1.5 rounded-full bg-line/10 text-[13.5px] font-extrabold active:opacity-80 disabled:opacity-35"
        >
          <Icon name="out" size={16} />
          {w.moveOut}
        </button>
      </div>
    </div>
  );
};

export default PotCard;
