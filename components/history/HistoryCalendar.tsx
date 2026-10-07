import React from 'react';
import { Icon } from '../ui/Icon';
import { useT } from '../../contexts/LanguageContext';
import { dateLocale } from '../../i18n';
import { dayKey } from '../../services/analytics';
import { dotsFor, monthDays, weekOf, type Day } from '../../services/historyDays';
import { formatMoney, fromCents } from '../../services/money';

/* ------------------------------------------------------------------ header */

/** The 44dp slot around a 34px round button, so the touch target is large and the look matches the mockup. */
const IconButton: React.FC<{
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  children: React.ReactNode;
}> = ({ label, onClick, disabled, pressed, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    aria-pressed={pressed}
    className={`grid size-11 shrink-0 place-items-center ${disabled ? 'opacity-30' : 'active:opacity-70'}`}
  >
    <span
      className={`grid size-[34px] place-items-center rounded-full ${pressed ? 'bg-cta text-cta-fg' : 'bg-card text-ink'}`}
    >
      {children}
    </span>
  </button>
);

interface CalendarHeaderProps {
  /** "Sep 2026". */
  title: string;
  expanded: boolean;
  canPrev: boolean;
  canNext: boolean;
  onTitle: () => void;
  onToday: () => void;
  onPrev: () => void;
  onNext: () => void;
  onToggle: () => void;
}

/** Month title (opens the month picker), Today, previous / next, and the week / month toggle. */
export const CalendarHeader: React.FC<CalendarHeaderProps> = ({
  title,
  expanded,
  canPrev,
  canNext,
  onTitle,
  onToday,
  onPrev,
  onNext,
  onToggle,
}) => {
  const t = useT();
  return (
    <div className="mb-2 mt-1 flex items-center gap-0.5">
      <button
        type="button"
        onClick={onTitle}
        aria-label={`${t.calendar.pickMonth}: ${title}`}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-1 text-left text-[20px] font-extrabold tracking-[-0.03em] active:opacity-70"
      >
        <span className="truncate">{title}</span>
        <Icon name="chev" size={16} className="shrink-0 rotate-90 text-mute" />
      </button>
      <button
        type="button"
        onClick={onToday}
        className="mx-0.5 min-h-11 shrink-0 px-1 text-[12.5px] font-extrabold active:opacity-70"
      >
        <span className="grid h-[34px] place-items-center rounded-full bg-card px-3.5">{t.common.today}</span>
      </button>
      <IconButton label={expanded ? t.calendar.previousMonth : t.calendar.previousWeek} onClick={onPrev} disabled={!canPrev}>
        <Icon name="left" size={17} />
      </IconButton>
      <IconButton label={expanded ? t.calendar.nextMonth : t.calendar.nextWeek} onClick={onNext} disabled={!canNext}>
        <Icon name="right" size={17} />
      </IconButton>
      <IconButton label={expanded ? t.calendar.showWeek : t.calendar.showMonth} onClick={onToggle} pressed={expanded}>
        <Icon name="calx" size={18} />
      </IconButton>
    </div>
  );
};

/* -------------------------------------------------------------------- grid */

interface CalendarProps {
  /** Any day of the month in view; its week is the strip. */
  cursor: Date;
  now: Date;
  /** "YYYY-MM-DD" of the picked day, if one is. */
  selected: string | null;
  expanded: boolean;
  /** Days of the month in view, by key, for the dots. */
  days: Map<string, Day>;
  /** The month's records are not all here yet: no dots, no taps, placeholders instead of numbers. */
  loading: boolean;
  /** Days before this cannot be picked (the retention cutoff's day). */
  notBefore: Date;
  onPick: (date: Date) => void;
  /** The month's line, shown under the open grid. Omitted while loading. */
  summary?: { inCents: number; outCents: number; movedCents: number } | null;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** What a day's dots mean, in words, for the cell's label. */
const kindsText = (dots: { in: boolean; out: boolean; invest: boolean }, t: ReturnType<typeof useT>) =>
  [dots.in && t.calendar.kindIn, dots.out && t.calendar.kindOut, dots.invest && t.calendar.kindMoved]
    .filter(Boolean)
    .join(t.calendar.kindJoin);

/**
 * The calendar: a one-row week by default, the whole month when opened. Dots
 * under a day are green (money in), red (spending) and blue (moved to
 * investing); each cell also says the same in words for a screen reader. A
 * day of another month is dimmed and carries no dots, because that month's
 * records are not the ones on screen.
 */
export const HistoryCalendar: React.FC<CalendarProps> = ({
  cursor,
  now,
  selected,
  expanded,
  days,
  loading,
  notBefore,
  onPick,
  summary,
}) => {
  const t = useT();
  const today = dayKey(now);
  const floor = startOfDay(notBefore).getTime();
  const ceiling = startOfDay(now).getTime();
  const inView = (d: Date) => d.getFullYear() === cursor.getFullYear() && d.getMonth() === cursor.getMonth();

  const cell = (date: Date, key: string) => {
    const mine = inView(date);
    const day = mine ? days.get(dayKey(date)) : undefined;
    const dots = day ? dotsFor(day) : { in: false, out: false, invest: false };
    const isToday = dayKey(date) === today;
    const isPicked = dayKey(date) === selected;
    const outOfRange = date.getTime() > ceiling || date.getTime() < floor;
    const label = date.toLocaleDateString(dateLocale('en-GB'), { weekday: 'short', day: 'numeric', month: 'short' });
    const aria = day ? t.calendar.dayEntries(label, day.entries.length, kindsText(dots, t)) : t.calendar.dayNone(label);

    // Literal classes only: the ring and the fill are told apart by what the day is.
    const bubble = isToday
      ? isPicked
        ? 'bg-cta text-cta-fg ring-2 ring-ink ring-offset-2 ring-offset-card'
        : 'bg-cta text-cta-fg'
      : isPicked
        ? 'ring-2 ring-ink'
        : '';

    return (
      <button
        key={key}
        type="button"
        disabled={loading || outOfRange}
        onClick={() => onPick(date)}
        aria-label={loading ? label : aria}
        aria-pressed={isPicked}
        aria-current={isToday ? 'date' : undefined}
        className={`relative flex flex-col items-center pt-1 ${expanded ? 'h-[46px]' : 'h-[52px]'} ${
          mine ? '' : 'opacity-40'
        } ${outOfRange && !loading ? 'opacity-30' : ''} active:opacity-70 disabled:active:opacity-100`}
      >
        {loading ? (
          <span className="size-7 animate-pulse rounded-full bg-line/10 motion-reduce:animate-none" aria-hidden="true" />
        ) : (
          <span className={`grid size-7 place-items-center rounded-full text-[13px] font-bold ${bubble}`} aria-hidden="true">
            {date.getDate()}
          </span>
        )}
        <span className="mt-[3px] flex h-[5px] gap-[3px]" aria-hidden="true">
          {!loading && dots.in && <i className="block size-[5px] rounded-full bg-pos" />}
          {!loading && dots.out && <i className="block size-[5px] rounded-full bg-neg" />}
          {!loading && dots.invest && <i className="block size-[5px] rounded-full bg-info" />}
        </span>
      </button>
    );
  };

  return (
    <div className="rounded-3xl bg-card px-2.5 pb-2 pt-2.5 text-ink">
      <div className="grid grid-cols-7 text-center" aria-hidden="true">
        {t.common.weekdaysNarrow.map((d, i) => (
          <span key={i} className="pb-1.5 pt-0.5 text-[10.5px] font-bold text-mute">
            {d}
          </span>
        ))}
      </div>

      {expanded ? (
        <div className="grid grid-cols-7" role="group" aria-label={cursor.toLocaleDateString(dateLocale('en-GB'), { month: 'long', year: 'numeric' })}>
          {monthDays(cursor.getFullYear(), cursor.getMonth()).flat().map((date, i) =>
            date ? cell(date, dayKey(date)) : <span key={`blank-${i}`} className="h-[46px]" aria-hidden="true" />
          )}
        </div>
      ) : (
        <div className="grid grid-cols-7">
          {weekOf(cursor).map((date) => cell(date, dayKey(date)))}
        </div>
      )}

      {expanded && summary && !loading && (
        <p className="mt-1 flex flex-wrap justify-between gap-x-3 gap-y-1 border-t border-line/10 px-2 pb-1 pt-2 text-[12px] font-bold">
          <span className="text-pos">{t.calendar.summaryIn(formatMoney(fromCents(summary.inCents)))}</span>
          <span className="text-neg">{t.calendar.summaryOut(formatMoney(fromCents(summary.outCents)))}</span>
          {summary.movedCents !== 0 && (
            <span className="text-info">
              {summary.movedCents > 0
                ? t.calendar.summaryMoved(formatMoney(fromCents(summary.movedCents)))
                : t.calendar.summaryBack(formatMoney(fromCents(-summary.movedCents)))}
            </span>
          )}
        </p>
      )}
    </div>
  );
};
