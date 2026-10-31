import React, { useMemo, useState } from 'react';
import type { PiggyBank, SavingsSettings, WalletSettings } from '../types';
import { isArchived, isInSplit, planDeposit } from '../services/ledger';
import { formatMoney, fromCents, toCents } from '../services/money';
import { amountToCents, typedFromCents } from '../services/keypad';
import { planWalletMove, walletCents, type WalletMove } from '../services/wallet';
import { walletProblemText } from '../services/problemText';
import { moveTargets, WALLET_PLACE, POT_PLACE, SPLIT_PLACE, type Place } from '../services/movePlaces';
import { safeGoalIcon } from '../services/goalIcons';
import { useBackHandler } from '../hooks/useBackHandler';
import { useT } from '../contexts/LanguageContext';
import { Button } from './ui/Button';
import { Icon } from './ui/Icon';
import { IconTile, TINT_ORDER, type IconTint } from './ui/IconTile';
import { Keypad } from './ui/Keypad';
import { PageBand } from './ui/PageBand';
import { Sheet } from './ui/Sheet';

interface MoveSheetProps {
  banks: PiggyBank[];
  wallet: WalletSettings;
  savings: SavingsSettings;
  potCents: number;
  /** Where the move starts; the investing page starts on the investing cash. */
  from?: Place;
  /** Resolves once the move is recorded; a refusal rejects and keeps the page open. */
  onWalletMove: (amount: number, move: WalletMove) => void | Promise<void>;
  /** `target` is a goal id, or null for by shares, which only money coming out of the pot can do. */
  onPotMove: (direction: 'in' | 'out', target: string | null, cents: number) => void | Promise<void>;
  onClose: () => void;
}

/**
 * Moving money between the places it can sit, on one page: the wallet and the
 * goals both ways, a goal into the investing cash, and the investing cash back.
 * It is neither saving nor spending, and no side can be overdrawn by it. Nothing
 * is picked for the person where a wrong guess would move money.
 */
const MoveSheet: React.FC<MoveSheetProps> = ({ banks, wallet, savings, potCents, from: start = WALLET_PLACE, onWalletMove, onPotMove, onClose }) => {
  const t = useT();
  const w = t.wallet;
  const p = t.pro.move;
  useBackHandler(true, onClose);
  const goals = useMemo(() => banks.filter((b) => !isArchived(b)), [banks]);
  const held = walletCents(wallet);
  const canSplit = goals.some(isInSplit);

  const [from, setFrom] = useState<Place>(start);
  const [to, setTo] = useState<Place | undefined>(undefined);
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const cents = amountToCents(text);
  const money = (c: number) => formatMoney(fromCents(c));
  const goalOf = (place: Place | undefined) => goals.find((b) => b.id === place);

  const name = (place: Place | undefined) => {
    if (place === undefined) return p.pick;
    if (place === WALLET_PLACE) return w.name;
    if (place === POT_PLACE) return t.invest.pot;
    if (place === SPLIT_PLACE) return w.byShares;
    return goalOf(place)?.name ?? '';
  };
  const heldBy = (place: Place | undefined) => {
    if (place === WALLET_PLACE) return held;
    if (place === POT_PLACE) return potCents;
    const goal = goalOf(place);
    return goal ? toCents(goal.currentAmount) : null;
  };
  const tile = (place: Place | undefined): { icon: React.ReactNode; tint: IconTint } => {
    if (place === WALLET_PLACE) return { icon: 'wallet', tint: 'teal' };
    if (place === POT_PLACE) return { icon: 'trend', tint: 'violet' };
    if (place === SPLIT_PLACE) return { icon: 'pie', tint: 'blue' };
    const goal = goalOf(place);
    if (!goal) return { icon: 'target', tint: 'plain' };
    return {
      icon: <span className="material-symbols-rounded text-[21px] leading-none">{safeGoalIcon(goal.icon)}</span>,
      tint: TINT_ORDER[goals.indexOf(goal) % TINT_ORDER.length],
    };
  };

  const targets = moveTargets(from, goals.map((b) => b.id), canSplit);
  const froms: Place[] = [WALLET_PLACE, ...goals.map((b) => b.id), POT_PLACE];

  const walletMove: WalletMove | null =
    from === WALLET_PLACE && to !== undefined
      ? { direction: 'toGoals', target: to === SPLIT_PLACE ? { mode: 'split' } : { mode: 'goal', goalId: to } }
      : to === WALLET_PLACE
        ? { direction: 'toWallet', goalId: from }
        : null;
  const isPot = from === POT_PLACE || to === POT_PLACE;

  const walletPlan = useMemo(
    () => (walletMove && cents > 0 ? planWalletMove({ amountCents: cents, move: walletMove, banks, wallet: held, overflow: savings.overflow }) : null),
    [from, to, cents, banks, held, savings.overflow] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const plan = walletPlan && 'plan' in walletPlan ? walletPlan.plan : null;
  const problem = walletPlan && 'problem' in walletPlan ? walletPlan : null;

  const available = heldBy(from);
  const potOver = isPot && available !== null && cents > available;
  const ready = !busy && cents > 0 && to !== undefined && (isPot ? !potOver : !!plan);

  // How the two ends change, before anything moves.
  const potLanding = useMemo(() => {
    if (from !== POT_PLACE || to === undefined || cents <= 0) return [];
    const moves = planDeposit(cents, goals, [], to === SPLIT_PLACE ? null : to, savings.overflow).movements.filter((m) => m.cents !== 0);
    const placed = moves.reduce((s, m) => s + m.cents, 0);
    if (moves.length > 0 && placed < cents) moves.reduce((a, b) => (b.percentage > a.percentage ? b : a)).cents += cents - placed;
    return moves;
  }, [from, to, cents, goals, savings.overflow]);

  const after = (place: Place | undefined) => {
    const now = heldBy(place);
    if (now === null || cents <= 0) return null;
    if (place === from) return now - cents;
    if (place === to) return now + cents;
    return null;
  };

  const confirm = async () => {
    if (!ready || to === undefined) return;
    setBusy(true);
    setFailed(null);
    try {
      if (walletMove) await onWalletMove(fromCents(cents), walletMove);
      else if (to === POT_PLACE) await onPotMove('in', from, cents);
      else await onPotMove('out', to === SPLIT_PLACE ? null : to, cents);
      onClose();
    } catch (e) {
      setBusy(false);
      setFailed(e instanceof Error ? e.message : t.ui.toastError);
    }
  };

  const end = (label: string, place: Place | undefined, which: 'from' | 'to') => {
    const { icon, tint } = tile(place);
    const now = heldBy(place);
    const next = after(place);
    return (
      <button type="button" onClick={() => setPicking(which)} className="flex min-h-[66px] w-full items-center gap-2.5 py-1 pr-10 text-left active:opacity-70">
        <span className="w-5 shrink-0 text-[13.5px] font-semibold text-mute">{label}</span>
        <IconTile icon={icon} tint={tint} size={40} />
        <span className={`min-w-0 flex-1 truncate text-[15.5px] font-bold ${place === undefined ? 'text-mute' : ''}`}>{name(place)}</span>
        {now !== null && (
          <span className="shrink-0 text-right text-[13px] font-semibold tabular-nums text-mute">
            {money(now)}
            {next !== null && <span className="block">→ {money(next)}</span>}
          </span>
        )}
      </button>
    );
  };

  const swap = () => {
    if (to === undefined || to === SPLIT_PLACE) return;
    setFrom(to);
    setTo(moveTargets(to, goals.map((b) => b.id), canSplit).includes(from) ? from : undefined);
    setFailed(null);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-page font-figtree text-ink no-scrollbar">
      <div className="mx-auto flex min-h-full max-w-xl flex-col">
        <PageBand title={p.title} onClose={onClose}>
          <p className="mt-1 text-[38px] font-bold leading-[1.15] tracking-[-0.015em] tabular-nums">{money(cents)}</p>
        </PageBand>

        <div className="flex flex-1 flex-col gap-2.5 px-4 pt-3">
          <div className="relative divide-y divide-line/10 rounded-3xl bg-card px-3.5">
            {end(p.from, from, 'from')}
            {end(p.to, to, 'to')}
            <button
              type="button"
              onClick={swap}
              disabled={to === undefined || to === SPLIT_PLACE}
              aria-label={p.swap}
              className="absolute right-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-page text-tblue active:opacity-70 disabled:opacity-40"
            >
              <Icon name="swap" size={20} strokeWidth={2} className="rotate-90" />
            </button>
          </div>

          {potLanding.length > 1 && (
            <div className="rounded-3xl bg-card px-3.5 py-2">
              {potLanding.map((m) => (
                <div key={m.bankId} className="flex items-center justify-between gap-3 py-1 text-[13.5px] font-semibold tabular-nums">
                  <span className="min-w-0 truncate">{goals.find((b) => b.id === m.bankId)?.name}</span>
                  <span className="text-pos">+{money(m.cents)}</span>
                </div>
              ))}
            </div>
          )}
          {plan && plan.movements.length > 1 && (
            <div className="rounded-3xl bg-card px-3.5 py-2">
              {plan.movements.map((m) => (
                <div key={m.bankId} className="flex items-center justify-between gap-3 py-1 text-[13.5px] font-semibold tabular-nums">
                  <span className="min-w-0 truncate">{banks.find((b) => b.id === m.bankId)?.name}</span>
                  <span className={m.cents > 0 ? 'text-pos' : ''}>
                    {m.cents > 0 ? '+' : ''}
                    {money(m.cents)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {available !== null && available > 0 && (
            <button type="button" onClick={() => setText(typedFromCents(available))} className="min-h-11 self-start rounded-full bg-card px-4 text-[13px] font-bold active:opacity-70">
              {t.invest.potCard.all(money(available))}
            </button>
          )}
          {problem && (
            <p className="rounded-3xl bg-card px-4 py-3 text-[13px] font-bold text-neg">
              {walletProblemText({ kind: problem.problem, cents: problem.availableCents, goalId: to === WALLET_PLACE ? from : to === SPLIT_PLACE ? undefined : to }, t, banks)}
            </p>
          )}
          {potOver && <p className="rounded-3xl bg-card px-4 py-3 text-[13px] font-bold text-neg">{from === POT_PLACE ? t.errors.potShort : t.errors.potFromShort(name(from))}</p>}
          {failed && (
            <p role="alert" className="rounded-3xl bg-card px-4 py-3 text-[13px] font-bold text-neg">
              {failed}
            </p>
          )}

          <div className="mt-auto" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}>
            <Keypad value={text} onChange={setText} compact />
            <Button className="mt-2" disabled={!ready} loading={busy} onClick={confirm}>
              {p.confirm}
            </Button>
          </div>
        </div>
      </div>

      {picking && (
        <Sheet title={picking === 'from' ? p.from : p.to} onClose={() => setPicking(null)} z={60}>
          <div className="divide-y divide-line/10 rounded-3xl bg-card px-3.5">
            {(picking === 'from' ? froms : targets).map((place) => {
              const { icon, tint } = tile(place);
              const now = heldBy(place);
              const on = (picking === 'from' ? from : to) === place;
              return (
                <button
                  key={place}
                  type="button"
                  onClick={() => {
                    if (picking === 'from') {
                      setFrom(place);
                      if (to !== undefined && !moveTargets(place, goals.map((b) => b.id), canSplit).includes(to)) setTo(undefined);
                    } else setTo(place);
                    setPicking(null);
                    setFailed(null);
                  }}
                  className="flex min-h-14 w-full items-center gap-2.5 py-1.5 text-left active:opacity-70"
                >
                  <IconTile icon={icon} tint={tint} size={38} />
                  <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{name(place)}</span>
                  {now !== null && <span className="shrink-0 text-[13px] font-semibold tabular-nums text-mute">{money(now)}</span>}
                  {on && <Icon name="check" size={18} strokeWidth={2.4} className="text-tblue" />}
                </button>
              );
            })}
          </div>
        </Sheet>
      )}
    </div>
  );
};

export default MoveSheet;
