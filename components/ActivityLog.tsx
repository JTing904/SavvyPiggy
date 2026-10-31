import React, { useMemo, useState } from 'react';
import type { Activity, PiggyBank } from '../types';
import { useT } from '../contexts/LanguageContext';
import { dateLocale } from '../i18n';
import { dayKey } from '../services/analytics';
import { groupByDay, monthSummary } from '../services/historyDays';
import { cursorForMonth, shiftDay, shiftMonth } from '../services/monthCells';
import { monthFigures } from '../services/review';
import { useLedgerRange, type Ledger } from '../hooks/useOlderLedger';
import { formatMoney, fromCents } from '../services/money';
import { EmptyState } from './ui/EmptyState';
import { QuickAction, IconTile } from './ui/IconTile';
import { PageBand } from './ui/PageBand';
import { Icon } from './ui/Icon';
import { CalendarHeader, HistoryCalendar } from './history/HistoryCalendar';
import { DayGroup } from './history/DayGroup';
import { MonthPickerSheet } from './history/MonthPickerSheet';
import { MonthLoading } from './history/MonthLoading';

interface ActivityLogProps {
  activities: Activity[];
  /** How far back `activities` goes; an older month asks for its records. */
  ledger: Ledger;
  banks: PiggyBank[];
  /** Every row except a trade's opens in the entry sheet, which owns editing and deleting. */
  onOpenEntry: (id: string) => void;
  /**
   * A trade's row belongs to the trade: correcting or deleting it has to move
   * the goal money and the holding together, so tapping it opens the trade.
   */
  onOpenTrade?: (tradeId: string) => void;
  /** The empty History's one action. */
  onDeposit: () => void;
  onOpenReport: () => void;
  onOpenBudgets: () => void;
  onOpenBills: () => void;
  onOpenStatements: () => void;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const fromKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/**
 * History: a calendar on top (a week by default, the whole month when opened,
 * and a month picker for older months), then the records of the month, or of
 * one picked day, grouped by day.
 *
 * Only three months are live. An older month is read once when it is opened;
 * until it is here the page shows a skeleton or the notice, never a month that
 * only looks empty.
 */
const ActivityLog: React.FC<ActivityLogProps> = ({ activities, ledger, banks, onOpenEntry, onOpenTrade, onDeposit, onOpenReport, onOpenBudgets, onOpenBills, onOpenStatements }) => {
  const t = useT();
  const now = new Date();
  const today = startOfDay(now);
  const todayKey = dayKey(now);

  /** A day of the month in view: its week is the strip. */
  const [cursor, setCursor] = useState(today);
  /** "YYYY-MM-DD" of the one day the list is limited to. */
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [picker, setPicker] = useState(false);
  /** Days the person opened or closed themselves; the rest follow the default. */
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const monthStart = new Date(year, month, 1);
  const monthName = monthStart.toLocaleDateString(dateLocale('en-US'), { month: 'long', year: 'numeric' });
  const monthShort = monthStart.toLocaleDateString(dateLocale('en-US'), { month: 'short', year: 'numeric' });

  // The month in view and everything after it have to be here before it is drawn.
  const status = useLedgerRange(ledger, monthStart);
  const ready = status === 'ready';

  const days = useMemo(() => groupByDay(activities, { year, month }), [activities, year, month]);
  const dayMap = useMemo(() => new Map(days.map((d) => [d.key, d])), [days]);
  // Spent is the same figure as Home and the Report: a loan's principal leaves the wallet but is not spending.
  const summary = useMemo(
    () => ({ ...monthSummary(activities, year, month), outCents: monthFigures(activities, new Date(year, month, 1)).spentCents }),
    [activities, year, month]
  );

  const keptDay = startOfDay(ledger.keptFrom);
  const clamp = (d: Date) => (d.getTime() > today.getTime() ? today : d.getTime() < keptDay.getTime() ? keptDay : d);

  /** Header arrows: a week at a time on the strip, a month at a time on the grid. */
  const stepped = (dir: 1 | -1) => clamp(expanded ? shiftMonth(cursor, dir) : shiftDay(cursor, 7 * dir));
  const canStep = (dir: 1 | -1) => {
    const next = stepped(dir);
    return dayKey(next) !== dayKey(cursor);
  };
  const step = (dir: 1 | -1) => {
    setCursor(stepped(dir));
    setSelected(null);
  };

  const pick = (date: Date) => {
    setCursor(date);
    setSelected(dayKey(date));
  };
  const stepDay = (dir: 1 | -1) => {
    if (!selected) return;
    const next = shiftDay(fromKey(selected), dir);
    if (next.getTime() > today.getTime() || next.getTime() < keptDay.getTime()) return;
    pick(next);
  };

  const goToday = () => {
    setCursor(today);
    setSelected(null);
  };

  // Today is open when it has entries; otherwise the newest day is, so the list never opens on a wall of closed rows.
  const todayHasEntries = days.some((d) => d.key === todayKey);
  const isOpen = (key: string, index: number) =>
    selected !== null || (toggled[key] ?? (key === todayKey || (!todayHasEntries && index === 0)));
  const toggle = (key: string, index: number) => setToggled((prev) => ({ ...prev, [key]: !isOpen(key, index) }));

  const shown = selected ? days.filter((d) => d.key === selected) : days;
  const selectedDate = selected ? fromKey(selected) : null;
  const selectedLabel = selectedDate
    ? selectedDate.toLocaleDateString(dateLocale('en-GB'), { weekday: 'short', day: 'numeric', month: 'short' })
    : '';
  const canPrevDay = !!selectedDate && shiftDay(selectedDate, -1).getTime() >= keptDay.getTime();
  const canNextDay = !!selectedDate && shiftDay(selectedDate, 1).getTime() <= today.getTime();

  return (
    <div className="flex min-h-full flex-col pb-24 font-figtree text-ink">
      <PageBand title={t.history.title} overlap={16} />
      <div className="-mt-[58px] grid grid-cols-2 gap-2 px-4">
        <div className="flex items-center gap-2.5 rounded-3xl bg-card p-3 shadow-[0_2px_10px_rgba(20,35,58,0.1)]">
          <IconTile icon="dep" tint="teal" size={36} />
          <span className="min-w-0">
            <span className="block text-[12.5px] font-semibold text-mute">{t.pro.records.income}</span>
            <span className="block truncate text-[15.5px] font-bold tabular-nums">{formatMoney(fromCents(summary.inCents))}</span>
          </span>
        </div>
        <div className="flex items-center gap-2.5 rounded-3xl bg-card p-3 shadow-[0_2px_10px_rgba(20,35,58,0.1)]">
          <IconTile icon="out" tint="coral" size={36} />
          <span className="min-w-0">
            <span className="block text-[12.5px] font-semibold text-mute">{t.pro.records.spent}</span>
            <span className="block truncate text-[15.5px] font-bold tabular-nums">{formatMoney(fromCents(summary.outCents))}</span>
          </span>
        </div>
      </div>

      <div className="flex flex-col px-4">
      <div className="mt-2.5 grid grid-cols-4 rounded-3xl bg-card px-1 py-2.5">
        <QuickAction icon="chart" tint="blue" label={t.pro.records.report} onClick={onOpenReport} />
        <QuickAction icon="pie" tint="teal" label={t.pro.records.budgets} onClick={onOpenBudgets} />
        <QuickAction icon="doc" tint="amber" label={t.pro.records.bills} onClick={onOpenBills} />
        <QuickAction icon="dep" tint="violet" label={t.pro.records.exports} onClick={onOpenStatements} />
      </div>

      <CalendarHeader
        title={monthShort}
        expanded={expanded}
        canPrev={canStep(-1)}
        canNext={canStep(1)}
        onTitle={() => setPicker(true)}
        onToday={goToday}
        onPrev={() => step(-1)}
        onNext={() => step(1)}
        onToggle={() => setExpanded((v) => !v)}
      />

      <HistoryCalendar
        cursor={cursor}
        now={now}
        selected={selected}
        expanded={expanded}
        days={dayMap}
        loading={!ready}
        notBefore={ledger.keptFrom}
        onPick={pick}
        summary={summary}
      />

      {!ready ? (
        <MonthLoading status={status === 'failed' ? 'failed' : 'loading'} month={monthName} onRetry={ledger.retry} />
      ) : (
        <>
          {selectedDate && (
            <div className="mt-3 flex items-center gap-1">
              <button
                type="button"
                onClick={() => stepDay(-1)}
                disabled={!canPrevDay}
                aria-label={t.calendar.previousDay}
                className={`grid size-11 shrink-0 place-items-center rounded-full ${canPrevDay ? 'active:opacity-70' : 'opacity-30'}`}
              >
                <Icon name="left" size={18} />
              </button>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label={t.calendar.clearDay(selectedLabel)}
                className="inline-flex min-h-11 min-w-0 items-center gap-2 rounded-full bg-cta py-1.5 pl-4 pr-2 text-[12.5px] font-extrabold text-cta-fg active:opacity-80"
              >
                <span className="truncate">{selectedLabel}</span>
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-cta-fg/25" aria-hidden="true">
                  <Icon name="close" size={10} strokeWidth={2.4} />
                </span>
              </button>
              <button
                type="button"
                onClick={() => stepDay(1)}
                disabled={!canNextDay}
                aria-label={t.calendar.nextDay}
                className={`grid size-11 shrink-0 place-items-center rounded-full ${canNextDay ? 'active:opacity-70' : 'opacity-30'}`}
              >
                <Icon name="right" size={18} />
              </button>
              <span className="ml-auto shrink-0 text-[12px] font-bold text-mute">
                {t.calendar.entryCount(shown.reduce((n, d) => n + d.entries.length, 0))}
              </span>
            </div>
          )}

          {activities.length === 0 ? (
            <EmptyState
              icon="hist"
              title={t.calendar.emptyAllTitle}
              body={t.calendar.emptyAllBody}
              action={{ label: t.calendar.emptyAllAction, onClick: onDeposit }}
              className="mt-6"
            />
          ) : shown.length === 0 ? (
            selected ? (
              <EmptyState
                icon="hist"
                title={t.calendar.emptyDayTitle}
                body={t.calendar.emptyDayBody}
                action={{ label: t.calendar.showWholeMonth, onClick: () => setSelected(null) }}
                className="mt-4"
              />
            ) : (
              <EmptyState
                icon="hist"
                title={t.calendar.emptyMonthTitle(monthName)}
                body={t.calendar.emptyMonthBody}
                action={{ label: t.common.today, onClick: goToday }}
                className="mt-4"
              />
            )
          ) : (
            <div className="mt-1">
              {shown.map((day, i) => (
                <DayGroup
                  key={day.key}
                  day={day}
                  banks={banks}
                  now={now}
                  open={isOpen(day.key, i)}
                  onToggle={selected ? undefined : () => toggle(day.key, i)}
                  onOpenEntry={onOpenEntry}
                  onOpenTrade={onOpenTrade}
                />
              ))}
            </div>
          )}
        </>
      )}

      {picker && (
        <MonthPickerSheet
          current={{ year, month }}
          keptFrom={ledger.keptFrom}
          liveFrom={ledger.liveFrom}
          loadedFrom={ledger.loadedFrom}
          now={now}
          onPick={(y, m) => {
            setCursor(clamp(cursorForMonth(y, m, now)));
            setSelected(null);
            setPicker(false);
          }}
          onClose={() => setPicker(false)}
        />
      )}
      </div>
    </div>
  );
};

export default ActivityLog;
