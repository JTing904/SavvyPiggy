import React, { useEffect, useState } from 'react';
import { useBackHandler } from '../hooks/useBackHandler';
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
  /** What the sheet asks, and why the answer matters. */
  title?: string;
  hint?: string;
}

const DateField: React.FC<DateFieldProps> = ({
  label,
  value,
  onChange,
  max,
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

  useBackHandler(open, () => setOpen(false));

  const today = toInputDate(Date.now());
  const ceiling = max ?? '9999-12-31';

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

  const quick = (text: string, key: string) => {
    if (key > ceiling) return null;
    const on = key === value;
    return (
      <button
        type="button"
        onClick={() => pick(key)}
        className={`px-4 py-2.5 rounded-2xl text-[12px] font-black border active:scale-95 transition-transform ${
          on ? 'bg-primary text-black border-primary' : 'bg-white/5 border-white/10 text-slate-400'
        }`}
      >
        {text}
      </button>
    );
  };

  return (
    <div className="flex-1 min-w-0">
      <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-2">{label}</p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 h-14 px-4 rounded-2xl bg-white/5 border border-white/10 active:border-primary/50 transition-colors text-left"
      >
        <span className="material-symbols-rounded text-slate-500 text-xl shrink-0">calendar_month</span>
        <span className="flex-1 min-w-0 text-white text-base font-black truncate">
          {readableDate(value)}
        </span>
        <span className="material-symbols-rounded text-slate-600 text-lg shrink-0">expand_more</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/85 veil-in"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md bg-surface rounded-t-[3rem] sm:rounded-[3rem] sm:mb-6 shadow-2xl sheet-rise p-7 safe-pb"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-5" />
            <h3 className="text-white text-2xl font-black tracking-tight">{title ?? t.pickers.whenWasThis}</h3>
            {hint && <p className="text-slate-400 text-sm font-medium mt-2 leading-relaxed">{hint}</p>}

            <div className="flex gap-2 mt-5">
              {quick(t.common.today, today)}
              {quick(t.common.yesterday, addDays(today, -1))}
            </div>

            <div className="flex items-center justify-between mt-6">
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label={t.pickers.previousMonth}
                className="size-10 rounded-full glass flex items-center justify-center text-slate-300 active:scale-90 transition-transform"
              >
                <span className="material-symbols-rounded text-xl">chevron_left</span>
              </button>
              <p className="text-white text-base font-black">{monthLabel(view.year, view.month)}</p>
              <button
                type="button"
                onClick={() => step(1)}
                disabled={atCeilingMonth}
                aria-label={t.pickers.nextMonth}
                className="size-10 rounded-full glass flex items-center justify-center text-slate-300 active:scale-90 transition-transform disabled:opacity-30 disabled:active:scale-100"
              >
                <span className="material-symbols-rounded text-xl">chevron_right</span>
              </button>
            </div>

            <div className="grid grid-cols-7 mt-4">
              {t.common.weekdaysNarrow.map((d, i) => (
                <span
                  key={i}
                  className="text-center text-slate-500 text-[10px] font-black tracking-wider"
                >
                  {d}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-0.5 place-items-center mt-2">
              {monthGrid(view.year, view.month).flat().map((day, i) => {
                if (day === null) return <span key={i} className="size-10" />;
                const key = toInputDate(new Date(view.year, view.month, day).getTime());
                const blocked = key > ceiling;
                const on = key === value;
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={blocked}
                    aria-current={key === today ? 'date' : undefined}
                    aria-selected={on}
                    onClick={() => pick(key)}
                    className={`size-10 rounded-full text-sm font-bold tabular-nums transition-transform active:scale-90 disabled:active:scale-100 ${
                      on
                        ? 'bg-primary text-black font-black'
                        : blocked
                          ? 'text-slate-700'
                          : key === today
                            ? 'text-slate-300 ring-1 ring-primary/40'
                            : 'text-slate-300'
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DateField;
