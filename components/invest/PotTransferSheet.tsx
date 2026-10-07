import { safeGoalIcon } from '../../services/goalIcons';
import React, { useEffect, useRef, useState } from 'react';
import type { PiggyBank, SavingsSettings } from '../../types';
import { isArchived, isInSplit, planDeposit } from '../../services/ledger';
import { cleanFeeInput } from '../../services/fees';
import { loadLastChoices, saveLastChoices, usableChoices, withChoice } from '../../services/lastChoices';
import { formatMoney, fromCents, toCents } from '../../services/money';
import { useT } from '../../contexts/LanguageContext';
import { ChoiceRow } from './RefundSheet';
import { Button } from '../ui/Button';
import { Sheet } from '../ui/Sheet';

const Line: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-baseline gap-3 py-1 text-[13.5px]">
    <span className="min-w-0 flex-1 truncate font-medium text-mute">{label}</span>
    <span className="shrink-0 text-right font-bold tabular-nums">{value}</span>
  </div>
);

/**
 * Moving money between savings and the investment pot.
 *
 * "In" takes it from one savings goal, never more than the goal holds. "Out"
 * puts it into one goal or splits it by the strategy — not new income, so it
 * does not clear spent ahead. With one goal it is picked, since there is no other
 * answer; with several, only what the person used last time (if that goal is still
 * there) is picked, and otherwise nothing is. The pot can never be emptied below zero.
 */
const PotTransferSheet: React.FC<{
  direction: 'in' | 'out';
  banks: PiggyBank[];
  potBalance: number;
  savings: SavingsSettings;
  /** `target` is a goal id, or null for auto split (only for "out"). */
  onConfirm: (target: string | null, cents: number) => void | Promise<void>;
  onClose: () => void;
  /** For remembering the last goal used; without it nothing is remembered. */
  uid?: string;
}> = ({ direction, banks, potBalance, savings, onConfirm, onClose, uid }) => {
  const t = useT();
  const w = t.invest.potCard;
  const goals = banks.filter((b) => !isArchived(b));
  const canSplit = direction === 'out' && goals.some(isInSplit);
  /**
   * undefined until picked; null is auto split. Starts from the only goal, or
   * from the last one used if it still exists and is active — read once, so a
   * later change to the goals never moves a pick the person already made.
   */
  const [target, setTarget] = useState<string | null | undefined>(() => {
    if (goals.length === 1) return goals[0].id;
    if (!uid) return undefined;
    const last = usableChoices(loadLastChoices(uid), banks);
    if (direction === 'in') return last.potInGoal;
    if (last.potOutTarget === 'split') return canSplit ? null : undefined;
    return last.potOutTarget;
  });
  const amountRef = useRef<HTMLInputElement>(null);
  // Once there is somewhere for the money to go, the amount is the next thing to type.
  useEffect(() => {
    if (target !== undefined) amountRef.current?.focus();
  }, [target]);
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

  /** Only a move that went through is remembered, so a refused one never becomes the habit. */
  const remember = (pick: string | null) => {
    if (!uid) return;
    const patch = direction === 'in' ? { potInGoal: pick ?? undefined } : { potOutTarget: pick === null ? 'split' : pick };
    saveLastChoices(uid, withChoice(loadLastChoices(uid), patch));
  };

  const confirm = () => {
    if (!ready) return;
    const pick = target ?? null;
    const done = onConfirm(pick, cents);
    if (done && typeof (done as Promise<void>).then === 'function') {
      // The caller still owns a failure; a refused move just is not remembered.
      void (done as Promise<void>).then(() => remember(pick), () => undefined);
    } else {
      remember(pick);
    }
  };

  return (
    <Sheet
      title={direction === 'in' ? w.inTitle : w.outTitle}
      z={60}
      onClose={onClose}
      footer={
        <div className="space-y-2">
          <button
            type="button"
            onClick={confirm}
            disabled={!ready}
            className={`inline-flex min-h-12 w-full items-center justify-center rounded-full px-6 text-[15.5px] font-extrabold text-cta-fg disabled:opacity-40 active:opacity-80 ${direction === 'in' ? 'bg-info' : 'bg-cta'}`}
          >
            {cents > 0 ? (direction === 'in' ? w.inConfirm(money(cents)) : w.outConfirm(money(cents))) : direction === 'in' ? w.moveIn : w.moveOut}
          </button>
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
        </div>
      }
    >
      <p className="px-1 text-[13.5px] font-medium leading-relaxed text-mute">{direction === 'in' ? w.inHint : w.outHint}</p>

      {direction === 'in' && (
        <>
          <p className="mb-2 mt-4 px-1 text-[12.5px] font-bold text-mute">{w.fromGoal}</p>
          <div className="space-y-2">
            {goals.map((b) => (
              <ChoiceRow key={b.id} icon={safeGoalIcon(b.icon)} label={b.name} value={money(toCents(b.currentAmount))} on={target === b.id} onClick={() => setTarget(b.id)} />
            ))}
            {goals.length === 0 && <p className="px-1 text-[13px] font-medium text-mute">{w.noGoals}</p>}
          </div>
        </>
      )}

      <label htmlFor="pot-amount" className="mb-2 mt-4 block px-1 text-[12.5px] font-bold text-mute">
        {w.amount}
      </label>
      <div className="flex min-h-14 items-center gap-2 rounded-[18px] bg-field px-4 focus-within:outline focus-within:outline-2 focus-within:outline-ink">
        <span className="shrink-0 font-bold text-mute">RM</span>
        <input
          id="pot-amount"
          ref={amountRef}
          autoFocus={target !== undefined}
          type="text"
          inputMode="decimal"
          value={text}
          onChange={(e) => setText(cleanFeeInput(e.target.value))}
          placeholder="0.00"
          className="min-h-6 w-full min-w-0 border-0 bg-transparent p-0 text-[20px] font-extrabold text-ink placeholder:text-mute focus:ring-0"
        />
      </div>
      {quick !== null && quick > 0 && (
        <button type="button" onClick={() => setText(fromCents(quick).toFixed(2))} className="mt-2 min-h-11 rounded-full bg-line/10 px-4 text-[13px] font-extrabold active:opacity-70">
          {w.all(money(quick))}
        </button>
      )}
      {over && <p className="mt-2 px-1 text-[12.5px] font-bold text-neg">{direction === 'in' ? t.errors.potFromShort(source?.name ?? '') : t.errors.potShort}</p>}

      {direction === 'out' && (
        <>
          <p className="mb-2 mt-4 px-1 text-[12.5px] font-bold text-mute">{w.intoWhere}</p>
          <div className="space-y-2">
            {goals.map((b) => (
              <ChoiceRow key={b.id} icon={safeGoalIcon(b.icon)} label={b.name} value={money(toCents(b.currentAmount))} on={target === b.id} onClick={() => setTarget(b.id)} />
            ))}
            {canSplit && <ChoiceRow icon="call_split" tone="split" label={t.common.autoSplit} sub={w.splitSub} on={target === null} onClick={() => setTarget(null)} />}
            {goals.length === 0 && <p className="px-1 text-[13px] font-medium text-mute">{w.noGoals}</p>}
          </div>
        </>
      )}

      {ready && (
        <div className="mt-4 rounded-3xl bg-lav p-4">
          {direction === 'in' && source && <Line label={source.name} value={`${money(toCents(source.currentAmount))} → ${money(toCents(source.currentAmount) - cents)}`} />}
          {landing.map((m) => {
            const bank = goals.find((b) => b.id === m.bankId);
            const now = toCents(bank?.currentAmount ?? 0);
            return <Line key={m.bankId} label={bank?.name ?? ''} value={`${money(now)} → ${money(now + m.cents)}`} />;
          })}
          <Line label={t.invest.pot} value={`${money(potCents)} → ${money(direction === 'in' ? potCents + cents : potCents - cents)}`} />
        </div>
      )}
    </Sheet>
  );
};

export default PotTransferSheet;
