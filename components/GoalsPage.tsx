import React from 'react';
import type { PiggyBank } from '../types';
import { formatMoney, percentReached, toCents } from '../services/money';
import { safeGoalIcon } from '../services/goalIcons';
import { sortBanks } from '../services/sorting';
import { useT } from '../contexts/LanguageContext';
import { Bar, Donut, Swatch, type ChartColor } from './ui/Charts';
import { IconTile, TINT_ORDER } from './ui/IconTile';
import { PageBand } from './ui/PageBand';
import { EmptyState } from './ui/EmptyState';
import { Icon } from './ui/Icon';

interface GoalsPageProps {
  /** The goals that are not put away. */
  banks: PiggyBank[];
  totalBalance: number;
  onSelectGoal: (id: string) => void;
  onAddGoal: () => void;
  onMove: () => void;
  onOpenStrategy: () => void;
}

/** The goals: where the money sits, then each one and how far along it is. */
const GoalsPage: React.FC<GoalsPageProps> = ({ banks, totalBalance, onSelectGoal, onAddGoal, onMove, onOpenStrategy }) => {
  const t = useT();
  const p = t.pro.goals;
  const orderOf = (id: string) => banks.findIndex((b) => b.id === id) % 5;
  const colorOf = (id: string) => (orderOf(id) + 1) as ChartColor;
  const sorted = sortBanks(banks, { key: 'balance', dir: 'desc' });
  const positive = sorted.filter((b) => b.currentAmount > 0);
  const totalCents = positive.reduce((sum, b) => sum + toCents(b.currentAmount), 0);
  const shareOf = (b: PiggyBank) => (totalCents > 0 ? Math.round((toCents(b.currentAmount) / totalCents) * 100) : 0);
  const legend = positive.slice(0, 5);

  return (
    <div className="flex min-h-full flex-col pb-24 font-figtree text-ink">
      <PageBand
        title={t.nav.goals}
        overlap={16}
        trailing={
          <button type="button" onClick={onAddGoal} className="-mr-2 flex min-h-11 shrink-0 items-center gap-1 px-2 text-[14px] font-bold active:opacity-70">
            <Icon name="plus" size={19} strokeWidth={2.4} />
            {t.wallet.newGoal}
          </button>
        }
      />
      <div className="-mt-[58px] flex flex-col gap-2.5 px-4">
        {banks.length === 0 ? (
          <EmptyState icon="target" title={t.wallet.noGoals} body="" action={{ label: t.wallet.newGoal, onClick: onAddGoal }} className="rounded-3xl bg-card shadow-[0_2px_10px_rgba(20,35,58,0.1)]" />
        ) : (
          <>
            <div className="flex items-center gap-3.5 rounded-3xl bg-card p-3.5 shadow-[0_2px_10px_rgba(20,35,58,0.1)]">
              <Donut
                slices={positive.map((b) => ({ value: toCents(b.currentAmount), color: colorOf(b.id) }))}
                label={p.donut(legend.map((b) => `${b.name} ${shareOf(b)}%`).join('，'))}
              >
                <span className="block text-[11px] font-semibold leading-tight text-mute">{p.total}</span>
                <span className="block text-[14.5px] font-bold tabular-nums">{formatMoney(totalBalance, { decimals: 0 })}</span>
              </Donut>
              <div className="min-w-0 flex-1 text-[13.5px] font-semibold">
                {legend.map((b) => (
                  <div key={b.id} className="flex items-center gap-2 py-1">
                    <Swatch color={colorOf(b.id)} />
                    <span className="min-w-0 flex-1 truncate">{b.name}</span>
                    <span className="text-mute tabular-nums">{shareOf(b)}%</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={onMove} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-card text-[14px] font-bold active:opacity-80">
                <Icon name="swap" size={20} strokeWidth={2} className="text-tteal" />
                {t.pro.home.move}
              </button>
              <button type="button" onClick={onOpenStrategy} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-card text-[14px] font-bold active:opacity-80">
                <Icon name="pie" size={20} strokeWidth={2} className="text-tblue" />
                {p.changeSplit}
              </button>
            </div>

            <div className="divide-y divide-line/10 rounded-3xl bg-card px-3.5 py-1">
              {sorted.map((bank) => {
                const hasTarget = bank.targetAmount > 0;
                const percent = hasTarget ? percentReached(bank.currentAmount, bank.targetAmount) : null;
                return (
                  <button key={bank.id} type="button" onClick={() => onSelectGoal(bank.id)} className="flex min-h-[72px] w-full items-center gap-3 py-2 text-left active:opacity-70">
                    <IconTile
                      icon={<span className="material-symbols-rounded text-[23px] leading-none">{safeGoalIcon(bank.icon)}</span>}
                      tint={TINT_ORDER[orderOf(bank.id)]}
                      size={44}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2 text-[15px] font-bold">
                        <span className="min-w-0 truncate">{bank.name}</span>
                        <span className="shrink-0 tabular-nums">{hasTarget ? `${percent}%` : formatMoney(bank.currentAmount)}</span>
                      </span>
                      {hasTarget ? (
                        <>
                          <Bar percent={percent ?? 0} color={colorOf(bank.id)} className="mt-1.5" height={7} />
                          <span className="mt-1.5 flex justify-between gap-2 text-[12.5px] font-semibold tabular-nums text-mute">
                            <span className="truncate">{p.ofTarget(formatMoney(bank.currentAmount), formatMoney(bank.targetAmount))}</span>
                            {bank.splitPercentage > 0 && <span className="shrink-0">{p.share(bank.splitPercentage)}</span>}
                          </span>
                        </>
                      ) : (
                        <span className="mt-0.5 flex justify-between gap-2 text-[12.5px] font-semibold text-mute">
                          <span>{p.noTarget}</span>
                          {bank.splitPercentage > 0 && <span className="shrink-0">{p.share(bank.splitPercentage)}</span>}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default GoalsPage;
