import React from 'react';
import { formatMoney, fromCents, toCents } from '../../services/money';
import { useT } from '../../contexts/LanguageContext';

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
  const shown = formatMoney(fromCents(cents));

  return (
    <div className="rounded-[2rem] bg-surface border border-accent/25 p-5 shadow-xl">
      <div className="flex items-center gap-3">
        <div className="size-11 shrink-0 rounded-2xl bg-accent/10 text-accent flex items-center justify-center">
          <span className="material-symbols-rounded text-2xl">account_balance_wallet</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">{t.invest.pot}</p>
          {/* Money is never cut off: a long balance gets a smaller size instead. */}
          <p
            className={`text-white font-black tracking-tight break-all ${
              shown.length > 15 ? 'text-lg' : shown.length > 12 ? 'text-xl' : 'text-2xl'
            }`}
          >
            {shown}
          </p>
        </div>
      </div>
      <p className="text-slate-500 text-[11px] font-bold mt-2 leading-relaxed">{w.hint}</p>
      <div className="grid grid-cols-2 gap-2 mt-4">
        <button
          type="button"
          onClick={onMoveIn}
          className="h-11 rounded-2xl bg-accent text-black text-[13px] font-black flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
        >
          <span className="material-symbols-rounded text-lg">south_east</span>
          {w.moveIn}
        </button>
        <button
          type="button"
          onClick={onMoveOut}
          disabled={cents <= 0}
          className="h-11 rounded-2xl bg-white/5 border border-white/10 text-white text-[13px] font-black flex items-center justify-center gap-1.5 active:scale-95 transition-transform disabled:opacity-30"
        >
          <span className="material-symbols-rounded text-lg">north_west</span>
          {w.moveOut}
        </button>
      </div>
    </div>
  );
};

export default PotCard;
