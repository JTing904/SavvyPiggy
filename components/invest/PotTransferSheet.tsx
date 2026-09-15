import React, { useState } from 'react';
import type { PiggyBank, SavingsSettings } from '../../types';
import { isArchived, isInSplit, planDeposit } from '../../services/ledger';
import { cleanFeeInput } from '../../services/fees';
import { formatMoney, fromCents, toCents } from '../../services/money';
import { useBackHandler } from '../../hooks/useBackHandler';
import { useT } from '../../contexts/LanguageContext';
import { ChoiceRow } from './RefundSheet';

const Line: React.FC<{ label: string; value: string; tone: string }> = ({ label, value, tone }) => (
  <div className={`flex items-baseline gap-3 text-[13px] ${tone}`}>
    <span className="flex-1 min-w-0 font-bold truncate">{label}</span>
    <span className="font-black shrink-0 text-right">{value}</span>
  </div>
);

/**
 * Moving money between savings and the investment pot.
 *
 * "In" takes it from one savings goal, never more than the goal holds. "Out"
 * puts it into one goal or splits it by the strategy — not new income, so it
 * does not clear spent ahead. Nothing is picked for the person, and the pot can
 * never be emptied below zero.
 */
const PotTransferSheet: React.FC<{
  direction: 'in' | 'out';
  banks: PiggyBank[];
  potBalance: number;
  savings: SavingsSettings;
  /** `target` is a goal id, or null for auto split (only for "out"). */
  onConfirm: (target: string | null, cents: number) => void;
  onClose: () => void;
}> = ({ direction, banks, potBalance, savings, onConfirm, onClose }) => {
  const t = useT();
  const w = t.invest.potCard;
  useBackHandler(true, onClose);

  const goals = banks.filter((b) => !isArchived(b));
  const canSplit = direction === 'out' && goals.some(isInSplit);
  /** undefined until picked; null is auto split. */
  const [target, setTarget] = useState<string | null | undefined>(undefined);
  const [text, setText] = useState('');

  const cents = toCents(Number(text) || 0);
  const potCents = toCents(potBalance);
  const source = direction === 'in' ? goals.find((b) => b.id === target) ?? null : null;
  const limit = direction === 'in' ? (source ? toCents(source.currentAmount) : null) : potCents;
  const over = limit !== null && cents > limit;
  const ready = target !== undefined && cents > 0 && !over;

  const money = (c: number) => formatMoney(fromCents(c));

  // Where "out" lands, exactly as the save will place it.
  const landing =
    direction === 'out' && target !== undefined && cents > 0
      ? (() => {
          const moves = planDeposit(cents, goals, [], target, savings.overflow).movements.filter((m) => m.cents !== 0);
          const placed = moves.reduce((s, m) => s + m.cents, 0);
          if (moves.length > 0 && placed < cents) moves.reduce((a, b) => (b.percentage > a.percentage ? b : a)).cents += cents - placed;
          return moves;
        })()
      : [];

  const quick = direction === 'in' ? (source ? toCents(source.currentAmount) : null) : potCents;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/85 veil-in" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md mx-auto bg-surface sheet-rise rounded-t-[2rem] border-t border-white/10 px-6 pt-4 pb-8 max-h-[90%] overflow-y-auto no-scrollbar safe-pb"
      >
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-5" />
        <h3 className="text-white text-xl font-black tracking-tight">{direction === 'in' ? w.inTitle : w.outTitle}</h3>
        <p className="text-slate-400 text-[12px] font-bold mt-1.5 leading-relaxed">{direction === 'in' ? w.inHint : w.outHint}</p>

        {direction === 'in' && (
          <>
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mt-5 mb-2">{w.fromGoal}</p>
            <div className="space-y-2">
              {goals.map((b) => (
                <ChoiceRow
                  key={b.id}
                  icon={b.icon}
                  label={b.name}
                  value={money(toCents(b.currentAmount))}
                  on={target === b.id}
                  onClick={() => setTarget(b.id)}
                />
              ))}
              {goals.length === 0 && <p className="text-slate-500 text-xs font-bold">{w.noGoals}</p>}
            </div>
          </>
        )}

        <label htmlFor="pot-amount" className="block text-slate-500 text-[10px] font-black uppercase tracking-widest mt-5 mb-2">
          {w.amount}
        </label>
        <div className="flex items-center gap-2 h-14 px-4 rounded-2xl bg-white/5 border border-white/10 focus-within:border-accent/50 transition-colors">
          <span className="text-slate-500 font-black shrink-0">RM</span>
          <input
            id="pot-amount"
            type="text"
            inputMode="decimal"
            value={text}
            onChange={(e) => setText(cleanFeeInput(e.target.value))}
            placeholder="0.00"
            className="w-full min-w-0 border-0 bg-transparent text-white text-lg font-black focus:outline-none placeholder:text-slate-700"
          />
        </div>
        {quick !== null && quick > 0 && (
          <button
            type="button"
            onClick={() => setText(fromCents(quick).toFixed(2))}
            className="mt-2 h-8 px-3 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-[11px] font-black active:scale-95 transition-transform"
          >
            {w.all(money(quick))}
          </button>
        )}
        {over && (
          <p className="text-red-400 text-[11px] font-bold mt-2">
            {direction === 'in' ? t.errors.potFromShort(source?.name ?? '') : t.errors.potShort}
          </p>
        )}

        {direction === 'out' && (
          <>
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mt-5 mb-2">{w.intoWhere}</p>
            <div className="space-y-2">
              {goals.map((b) => (
                <ChoiceRow
                  key={b.id}
                  icon={b.icon}
                  label={b.name}
                  value={money(toCents(b.currentAmount))}
                  on={target === b.id}
                  onClick={() => setTarget(b.id)}
                />
              ))}
              {canSplit && (
                <ChoiceRow
                  icon="call_split"
                  tone="split"
                  label={t.common.autoSplit}
                  sub={w.splitSub}
                  on={target === null}
                  onClick={() => setTarget(null)}
                />
              )}
              {goals.length === 0 && <p className="text-slate-500 text-xs font-bold">{w.noGoals}</p>}
            </div>
          </>
        )}

        {ready && (
          <div className="mt-5 rounded-2xl bg-white/5 p-4 space-y-2">
            {direction === 'in' && source && (
              <Line label={source.name} value={`${money(toCents(source.currentAmount))} → ${money(toCents(source.currentAmount) - cents)}`} tone="text-slate-300" />
            )}
            {landing.map((m) => {
              const bank = goals.find((b) => b.id === m.bankId);
              const now = toCents(bank?.currentAmount ?? 0);
              return <Line key={m.bankId} label={bank?.name ?? ''} value={`${money(now)} → ${money(now + m.cents)}`} tone="text-primary" />;
            })}
            <Line
              label={t.invest.pot}
              value={`${money(potCents)} → ${money(direction === 'in' ? potCents + cents : potCents - cents)}`}
              tone="text-accent"
            />
          </div>
        )}

        <button
          type="button"
          onClick={() => ready && onConfirm(target ?? null, cents)}
          disabled={!ready}
          className={`w-full h-14 mt-6 rounded-full font-black disabled:opacity-30 active:scale-95 transition-all ${
            direction === 'in' ? 'bg-accent text-black' : 'bg-primary text-black'
          }`}
        >
          {cents > 0 ? (direction === 'in' ? w.inConfirm(money(cents)) : w.outConfirm(money(cents))) : direction === 'in' ? w.moveIn : w.moveOut}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="w-full h-12 mt-3 rounded-full glass border border-white/10 text-white font-black active:scale-95 transition-transform"
        >
          {t.common.cancel}
        </button>
      </div>
    </div>
  );
};

export default PotTransferSheet;
