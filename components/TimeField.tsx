import React, { useState } from 'react';
import { useBackHandler } from '../hooks/useBackHandler';
import { useT } from '../contexts/LanguageContext';
import { formatTime, parseTime } from '../services/alerts';

/**
 * Picking a time, in the app's own language.
 *
 * `<input type="time">` handed this to Android, which drew its Material clock
 * face in the phone's locale — so an English app popped up a grey dial with
 * 清除 / 取消 / 设置 on it. A reminder time is two numbers; a clock face is a
 * slow way to enter two numbers, and a twenty-four point dial is a slow way to
 * enter one of them.
 *
 * Minutes come in five-minute steps. "Remind me at 8pm" is the whole point,
 * and nobody has ever needed 20:03.
 */

interface TimeFieldProps {
  /** "HH:MM", 24-hour. */
  value: string;
  onChange: (value: string) => void;
  title?: string;
  hint?: string;
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

const pad = (n: number) => String(n).padStart(2, '0');

const TimeField: React.FC<TimeFieldProps> = ({
  value,
  onChange,
  title,
  hint,
}) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  useBackHandler(open, () => setOpen(false));

  const { hour, minute } = parseTime(value);
  // A time saved before this existed can sit between the steps; it is shown as
  // it is rather than silently rounded, and only moves when something is picked.
  const set = (h: number, m: number) => onChange(`${pad(h)}:${pad(m)}`);

  const cell = (on: boolean) =>
    `h-11 rounded-2xl text-sm font-black tabular-nums transition-transform active:scale-90 ${
      on ? 'bg-primary text-black' : 'bg-white/5 text-slate-300'
    }`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex items-center gap-2 h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm font-bold active:border-primary/50 transition-colors"
      >
        <span className="material-symbols-rounded text-primary text-base">schedule</span>
        {formatTime(value)}
        <span className="material-symbols-rounded text-slate-600 text-base">expand_more</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/85 veil-in"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md bg-surface rounded-t-[3rem] sm:rounded-[3rem] sm:mb-6 shadow-2xl sheet-rise p-7 safe-pb max-h-[90dvh] overflow-y-auto no-scrollbar"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-5" />
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-white text-2xl font-black tracking-tight">{title ?? t.pickers.whatTime}</h3>
              <p className="text-primary text-2xl font-black tabular-nums shrink-0">
                {formatTime(value)}
              </p>
            </div>
            {hint && <p className="text-slate-400 text-sm font-medium mt-2 leading-relaxed">{hint}</p>}

            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mt-6 mb-2">
              {t.pickers.hour}
            </p>
            <div className="grid grid-cols-6 gap-1.5">
              {HOURS.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => set(h, minute)}
                  className={cell(h === hour)}
                >
                  {pad(h)}
                </button>
              ))}
            </div>

            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mt-5 mb-2">
              {t.pickers.minute}
            </p>
            <div className="grid grid-cols-6 gap-1.5">
              {MINUTES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => set(hour, m)}
                  className={cell(m === minute)}
                >
                  {pad(m)}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-full h-14 rounded-2xl bg-primary text-black font-black mt-6 active:scale-95 transition-transform"
            >
              {t.common.done}
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default TimeField;
