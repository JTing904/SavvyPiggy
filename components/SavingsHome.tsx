import React, { useMemo } from 'react';
import type { Activity, Bill, Budgets, Loan, PiggyBank, WalletSettings } from '../types';
import { formatMoney, fromCents, percentReached, toCents } from '../services/money';
import { totalDebtCents } from '../services/ledger';
import { safeGoalIcon } from '../services/goalIcons';
import { walletCents } from '../services/wallet';
import { upcomingBills, walletShortfall } from '../services/bills';
import { limitAt } from '../services/budgets';
import { sortBanks } from '../services/sorting';
import { monthFigures, monthKeyOf, monthStartOf } from '../services/review';
import { walletTrail } from '../services/trails';
import { noteText } from '../i18n';
import { useT } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { EntryRow } from './history/EntryRow';
import { PiggyTile } from './PiggyMark';
import { BandLabel, PageBand } from './ui/PageBand';
import { Bar, Ring, Sparkline, type ChartColor } from './ui/Charts';
import { IconTile, QuickAction } from './ui/IconTile';
import { Group } from './ui/Group';
import { Icon } from './ui/Icon';
import { EmptyState } from './ui/EmptyState';

export type MoneyAction = 'deposit' | 'withdraw' | 'move' | 'scan';

interface SavingsHomeProps {
  /** The goals that are not put away. */
  banks: PiggyBank[];
  activities: Activity[];
  loans: Loan[];
  wallet: WalletSettings;
  bills: Bill[];
  budgets: Budgets;
  /** What the goals hold together, in ringgit. */
  totalBalance: number;
  /** Bills and repayments waiting for an answer, plus unread notices. */
  waitingCount: number;
  investCents: number;
  /** Paper gain on what is held; null with nothing held. */
  gainCents: number | null;
  /** The shares' value at recent closes, oldest first. */
  investTrail: number[];
  onMoney: (action: MoneyAction) => void;
  onOpenAuto: () => void;
  onOpenBudgets: () => void;
  onOpenInvest: () => void;
  onViewAll: () => void;
  onSelectGoal: (id: string) => void;
  onAddGoal: () => void;
  onOpenProfile: () => void;
  onOpenAlerts: () => void;
  onOpenEntry?: (id: string) => void;
  onOpenTrade?: (tradeId: string) => void;
}

/** Home: what the wallet can still spend, then the money coming in, the goals and the investing. */
const SavingsHome: React.FC<SavingsHomeProps> = ({
  banks,
  activities,
  loans,
  wallet,
  bills,
  budgets,
  totalBalance,
  waitingCount,
  investCents,
  gainCents,
  investTrail,
  onMoney,
  onOpenAuto,
  onOpenBudgets,
  onOpenInvest,
  onViewAll,
  onSelectGoal,
  onAddGoal,
  onOpenProfile,
  onOpenAlerts,
  onOpenEntry,
  onOpenTrade,
}) => {
  const t = useT();
  const p = t.pro.home;
  const w = t.wallet;
  const { user } = useAuth();
  const now = new Date();
  const held = walletCents(wallet);
  const overdrawn = held < 0;
  const money = (cents: number) => formatMoney(fromCents(cents));

  const trail = useMemo(() => walletTrail(activities, held, now), [activities, held]); // eslint-disable-line react-hooks/exhaustive-deps
  const moved = trail.some((v) => v !== trail[0]);

  // Bills in the next week against what the wallet holds: said only when it is short.
  const short = walletShortfall(upcomingBills(bills, activities, now, 7), held);
  const openLoans = loans.filter((l) => l.outstanding > 0);
  const oldDebt = totalDebtCents(openLoans);

  // The month's spending against the budget. Without a budget it is only the figure.
  const spent = monthFigures(activities, monthStartOf(now), now).spentCents;
  const limit = limitAt(budgets.total, monthKeyOf(now));
  const used = limit ? Math.floor((spent / limit) * 100) : 0;
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const todayMark = Math.floor((now.getDate() / lastDay) * 100);

  // Goals keep the colour of their place in the list, whatever their rank by balance.
  const colorOf = (id: string) => ((banks.findIndex((b) => b.id === id) % 5) + 1) as ChartColor;
  const top = sortBanks(banks, { key: 'balance', dir: 'desc' }).slice(0, 4);

  const initial = (user?.displayName || user?.email || 'S').charAt(0).toUpperCase();

  return (
    <div className="flex min-h-full flex-col pb-24 font-figtree text-ink">
      <PageBand
        overlap={16}
        title={
          <span className="flex items-center gap-2.5">
            <PiggyTile size={36} />
            SavvyPiggy
          </span>
        }
        trailing={
          <span className="flex shrink-0 items-center gap-1">
            <button type="button" onClick={onOpenAlerts} aria-label={p.notifications(waitingCount)} className="relative grid size-11 place-items-center active:opacity-70">
              <Icon name="bell" size={23} strokeWidth={1.9} />
              {waitingCount > 0 && (
                <span className="absolute right-0.5 top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[#FFD060] px-1 text-[11.5px] font-extrabold leading-none text-[#14233A]">
                  {waitingCount}
                </span>
              )}
            </button>
            <button type="button" onClick={onOpenProfile} aria-label={t.profile.avatarLabel} className="grid size-11 place-items-center active:opacity-70">
              <span className="grid size-[34px] place-items-center overflow-hidden rounded-full bg-band-fg/20 text-[13px] font-extrabold">
                {user?.photoURL ? <img src={user.photoURL} alt="" className="size-full object-cover" referrerPolicy="no-referrer" /> : initial}
              </span>
            </button>
          </span>
        }
      >
        <div className="mt-2 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <BandLabel>
              {p.walletBalance}
              {overdrawn && <span className="ml-2 rounded-full bg-band-fg/20 px-2 py-0.5 text-[11.5px] font-bold text-band-fg">{w.overdrawn}</span>}
            </BandLabel>
            {/* Beside the sparkline a long figure steps down only as far as a narrow phone needs, so the digits stay. */}
            <p
              className={`mt-0.5 truncate font-bold leading-[1.15] tracking-[-0.015em] tabular-nums ${
                !moved || money(held).length <= 10 ? 'text-[36px]' : money(held).length <= 12 ? 'text-[min(36px,7.7vw)]' : 'text-[min(36px,6.6vw)]'
              }`}
            >
              {money(held)}
            </p>
          </div>
          {moved && (
            <span className="mb-1.5">
              <Sparkline values={trail} color="band-sub" width={104} height={46} dot label={p.walletTrend} />
            </span>
          )}
        </div>
      </PageBand>

      <div className="-mt-11 flex flex-col gap-2.5 px-4">
        <div className="grid grid-cols-4 rounded-3xl bg-card px-1 py-2.5 shadow-[0_2px_10px_rgba(20,35,58,0.1)]">
          <QuickAction icon="dep" tint="blue" label={p.income} onClick={() => onMoney('deposit')} />
          <QuickAction icon="swap" tint="teal" label={p.move} onClick={() => onMoney('move')} />
          <QuickAction icon="out" tint="coral" label={p.spend} onClick={() => onMoney('withdraw')} />
          <QuickAction icon="camera" tint="violet" label={p.scan} onClick={() => onMoney('scan')} />
        </div>

        {overdrawn && <p className="rounded-3xl bg-peach px-4 py-3 text-[13px] font-semibold leading-snug">{w.overdrawnNote}</p>}
        {short && (
          <button type="button" onClick={onOpenAuto} className="rounded-3xl bg-sun px-4 py-3 text-left text-[13px] font-bold leading-snug active:opacity-80">
            {t.bills.short(money(short.totalCents))}
          </button>
        )}
        {oldDebt > 0 && (
          <div className="rounded-3xl bg-sun px-4 py-3">
            <div className="flex items-baseline justify-between gap-3 text-[13.5px] font-bold">
              <span>{w.oldDebtTitle}</span>
              <span className="tabular-nums">{w.oldDebtOwed(money(oldDebt))}</span>
            </div>
            {openLoans.slice(0, 3).map((loan) => (
              <p key={loan.id} className="mt-0.5 truncate text-[12.5px] font-medium">
                {(noteText(loan.note) || t.common.spentAhead) + ' · ' + formatMoney(loan.outstanding)}
              </p>
            ))}
            <p className="mt-1 text-[12.5px] font-medium">{w.oldDebtNote}</p>
          </div>
        )}

        <button type="button" onClick={onOpenBudgets} className="block w-full rounded-3xl bg-card px-3.5 py-3 text-left active:opacity-80">
          <span className="flex items-baseline justify-between gap-2">
            <span className="text-[14.5px] font-bold">{p.budget}</span>
            <span className="truncate text-[13px] font-semibold tabular-nums text-mute">{limit ? p.spentOf(money(spent), money(limit)) : p.spentOnly(money(spent))}</span>
          </span>
          {limit ? (
            <>
              <Bar percent={used} mark={todayMark} height={10} className="mt-2.5" />
              <span className="mt-2 flex justify-between text-[12.5px] font-semibold tabular-nums text-mute">
                <span>{p.markIsToday}</span>
                <span className={spent > limit ? 'text-neg' : ''}>{spent > limit ? p.over(money(spent - limit)) : p.left(money(limit - spent))}</span>
              </span>
            </>
          ) : (
            <span className="mt-1 block text-[12.5px] font-bold text-tblue">{p.setBudget}</span>
          )}
        </button>

        {banks.length === 0 ? (
          <EmptyState icon="target" title={w.noGoals} body="" action={{ label: w.newGoal, onClick: onAddGoal }} className="rounded-3xl bg-card" />
        ) : (
          <div className="rounded-3xl bg-card px-2 pb-3 pt-1">
            <button type="button" onClick={onViewAll} className="flex min-h-9 w-full items-center justify-between gap-2 px-1.5 active:opacity-70">
              <span className="text-[14.5px] font-bold">{t.nav.goals}</span>
              <span className="flex items-center gap-0.5 text-[13px] font-semibold tabular-nums text-mute">
                {formatMoney(totalBalance)}
                <Icon name="chev" size={15} />
              </span>
            </button>
            <div className="mt-1 grid grid-cols-4">
              {top.map((bank) => {
                const percent = bank.targetAmount > 0 ? percentReached(bank.currentAmount, bank.targetAmount) : null;
                return (
                  <button key={bank.id} type="button" onClick={() => onSelectGoal(bank.id)} className="min-w-0 px-0.5 text-center active:opacity-70">
                    <Ring percent={percent} color={colorOf(bank.id)} label={percent === null ? bank.name : `${bank.name} ${percent}%`}>
                      <span className="material-symbols-rounded text-[21px] leading-none">{safeGoalIcon(bank.icon)}</span>
                    </Ring>
                    <span className="mt-1 block truncate text-[12.5px] font-bold">{bank.name}</span>
                    <span className="block truncate text-[12px] font-semibold tabular-nums text-mute">
                      {percent === null ? formatMoney(bank.currentAmount, { decimals: 0 }) : `${percent}%`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <button type="button" onClick={onOpenInvest} className="flex min-h-[66px] w-full items-center gap-2.5 rounded-3xl bg-card px-3.5 text-left active:opacity-80">
          <IconTile icon="trend" tint="violet" size={42} />
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-bold">{t.nav.invest}</span>
            {gainCents !== null && (
              <span className={`block truncate text-[12.5px] font-bold tabular-nums ${gainCents < 0 ? 'text-neg' : 'text-pos'}`}>
                {gainCents < 0 ? p.lost(money(-gainCents)) : p.earned(money(gainCents))}
              </span>
            )}
          </span>
          <Sparkline values={investTrail} color={5} />
          <span className="shrink-0 text-[15px] font-bold tabular-nums">{money(investCents)}</span>
        </button>

        {activities.length > 0 && (
          <Group>
            {activities.slice(0, 2).map((activity) => {
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
      </div>
    </div>
  );
};

export default SavingsHome;
