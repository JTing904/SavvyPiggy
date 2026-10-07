import React, { useEffect, useRef, useState } from 'react';
import type { Activity, Loan, PiggyBank, SavingsSettings, WalletSettings } from '../types';
import { formatMoney, fromCents, percentReached, toCents } from '../services/money';
import { totalDebtCents } from '../services/ledger';
import { safeGoalIcon } from '../services/goalIcons';
import { walletCents, type WalletMove } from '../services/wallet';
import type { IncomeChoice } from '../services/moneySheet';
import { noteText } from '../i18n';
import { useAuth } from '../contexts/AuthContext';
import { useT } from '../contexts/LanguageContext';
import type { Mode as NavMode } from './Navigation';
import Avatar from './Avatar';
import MoneySheet from './MoneySheet';
import WalletMoveSheet from './WalletMoveSheet';
import { EntryRow } from './history/EntryRow';
import { Group } from './ui/Group';
import { Row } from './ui/Row';
import { Amount } from './ui/Amount';
import { Button } from './ui/Button';
import { Icon } from './ui/Icon';
import { EmptyState } from './ui/EmptyState';
import type { TileTint } from './ui/Tile';

const TINTS: TileTint[] = ['peach', 'lav', 'sun', 'mint'];

interface SavingsHomeProps {
  /** The goals that are not put away. */
  banks: PiggyBank[];
  activities: Activity[];
  loans: Loan[];
  wallet: WalletSettings;
  savings: SavingsSettings;
  /** What the goals hold together, in ringgit. */
  totalBalance: number;
  unreadAlerts: number;
  uid: string;
  liveFrom: Date;
  mode: NavMode;
  onModeChange: (mode: NavMode) => void;
  onDeposit: (amount: number, choice: IncomeChoice, at?: Date) => void | Promise<void>;
  onWithdraw: (amount: number, source: string, note: string, category: string, at?: Date) => void | Promise<void>;
  onMoveWallet: (amount: number, move: WalletMove) => void | Promise<void>;
  onViewAll: () => void;
  onSelectGoal: (id: string) => void;
  onAddGoal: () => void;
  onOpenProfile: () => void;
  onOpenAlerts: () => void;
  onOpenEntry?: (id: string) => void;
  onOpenTrade?: (tradeId: string) => void;
  /** Set from the nav's round button; cleared once the sheet is open. */
  quickAction: 'deposit' | 'withdraw' | null;
  onQuickActionHandled: () => void;
}

type Sheet = 'deposit' | 'spend' | 'move';

const greeting = (t: ReturnType<typeof useT>) => {
  const hour = new Date().getHours();
  if (hour < 12) return t.home.greeting.morning;
  if (hour < 18) return t.home.greeting.afternoon;
  return t.home.greeting.evening;
};

/**
 * Home's savings half: the wallet first, because that is the money you can
 * spend, then what the goals hold in one quiet line, the goals, and the latest
 * records. The investing half is still the older screen.
 */
const SavingsHome: React.FC<SavingsHomeProps> = ({
  banks,
  activities,
  loans,
  wallet,
  savings,
  totalBalance,
  unreadAlerts,
  uid,
  liveFrom,
  mode,
  onModeChange,
  onDeposit,
  onWithdraw,
  onMoveWallet,
  onViewAll,
  onSelectGoal,
  onAddGoal,
  onOpenProfile,
  onOpenAlerts,
  onOpenEntry,
  onOpenTrade,
  quickAction,
  onQuickActionHandled,
}) => {
  const { user } = useAuth();
  const t = useT();
  const w = t.wallet;
  const [sheet, setSheet] = useState<Sheet | null>(null);

  const displayName = user?.displayName || user?.email?.split('@')[0] || t.home.defaultName;
  const held = walletCents(wallet);
  const overdrawn = held < 0;
  const goalsCents = toCents(totalBalance);
  const openLoans = loans.filter((l) => l.outstanding > 0);
  const debtCents = totalDebtCents(openLoans);
  const money = (cents: number) => formatMoney(fromCents(cents));

  // The nav's round button lives outside this screen, so it asks through a prop.
  useEffect(() => {
    if (!quickAction) return;
    setSheet(quickAction === 'deposit' ? 'deposit' : 'spend');
    onQuickActionHandled();
  }, [quickAction]); // eslint-disable-line react-hooks/exhaustive-deps

  // A swipe left goes to investing, as it always did.
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (dx < -80 && Math.abs(dx) > Math.abs(dy) * 2) onModeChange('invest');
  };

  return (
    <div className="flex min-h-full flex-col px-4 pb-40 pt-3 safe-pt font-figtree text-ink" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-mute">{greeting(t)}</p>
          <p className="truncate text-[17px] font-extrabold">{displayName}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenAlerts}
            aria-label={t.home.alerts}
            className="relative grid size-11 place-items-center rounded-full bg-card active:opacity-80"
          >
            <Icon name="bell" size={20} />
            {unreadAlerts > 0 && <span className="absolute right-2.5 top-2.5 size-2.5 rounded-full bg-neg ring-2 ring-card" />}
          </button>
          <Avatar plain onClick={onOpenProfile} />
        </div>
      </div>

      <div role="tablist" aria-label={t.home.modeSwitch} className="flex items-baseline gap-5 px-1">
        {(['save', 'invest'] as const).map((m) => {
          const on = mode === m;
          return (
            <button
              key={m}
              role="tab"
              aria-selected={on}
              onClick={() => onModeChange(m)}
              className={`min-h-11 text-left font-extrabold tracking-tight ${on ? 'text-[30px] text-ink' : 'text-[21px] text-mute'}`}
            >
              {m === 'save' ? t.home.modeSavings : t.home.modeInvesting}
            </button>
          );
        })}
      </div>

      {/* The wallet: the money you can spend, and the one thing to look at. */}
      <div className={`mt-1 rounded-[28px] p-5 ${overdrawn ? 'bg-peach' : 'bg-hero'}`}>
        <p className="flex items-center gap-2 text-[12.5px] font-bold text-mute">
          {w.heroLabel}
          {overdrawn && <span className="rounded-full bg-card px-2 py-0.5 text-[11px] font-extrabold text-neg">{w.overdrawn}</span>}
        </p>
        <Amount cents={held} size="xl" tone={overdrawn ? 'neg' : 'ink'} className="mt-1 block" />
        {overdrawn && <p className="mt-2 text-[12.5px] font-semibold leading-snug">{w.overdrawnNote}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button full={false} onClick={() => setSheet('deposit')}>
            <Icon name="plus" size={16} strokeWidth={2.4} />
            {w.addIncome}
          </Button>
          {banks.length > 0 && (
            <Button full={false} variant="ghost" onClick={() => setSheet('move')}>
              {w.moveToGoals}
            </Button>
          )}
        </div>
      </div>

      {/* What the goals hold: always on the page, never the loudest thing on it. */}
      <div className="mt-3 flex items-center justify-between rounded-3xl bg-card px-5 py-3.5">
        <div>
          <p className="text-[12px] font-bold text-mute">{w.goalsTotal}</p>
          <Amount cents={goalsCents} size="md" />
        </div>
        <div className="text-right">
          <p className="text-[12px] font-bold text-mute">{w.withWallet}</p>
          <Amount cents={goalsCents + held} size="sm" tone="mute" />
        </div>
      </div>

      {debtCents > 0 && (
        <div className="mt-3 rounded-3xl bg-sun px-5 py-3.5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[13.5px] font-extrabold">{w.oldDebtTitle}</p>
            <p className="text-[13.5px] font-extrabold tabular-nums">{w.oldDebtOwed(money(debtCents))}</p>
          </div>
          {openLoans.slice(0, 3).map((loan) => (
            <p key={loan.id} className="mt-0.5 truncate text-[12px] font-semibold opacity-80">
              {(noteText(loan.note) || t.common.spentAhead) + ' · ' + formatMoney(loan.outstanding)}
            </p>
          ))}
          <p className="mt-1.5 text-[12px] font-medium opacity-80">{w.oldDebtNote}</p>
        </div>
      )}

      <div className="mb-2 mt-6 flex items-center justify-between px-1">
        <h3 className="text-[16px] font-extrabold">{w.yourGoals}</h3>
        {banks.length > 0 && (
          <button type="button" onClick={onViewAll} className="min-h-11 text-[13px] font-bold text-mute">
            {w.viewAll}
          </button>
        )}
      </div>
      {banks.length === 0 ? (
        <EmptyState icon="target" title={w.noGoals} body="" action={{ label: w.newGoal, onClick: onAddGoal }} className="rounded-3xl bg-card" />
      ) : (
        <Group>
          {banks.map((bank, i) => {
            const cents = toCents(bank.currentAmount);
            const over = cents < 0;
            const full = bank.targetAmount > 0 && cents >= toCents(bank.targetAmount);
            const sub = over
              ? w.goalOverspent(formatMoney(bank.currentAmount))
              : bank.targetAmount > 0
                ? w.goalProgress(formatMoney(bank.currentAmount), formatMoney(bank.targetAmount), percentReached(bank.currentAmount, bank.targetAmount))
                : w.goalSaved(formatMoney(bank.currentAmount));
            return (
              <Row
                key={bank.id}
                icon={<span className="material-symbols-rounded text-[20px]">{safeGoalIcon(bank.icon)}</span>}
                tint={TINTS[i % TINTS.length]}
                title={bank.name}
                sub={sub}
                trailing={full ? w.goalFull : bank.splitPercentage > 0 ? `${bank.splitPercentage}%` : undefined}
                tone={full ? 'pos' : 'mute'}
                onClick={() => onSelectGoal(bank.id)}
              />
            );
          })}
        </Group>
      )}

      <div className="mb-2 mt-6 px-1">
        <h3 className="text-[16px] font-extrabold">{w.recent}</h3>
      </div>
      {activities.length === 0 ? (
        <p className="rounded-3xl bg-card px-5 py-8 text-center text-[13px] font-semibold text-mute">{t.home.noRecentActivity}</p>
      ) : (
        <Group>
          {activities.slice(0, 4).map((activity) => {
            const trade = activity.type === 'invest' || activity.type === 'divest';
            const open = trade
              ? activity.tradeId && onOpenTrade
                ? () => onOpenTrade(activity.tradeId as string)
                : undefined
              : onOpenEntry
                ? () => onOpenEntry(activity.id)
                : undefined;
            return <EntryRow key={activity.id} activity={activity} banks={banks} onOpen={open} />;
          })}
        </Group>
      )}

      {(sheet === 'deposit' || sheet === 'spend') && (
        <MoneySheet
          mode={sheet}
          banks={banks}
          loans={loans}
          savings={savings}
          wallet={wallet}
          uid={uid}
          liveFrom={liveFrom}
          onDeposit={onDeposit}
          onWithdraw={onWithdraw}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'move' && <WalletMoveSheet banks={banks} wallet={wallet} savings={savings} onMove={onMoveWallet} onClose={() => setSheet(null)} />}
    </div>
  );
};

export default SavingsHome;
