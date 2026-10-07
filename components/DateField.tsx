import React, { useEffect, useState } from 'react';
import { Icon } from './ui/Icon';
import { Sheet } from './ui/Sheet';
import { useT } from '../contexts/LanguageContext';
import {
  addDays,
  addMonths,
  fromInputDate,
  monthGrid,
  monthLabel,
  readableDate,
  toInputDate,
} from '../services/calendar';

/**
 * Picking a day, in the app's own language.
 *
 * `<input type="date">` handed this to Android, which draws it in the phone's
 * locale — so an English app popped up "2026年6月19日周五 / 清除 取消 设置".
 * It also accepted any date at all, including next year's, and a trade dated
 * in the future would be counted as held on an ex-date that has not happened.
 *
 * The value stays the "YYYY-MM-DD" the rest of the app already passes around,
 * so nothing downstream changes.
 */

interface DateFieldProps {
  label: string;
  /** "YYYY-MM-DD". */
  value: string;
  onChange: (value: string) => void;
  /** Latest selectable day, "YYYY-MM-DD". Days after it cannot be chosen. */
  max?: string;
  /** Earliest selectable day. Earlier days cannot be chosen, and the month arrows stop at its month. */
  min?: Date;
  /**
   * Draws whatever opens the picker in place of the built-in labelled button,
   * for a screen whose own look the default does not fit. The picker is unchanged.
   */
  renderTrigger?: (open: () => void) => React.ReactNode;
  /** What the sheet asks, and why the answer matters. */
  title?: string;
  hint?: string;
}

const DateField: React.FC<DateFieldProps> = ({
  label,
  value,
  onChange,
  max,
  min,
  renderTrigger,
  title,
  hint,
}) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const selected = fromInputDate(value);
  const [view, setView] = useState(() => {
    const d = new Date(selected);
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  // Reopening should land on the month being edited, not wherever the last
  // visit wandered to.
  useEffect(() => {
    if (!open) return;
    const d = new Date(fromInputDate(value));
    setView({ year: d.getFullYear(), month: d.getMonth() });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const today = toInputDate(Date.now());
  const ceiling = max ?? '9999-12-31';
  const floor = min ? toInputDate(min.getTime()) : '0000-01-01';

  const pick = (key: string) => {
    onChange(key);
    setOpen(false);
  };

  const step = (delta: number) => setView(addMonths(view.year, view.month, delta));

  // The month after the ceiling holds nothing selectable, so the arrow stops.
  const ceilingDate = new Date(fromInputDate(ceiling));
  const atCeilingMonth =
    view.year > ceilingDate.getFullYear() ||
    (view.year === ceilingDate.getFullYear() && view.month >= ceilingDate.getMonth());

  // The month before the floor holds nothing selectable either.
  const floorDate = new Date(fromInputDate(floor));
  const atFloorMonth =
    !!min &&
    (view.year < floorDate.getFullYear() ||
      (view.year === floorDate.getFullYear() && view.month <= floorDate.getMonth()));

  const quick = (text: string, key: string) => {
    if (key > ceiling || key < floor) return null;
    const on = key === value;
    return (
      <button
        type="button"
        onClick={() => pick(key)}
        className={`min-h-11 rounded-full px-4 text-[13px] font-bold active:opacity-70 ${on ? 'bg-cta text-cta-fg' : 'bg-card text-mute'}`}
      >
        {text}
      </button>
    );
  };

  return (
    <div className="min-w-0 flex-1">
      {renderTrigger ? (
        renderTrigger(() => setOpen(true))
      ) : (
        <>
          <p className="mb-2 px-1 text-[12.5px] font-bold text-mute">{label}</p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex min-h-14 w-full items-center gap-3 rounded-[18px] bg-field px-4 text-left active:opacity-80"
          >
            <Icon name="cal" size={20} className="text-mute" />
            <span className="min-w-0 flex-1 truncate text-[16px] font-bold text-ink">{readableDate(value)}</span>
            <Icon name="chev" size={16} className="rotate-90 text-mute" />
          </button>
        </>
      )}

      {open && (
        <Sheet title={title ?? t.pickers.whenWasThis} z={60} onClose={() => setOpen(false)}>
          {hint && <p className="-mt-1 px-1 text-[13.5px] font-medium leading-relaxed text-mute">{hint}</p>}

          <div className="mt-4 flex gap-2">
            {quick(t.common.today, today)}
            {quick(t.common.yesterday, addDays(today, -1))}
          </div>

          <div className="mt-5 flex items-center justify-between">
            <button
              type="button"
              onClick={() => step(-1)}
              disabled={atFloorMonth}
              aria-label={t.pickers.previousMonth}
              className="grid size-11 place-items-center rounded-full bg-card active:opacity-70 disabled:opacity-30"
            >
              <Icon name="back" size={18} />
            </button>
            <p className="text-[16px] font-extrabold">{monthLabel(view.year, view.month)}</p>
            <button
              type="button"
              onClick={() => step(1)}
              disabled={atCeilingMonth}
              aria-label={t.pickers.nextMonth}
              className="grid size-11 place-items-center rounded-full bg-card active:opacity-70 disabled:opacity-30"
            >
              <Icon name="chev" size={18} />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-7">
            {t.common.weekdaysNarrow.map((d, i) => (
              <span key={i} className="text-center text-[11.5px] font-bold text-mute">
                {d}
              </span>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-7 place-items-center gap-y-0.5">
            {monthGrid(view.year, view.month)
              .flat()
              .map((day, i) => {
                if (day === null) return <span key={i} className="size-11" />;
                const key = toInputDate(new Date(view.year, view.month, day).getTime());
                const blocked = key > ceiling || key < floor;
                const on = key === value;
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={blocked}
                    aria-current={key === today ? 'date' : undefined}
                    aria-selected={on}
                    onClick={() => pick(key)}
                    className={`size-11 rounded-full text-[14.5px] font-bold tabular-nums active:opacity-70 ${
                      on ? 'bg-cta text-cta-fg' : blocked ? 'text-mute/40' : key === today ? 'text-ink ring-2 ring-ink/30' : 'text-ink'
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
          </div>
        </Sheet>
      )}
    </div>
  );
};

export default DateField;
