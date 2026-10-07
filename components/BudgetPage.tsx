import React, { useMemo, useState } from 'react';
import type { Activity, Budgets } from '../types';
import { budgetRows, limitAt, TOTAL } from '../services/budgets';
import { CATEGORIES, categoryOf } from '../services/categories';
import { formatMoney, fromCents } from '../services/money';
import { monthFigures, monthKeyOf } from '../services/review';
import { useT } from '../contexts/LanguageContext';
import { Chip } from './ui/Chip';
import { Icon } from './ui/Icon';
import { Meter } from './ui/Meter';
import BudgetSheet from './BudgetSheet';

interface BudgetPageProps {
  activities: Activity[];
  budgets: Budgets;
  onBack: () => void;
  /** `target` is `TOTAL` or a category key; `from` is "2026-10"; 0 takes the limit away. */
  onSave: (target: string, from: string, cents: number) => void | Promise<void>;
}

/** This month's limits and how far each is used, with a way to set or change any of them. */
const BudgetPage: React.FC<BudgetPageProps> = ({ activities, budgets, onBack, onSave }) => {
  const t = useT();
  const v = t.review;
  const [editing, setEditing] = useState<string | null>(null);

  const now = new Date();
  const month = monthKeyOf(now);
  const fig = useMemo(() => monthFigures(activities, now, now), [activities]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => budgetRows(budgets, month, fig.categories, fig.spentCents), [budgets, month, fig]);
  const totalRow = rows.find((row) => row.key === TOTAL);
  const categoryRows = rows.filter((row) => row.key !== TOTAL);
  const money = (cents: number) => formatMoney(fromCents(cents));
  const monthName = t.report.monthsLong[now.getMonth()];

  // Categories with nothing spent and nothing set, offered as the next one to add.
  const shown = new Set(categoryRows.map((row) => row.key));
  const addable = CATEGORIES.filter((c) => !shown.has(c.key));

  return (
    <div className="flex min-h-full flex-col px-4 pb-40 pt-3 safe-pt font-figtree text-ink">
      <div className="flex items-center gap-3 px-1">
        <button type="button" onClick={onBack} aria-label={t.common.back} className="grid size-11 place-items-center rounded-full bg-card active:opacity-80">
          <Icon name="back" size={20} />
        </button>
      </div>
      <h1 className="mt-1 px-1 text-[30px] font-extrabold tracking-tight">{v.budgetsPageTitle}</h1>
      <p className="mt-1 px-1 text-[13.5px] font-medium leading-relaxed text-mute">{v.budgetsIntro}</p>

      <h2 className="mt-6 px-1 text-[15px] font-extrabold text-mute">{v.monthBudget(monthName)}</h2>

      <button
        type="button"
        onClick={() => setEditing(TOTAL)}
        className="mt-2 block w-full rounded-3xl bg-card p-5 text-left active:opacity-80"
      >
        {totalRow && totalRow.limitCents !== null ? (
          <>
            <span className="flex items-baseline justify-between gap-3">
              <span className="text-[12.5px] font-bold text-mute">{v.totalBudget}</span>
              <span className="flex items-center gap-0.5 text-[12.5px] font-bold text-mute">
                {v.changeIt}
                <Icon name="chev" size={14} />
              </span>
            </span>
            <span className="mt-1 block text-[24px] font-extrabold tabular-nums">
              {money(totalRow.spentCents)} <span className="text-[15px] font-bold text-mute">/ {money(totalRow.limitCents)}</span>
            </span>
            <Meter percent={totalRow.used ?? 0} status={totalRow.status} label={v.totalBudget} className="mt-2.5" />
            <span className={`mt-1.5 block text-[12px] font-semibold ${totalRow.status === 'over' ? 'text-neg' : 'text-mute'}`}>
              {(totalRow.leftCents ?? 0) >= 0 ? v.budgetLeft(money(totalRow.leftCents ?? 0)) : v.budgetOver(money(-(totalRow.leftCents ?? 0)))}
            </span>
          </>
        ) : (
          <span className="flex items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-[15px] font-extrabold">{v.totalNotSet}</span>
              <span className="mt-0.5 block text-[12.5px] font-medium text-mute">
                {totalRow ? v.spentWithoutLimit(money(totalRow.spentCents)) : v.totalNotSetHint}
              </span>
            </span>
            <span className="shrink-0 rounded-full bg-cta px-4 py-2 text-[13px] font-extrabold text-cta-fg">{v.setIt}</span>
          </span>
        )}
      </button>

      <h2 className="mt-6 px-1 text-[15px] font-extrabold text-mute">{v.categoriesTitle}</h2>
      {categoryRows.length === 0 ? (
        <p className="mt-2 rounded-3xl bg-card px-5 py-6 text-center text-[13px] font-semibold text-mute">{v.noCategoryYet}</p>
      ) : (
        <div className="mt-2 divide-y divide-line/10 rounded-3xl bg-card px-4 py-1">
          {categoryRows.map((row) => (
            <button key={row.key} type="button" onClick={() => setEditing(row.key)} className="block w-full py-3.5 text-left active:opacity-70">
              <span className="flex items-baseline justify-between gap-3 text-[14.5px] font-bold">
                <span className="min-w-0 truncate">
                  {categoryOf(row.key).label}
                  {row.limitCents !== null && (
                    <span
                      className={`ml-2 rounded-full px-2 py-0.5 align-middle text-[10.5px] font-extrabold ${
                        row.status === 'over' ? 'bg-peach text-neg' : row.status === 'near' ? 'bg-sun' : 'bg-mint text-pos'
                      }`}
                    >
                      {row.status === 'over' ? v.overTag : v.usedPct(row.used ?? 0)}
                    </span>
                  )}
                </span>
                <span className={`shrink-0 whitespace-nowrap font-extrabold tabular-nums ${row.status === 'over' ? 'text-neg' : ''}`}>
                  {money(row.spentCents)}
                  {row.limitCents !== null && <span className="font-bold text-mute"> / {money(row.limitCents)}</span>}
                </span>
              </span>
              {row.limitCents !== null ? (
                <>
                  <Meter percent={row.used ?? 0} status={row.status} label={categoryOf(row.key).label} className="mt-2" />
                  <span className={`mt-1 block text-[12px] font-medium ${row.status === 'over' ? 'text-neg' : 'text-mute'}`}>
                    {(row.leftCents ?? 0) >= 0 ? v.budgetLeft(money(row.leftCents ?? 0)) : v.budgetOver(money(-(row.leftCents ?? 0)))}
                  </span>
                </>
              ) : (
                <span className="mt-1 flex items-center justify-between text-[12px] font-medium text-mute">
                  <span>{v.noBudget}</span>
                  <span className="font-extrabold text-ink">{v.setIt}</span>
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {addable.length > 0 && (
        <>
          <p className="mb-2 mt-5 px-1 text-[12.5px] font-bold text-mute">{v.addCategoryBudget}</p>
          <div className="flex flex-wrap gap-2">
            {addable.map((c) => (
              <Chip key={c.key} onClick={() => setEditing(c.key)}>
                {c.label}
              </Chip>
            ))}
          </div>
        </>
      )}

      {editing && (
        <BudgetSheet
          target={editing}
          current={limitAt(editing === TOTAL ? budgets.total : budgets.categories[editing], month)}
          now={now}
          onSave={(cents, from) => onSave(editing, from, cents)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
};

export default BudgetPage;
