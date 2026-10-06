import React from 'react';
import type { Activity, PiggyBank } from '../../types';
import { Group } from '../ui/Group';
import { Icon } from '../ui/Icon';
import { EntryRow, isTrade } from './EntryRow';
import { formatMoney, fromCents } from '../../services/money';
import type { Day } from '../../services/historyDays';
import { useT } from '../../contexts/LanguageContext';
import { dateLocale } from '../../i18n';

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** "Today · 15 Sep", "Yesterday · 14 Sep", "Sun 13 Sep": the way the day reads in the list. */
export const dayHeading = (d: Date, now: Date, t: ReturnType<typeof useT>) => {
  const date = d.toLocaleDateString(dateLocale('en-GB'), { day: 'numeric', month: 'short' });
  if (sameDay(d, now)) return t.history.dayToday(date);
  if (sameDay(d, new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))) return t.history.dayYesterday(date);
  return t.history.dayOther(t.common.weekdaysShort[d.getDay()], date);
};

interface DayGroupProps {
  day: Day;
  banks: PiggyBank[];
  now: Date;
  open: boolean;
  /** Absent: the heading is plain text (a single picked day is always open). */
  onToggle?: () => void;
  onOpenEntry: (id: string) => void;
  onOpenTrade?: (tradeId: string) => void;
}

/**
 * One day of the list: a heading carrying what the day came to, and the day's
 * records in one white group. Money moved to investing is shown apart from
 * what was spent, in blue.
 */
export const DayGroup: React.FC<DayGroupProps> = ({ day, banks, now, open, onToggle, onOpenEntry, onOpenTrade }) => {
  const t = useT();
  const heading = dayHeading(day.date, now, t);
  const moved = day.sharesOut - day.sharesIn;

  const figures = (
    <span className="flex flex-wrap items-baseline justify-end gap-x-2.5 text-[12.5px] font-bold">
      {day.saved > 0 && <span className="text-pos">{formatMoney(fromCents(day.saved), { signed: true })}</span>}
      {day.spent > 0 && <span className="text-neg">{formatMoney(-fromCents(day.spent))}</span>}
      {day.sharesOut > 0 || day.sharesIn > 0 ? (
        <span className="text-info">{t.calendar.dayMoved(formatMoney(fromCents(Math.abs(moved))))}</span>
      ) : null}
    </span>
  );

  const open_ = (a: Activity) => {
    if (isTrade(a)) return a.tradeId && onOpenTrade ? () => onOpenTrade(a.tradeId as string) : undefined;
    return () => onOpenEntry(a.id);
  };

  return (
    <section className="mb-3">
      {onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="mt-3 flex min-h-11 w-full items-center gap-2 px-1 text-left"
        >
          <span className="min-w-0 flex-1 truncate text-[13px] font-extrabold">{heading}</span>
          <span className="shrink-0">
            {figures}
          </span>
          <Icon name="chev" size={16} className={`text-mute ${open ? 'rotate-90' : ''}`} />
        </button>
      ) : (
        <div className="mt-3 flex min-h-11 items-center gap-2 px-1">
          <h2 className="min-w-0 flex-1 truncate text-[13px] font-extrabold">{heading}</h2>
          {figures}
        </div>
      )}

      {open && (
        <Group>
          {day.entries.map((a) => (
            <EntryRow key={a.id} activity={a} banks={banks} onOpen={open_(a)} />
          ))}
        </Group>
      )}
    </section>
  );
};
