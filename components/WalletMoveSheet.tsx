import React, { useMemo, useState } from 'react';
import type { PiggyBank, SavingsSettings, WalletSettings } from '../types';
import { isArchived } from '../services/ledger';
import { formatMoney, fromCents, toCents } from '../services/money';
import { amountToCents } from '../services/keypad';
import { planWalletMove, walletCents, type WalletMove } from '../services/wallet';
import { walletProblemText } from '../services/problemText';
import { useT } from '../contexts/LanguageContext';
import { Sheet } from './ui/Sheet';
import { Segmented } from './ui/Segmented';
import { Tile, type TileTint } from './ui/Tile';
import { Button } from './ui/Button';
import { Amount } from './ui/Amount';
import { Keypad } from './ui/Keypad';
import { Icon } from './ui/Icon';

type Way = 'toGoals' | 'toWallet';

const TINTS: TileTint[] = ['peach', 'lav', 'sun', 'mint'];

interface WalletMoveSheetProps {
  banks: PiggyBank[];
  wallet: WalletSettings;
  savings: SavingsSettings;
  /** Resolves once the move is recorded; a refusal rejects and keeps the sheet open. */
  onMove: (amount: number, move: WalletMove) => void | Promise<void>;
  onClose: () => void;
}

const Choice: React.FC<{ tint: TileTint; selected: boolean; onClick: () => void; title: string; small: string }> = ({
  tint,
  selected,
  onClick,
  title,
  small,
}) => (
  <div className="w-40 shrink-0">
    <Tile tint={tint} selected={selected} onClick={onClick}>
      <span className="block min-w-0 truncate pr-6 text-[14px] font-extrabold">{title}</span>
      <span className="mt-0.5 block text-[12px] font-semibold leading-snug opacity-70">{small}</span>
    </Tile>
  </div>
);

/**
 * Moving money between the wallet and the goals by hand. It is neither saving
 * nor spending, and neither side can be overdrawn by it.
 */
const WalletMoveSheet: React.FC<WalletMoveSheetProps> = ({ banks, wallet, savings, onMove, onClose }) => {
  const t = useT();
  const w = t.wallet;
  const goals = useMemo(() => banks.filter((b) => !isArchived(b)), [banks]);

  const [way, setWay] = useState<Way>('toGoals');
  const [text, setText] = useState('');
  /** Wallet to goals: null is "by shares". Goals to wallet: the goal to take from, undefined until picked. */
  const [into, setInto] = useState<string | null>(null);
  const [from, setFrom] = useState<string | undefined>(() => (goals.length === 1 ? goals[0].id : undefined));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const cents = amountToCents(text);
  const held = walletCents(wallet);

  const move: WalletMove | null =
    way === 'toGoals'
      ? { direction: 'toGoals', target: into ? { mode: 'goal', goalId: into } : { mode: 'split' } }
      : from
        ? { direction: 'toWallet', goalId: from }
        : null;

  const result = useMemo(
    () => (move && cents > 0 ? planWalletMove({ amountCents: cents, move, banks, wallet: held, overflow: savings.overflow }) : null),
    [move, cents, banks, held, savings.overflow] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const plan = result && 'plan' in result ? result.plan : null;
  const problem = result && 'problem' in result ? result : null;
  const ready = !!plan && !busy;

  const money = (c: number) => formatMoney(fromCents(c));

  const confirm = async () => {
    if (!plan || !move || busy) return;
    setBusy(true);
    setFailed(null);
    try {
      await onMove(fromCents(cents), move);
      onClose();
    } catch (e) {
      setBusy(false);
      setFailed(e instanceof Error ? e.message : t.ui.toastError);
    }
  };

  return (
    <Sheet
      title={w.moveTitle}
      onClose={onClose}
      height="tall"
      footer={
        <Button disabled={!ready} loading={busy} onClick={confirm}>
          {cents > 0 ? w.confirmMove(money(cents)) : w.moveTitle}
        </Button>
      }
    >
      <Segmented<Way>
        ariaLabel={w.moveTabs}
        value={way}
        onChange={(next) => {
          setWay(next);
          setFailed(null);
        }}
        options={[
          { value: 'toGoals', label: w.toGoalsTab },
          { value: 'toWallet', label: w.toWalletTab },
        ]}
      />

      <p className="mb-2 mt-5 px-0.5 text-[12.5px] font-bold text-mute">{way === 'toGoals' ? w.putInto : w.takeFrom}</p>
      <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
        {way === 'toGoals' && (
          <Choice tint="mint" selected={into === null} onClick={() => setInto(null)} title={w.byShares} small={w.bySharesSmall} />
        )}
        {goals.map((b, i) => (
          <Choice
            key={b.id}
            tint={TINTS[i % TINTS.length]}
            selected={way === 'toGoals' ? into === b.id : from === b.id}
            onClick={() => (way === 'toGoals' ? setInto(b.id) : setFrom(b.id))}
            title={b.name}
            small={money(toCents(b.currentAmount))}
          />
        ))}
      </div>
      {way === 'toWallet' && !from && <p className="mt-2 px-0.5 text-[12.5px] font-semibold text-mute">{w.pickGoal}</p>}

      <Keypad value={text} onChange={setText} className="mt-1" />

      {plan && (
        <div className="mt-4 rounded-3xl bg-card px-4 py-3">
          <p className="mb-1.5 text-[12.5px] font-bold text-mute">{w.previewHeading}</p>
          <div className="flex items-center justify-between gap-3 py-0.5">
            <span className="flex items-center gap-1.5 text-[13.5px] font-semibold">
              <Icon name="wallet" size={15} />
              {w.walletLine}
            </span>
            <span className="text-[13.5px] font-extrabold tabular-nums">
              {money(held)} → {money(held + plan.walletCents)}
            </span>
          </div>
          {plan.movements.map((m) => (
            <div key={m.bankId} className="flex items-center justify-between gap-3 py-0.5">
              <span className="min-w-0 truncate text-[13.5px] font-semibold">{banks.find((b) => b.id === m.bankId)?.name}</span>
              <Amount cents={m.cents} size="sm" tone={m.cents > 0 ? 'pos' : 'ink'} signed />
            </div>
          ))}
        </div>
      )}

      {problem && (
        <p className="mt-4 rounded-3xl bg-card px-4 py-3 text-[13px] font-bold text-neg">
          {walletProblemText({ kind: problem.problem, cents: problem.availableCents, goalId: way === 'toWallet' ? from : into ?? undefined }, t, banks)}
        </p>
      )}

      <p className="mt-4 px-1 text-[12.5px] font-medium leading-relaxed text-mute">{w.moveNote}</p>

      {failed && (
        <p role="alert" className="mt-4 rounded-3xl bg-card px-4 py-3 text-[13px] font-bold text-neg">
          {failed}
        </p>
      )}
    </Sheet>
  );
};

export default WalletMoveSheet;
