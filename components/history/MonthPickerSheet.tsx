import React, { useState } from 'react';
import { Sheet } from '../ui/Sheet';
import { Icon } from '../ui/Icon';
import { useT } from '../../contexts/LanguageContext';
import { dateLocale } from '../../i18n';
import { monthCellState, yearRange, type MonthCellState } from '../../services/monthCells';

interface MonthPickerSheetProps {
  /** The month being looked at: its year opens first and it is the filled cell. */
  current: { year: number; month: number };
  /** Retention cutoff: months wholly before it are gone. */
  keptFrom: Date;
  /** Where the live listener starts: months before it need a one-time read. */
  liveFrom: Date;
  /** Where the loaded ledger starts; a month read earlier this session counts as instant. */
  loadedFrom: Date;
  now: Date;
  onPick: (year: number, month: number) => void;
  onClose: () => void;
}

// Full literal class strings, one per state.
const CELL: Record<MonthCellState, string> = {
  future: 'bg-transparent text-mute opacity-40 ring-1 ring-inset ring-line/10',
  cleared: 'bg-transparent text-mute opacity-40 ring-1 ring-inset ring-line/10',
  load: 'bg-transparent text-mute ring-1 ring-inset ring-line/20',
  live: 'bg-card text-ink',
};

/**
 * A 3 x 4 grid of one calendar year's months. Months that are instant are
 * plain, months that need a one-time read are outlined and say so, and months
 * past the retention cutoff are greyed "cleared" and cannot be opened.
 */
export const MonthPickerSheet: React.FC<MonthPickerSheetProps> = ({ current, keptFrom, liveFrom, loadedFrom, now, onPick, onClose }) => {
  const t = useT();
  const [year, setYear] = useState(current.year);
  const range = yearRange(keptFrom, now);

  return (
    <Sheet title={t.calendar.pickerTitle} onClose={onClose} z={55}>
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setYear(year - 1)}
          disabled={year <= range.min}
          aria-label={t.calendar.previousYear}
          className={`grid size-11 place-items-center rounded-full bg-card text-ink ${year <= range.min ? 'opacity-30' : 'active:opacity-70'}`}
        >
          <Icon name="left" size={18} />
        </button>
        <p className="text-[20px] font-extrabold tracking-[-0.03em]">{year}</p>
        <button
          type="button"
          onClick={() => setYear(year + 1)}
          disabled={year >= range.max}
          aria-label={t.calendar.nextYear}
          className={`grid size-11 place-items-center rounded-full bg-card text-ink ${year >= range.max ? 'opacity-30' : 'active:opacity-70'}`}
        >
          <Icon name="right" size={18} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 12 }, (_, month) => {
          const state = monthCellState(year, month, keptFrom, liveFrom, now, loadedFrom);
          const here = year === current.year && month === current.month;
          const thisMonth = year === now.getFullYear() && month === now.getMonth();
          const name = new Date(year, month, 1).toLocaleDateString(dateLocale('en-US'), { month: 'short' });
          const sub =
            state === 'cleared'
              ? t.calendar.stateCleared
              : state === 'load'
                ? t.calendar.stateLoad
                : thisMonth
                  ? t.calendar.stateThisMonth
                  : '';
          const off = state === 'cleared' || state === 'future';
          const fill = here && !off ? 'bg-cta text-cta-fg' : CELL[state];
          return (
            <button
              key={month}
              type="button"
              disabled={off}
              aria-pressed={here}
              aria-label={t.calendar.monthAria(
                new Date(year, month, 1).toLocaleDateString(dateLocale('en-US'), { month: 'long', year: 'numeric' }),
                sub
              )}
              onClick={() => onPick(year, month)}
              className={`flex min-h-14 flex-col items-center justify-center rounded-[18px] px-1 py-2 ${fill} ${off ? '' : 'active:opacity-80'}`}
            >
              <span className="text-[14px] font-extrabold">{name}</span>
              {sub && <span className="mt-0.5 text-[10.5px] font-semibold opacity-80">{sub}</span>}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-start gap-2.5 rounded-3xl bg-card px-4 py-3 text-mute">
        <Icon name="lock" size={18} className="mt-0.5" />
        <p className="text-[12.5px] font-semibold leading-snug">{t.calendar.onceNote}</p>
      </div>
      <p className="mb-2 mt-2 rounded-3xl bg-card px-4 py-3 text-[12.5px] font-semibold leading-snug text-mute">{t.calendar.clearedNote}</p>
    </Sheet>
  );
};
