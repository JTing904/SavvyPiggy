import React, { useMemo, useState } from 'react';
import type { Activity, Budgets } from '../types';
import { budgetRows, limitAt, TOTAL, type BudgetStatus } from '../services/budgets';
import { CATEGORIES, categoryOf } from '../services/categories';
import { formatMoney, fromCents } from '../services/money';
import { monthFigures, monthKeyOf } from '../services/review';
import { useT } from '../contexts/LanguageContext';
import { Bar, Ring, type ChartColor } from './ui/Charts';
import { Chip } from './ui/Chip';
import { IconTile, TINT_ORDER } from './ui/IconTile';
import { PageBand } from './ui/PageBand';
import BudgetSheet from './BudgetSheet';

interface BudgetPageProps {
  activities: Activity[];
  budgets: Budgets;
  onBack: () => void;
  /** `target` is `TOTAL` or a category key; `from` is "2026-10"; 0 takes the limit away. */
  onSave: (target: string, from: string, cents: number) => void | Promise<void>;
}

/** The ring's colour says where the month stands; the figures beside it say the same. */
const STATUS_COLOR: Partial<Record<BudgetStatus, ChartColor>> = { near: 3, over: 4 };

/** This month's limits and how far each is used, with a way to set or change any of them. */
const BudgetPage: React.FC<BudgetPageProps> = ({ activities, budgets, onBack, onSave }) => {
  const t = useT();
  const v = t.review;
  const p = t.pro.budget;
  const [editing, setEditing] = useState<string | null>(null);

  const now = new Date();
  const month = monthKeyOf(now);
  const fig = useMemo(() => monthFigures(activities, now, now), [activities]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => budgetRows(budgets, month, fig.categories, fig.spentCents), [budgets, month, fig]);
  const totalRow = rows.find((row) => row.key === TOTAL);
  const categoryRows = rows.filter((row) => row.key !== TOTAL);
  const money = (cents: number) => formatMoney(fromCents(cents));
  const plain = (cents: number) => formatMoney(fromCents(cents), { symbol: false });
  const monthName = t.report.monthsLong[now.getMonth()];

  // Categories with nothing spent and nothing set, offered as the next one to add.
  const shown = new Set(categoryRows.map((row) => row.key));
  const addable = CATEGORIES.filter((c) => !shown.has(c.key));

  return (
    <div className="flex min-h-full flex-col pb-40 font-figtree text-ink">
      <PageBand
        title={v.budgetsPageTitle}
        onBack={onBack}
        overlap={16}
        trailing={
          <button type="button" onClick={() => setEditing(TOTAL)} className="-mr-2 min-h-11 shrink-0 px-2 text-[14px] font-bold active:opacity-70">
            {totalRow && totalRow.limitCents !== null ? v.changeIt : v.setIt}
          </button>
        }
      />

      <div className="-mt-[58px] flex flex-col gap-2.5 px-4">
        <button type="button" onClick={() => setEditing(TOTAL)} className="block w-full rounded-3xl bg-card p-3.5 text-left shadow-[0_2px_10px_rgba(20,35,58,0.1)] active:opacity-80">
          <span className="mb-2 block text-[13.5px] font-semibold text-mute">{v.monthBudget(monthName)}</span>
          {totalRow && totalRow.limitCents !== null ? (
            <span className="flex items-center gap-4">
              <Ring percent={totalRow.used ?? 0} color={STATUS_COLOR[totalRow.status] ?? 1} size={104} width={12} label={`${v.totalBudget} ${v.usedPct(totalRow.used ?? 0)}`}>
                <span className="block text-[21px] font-bold leading-tight tabular-nums">{v.usedPct(totalRow.used ?? 0)}</span>
                <span className="block text-[11px] font-semibold leading-tight text-mute">{p.used}</span>
              </Ring>
              <span className="min-w-0 flex-1 text-[14px] font-semibold tabular-nums">
                <span className="flex items-baseline justify-between gap-2 py-1">
                  <span className="min-w-0 truncate text-mute">{p.limit}</span>
                  <span className="shrink-0 font-bold">{plain(totalRow.limitCents)}</span>
                </span>
                <span className="flex items-baseline justify-between gap-2 py-1">
                  <span className="min-w-0 truncate text-mute">{p.spent}</span>
                  <span className="shrink-0 font-bold">{plain(totalRow.spentCents)}</span>
                </span>
                <span className={`flex items-baseline justify-between gap-2 py-1 ${totalRow.status === 'over' ? 'text-neg' : ''}`}>
                  <span className={`min-w-0 truncate ${totalRow.status === 'over' ? '' : 'text-mute'}`}>{(totalRow.leftCents ?? 0) >= 0 ? p.left : v.overTag}</span>
                  <span className="shrink-0 font-bold">{plain(Math.abs(totalRow.leftCents ?? 0))}</span>
                </span>
              </span>
            </span>
          ) : (
            <span className="flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-[15px] font-bold">{v.totalNotSet}</span>
                <span className="mt-0.5 block text-[12.5px] font-medium text-mute">
                  {totalRow ? v.spentWithoutLimit(money(totalRow.spentCents)) : v.totalNotSetHint}
                </span>
              </span>
              <span className="flex min-h-11 shrink-0 items-center rounded-xl bg-cta px-4 text-[13.5px] font-bold text-cta-fg">{v.setIt}</span>
            </span>
          )}
        </button>

        <p className="px-1 text-[13px] font-medium leading-relaxed text-mute">{v.budgetsIntro}</p>

        <h2 className="mt-1 px-1 text-[15px] font-bold">{v.categoriesTitle}</h2>
        {categoryRows.length === 0 ? (
          <p className="rounded-3xl bg-card px-5 py-6 text-center text-[13px] font-semibold text-mute">{v.noCategoryYet}</p>
        ) : (
          <div className="divide-y divide-line/10 rounded-3xl bg-card px-3.5 py-1">
            {categoryRows.map((row, i) => {
              const category = categoryOf(row.key);
              return (
                <button key={row.key} type="button" onClick={() => setEditing(row.key)} className="flex min-h-[66px] w-full items-center gap-2.5 py-2 text-left active:opacity-70">
                  <IconTile
                    icon={<span className="material-symbols-rounded text-[20px] leading-none">{category.icon}</span>}
                    tint={TINT_ORDER[i % TINT_ORDER.length]}
                    size={38}
                    round
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2 text-[14.5px] font-bold tabular-nums">
                      <span className="min-w-0 truncate">
                        {category.label}
                        {row.limitCents !== null && (
                          <span
                            className={`ml-1.5 rounded-md px-1.5 py-0.5 align-middle text-[11.5px] font-bold ${
                              row.status === 'over' ? 'bg-peach text-neg' : row.status === 'near' ? 'bg-sun' : 'bg-mint text-pos'
                            }`}
                          >
                            {row.status === 'over' ? v.overTag : v.usedPct(row.used ?? 0)}
                          </span>
                        )}
                      </span>
                      <span className={`shrink-0 whitespace-nowrap ${row.status === 'over' ? 'text-neg' : ''}`}>
                        {plain(row.spentCents)}
                        {row.limitCents !== null && <span className="text-[12.5px] font-semibold text-mute"> / {plain(row.limitCents)}</span>}
                      </span>
                    </span>
                    {row.limitCents !== null ? (
                      <>
                        <Bar percent={row.used ?? 0} color={((i % 5) + 1) as ChartColor} height={7} className="mt-1.5" />
                        <span className={`mt-1 block text-[12.5px] font-semibold ${row.status === 'over' ? 'text-neg' : 'text-mute'}`}>
                          {(row.leftCents ?? 0) >= 0 ? v.budgetLeft(money(row.leftCents ?? 0)) : v.budgetOver(money(-(row.leftCents ?? 0)))}
                        </span>
                      </>
                    ) : (
                      <span className="mt-0.5 flex items-center justify-between text-[12.5px] font-semibold text-mute">
                        <span>{v.noBudget}</span>
                        <span className="font-bold text-tblue">{v.setIt}</span>
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {addable.length > 0 && (
          <>
            <p className="mt-1 px-1 text-[13.5px] font-semibold text-mute">{v.addCategoryBudget}</p>
            <div className="flex flex-wrap gap-2">
              {addable.map((c) => (
                <Chip key={c.key} onClick={() => setEditing(c.key)}>
                  {c.label}
                </Chip>
              ))}
            </div>
          </>
        )}
      </div>

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
