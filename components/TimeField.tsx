import React, { useState } from 'react';
import { useT } from '../contexts/LanguageContext';
import { formatTime, parseTime } from '../services/alerts';
import { Button } from './ui/Button';
import { Icon } from './ui/Icon';
import { Sheet } from './ui/Sheet';

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

const TimeField: React.FC<TimeFieldProps> = ({ value, onChange, title, hint }) => {
  const t = useT();
  const [open, setOpen] = useState(false);

  const { hour, minute } = parseTime(value);
  // A time saved before this existed can sit between the steps; it is shown as
  // it is rather than silently rounded, and only moves when something is picked.
  const set = (h: number, m: number) => onChange(`${pad(h)}:${pad(m)}`);

  const cell = (on: boolean) =>
    `min-h-11 rounded-2xl text-[14px] font-extrabold tabular-nums active:opacity-70 ${on ? 'bg-cta text-cta-fg' : 'bg-card text-ink'}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-full bg-line/10 px-4 text-[14px] font-extrabold tabular-nums active:opacity-70"
      >
        <Icon name="hist" size={16} />
        {formatTime(value)}
      </button>

      {open && (
        <Sheet
          title={title ?? t.pickers.whatTime}
          z={60}
          onClose={() => setOpen(false)}
          footer={<Button onClick={() => setOpen(false)}>{t.common.done}</Button>}
        >
          <p className="px-1 text-[28px] font-extrabold tabular-nums">{formatTime(value)}</p>
          {hint && <p className="mt-1 px-1 text-[13.5px] font-medium leading-relaxed text-mute">{hint}</p>}

          <p className="mb-2 mt-5 px-1 text-[12.5px] font-bold text-mute">{t.pickers.hour}</p>
          <div className="grid grid-cols-6 gap-1.5">
            {HOURS.map((h) => (
              <button key={h} type="button" onClick={() => set(h, minute)} className={cell(h === hour)}>
                {pad(h)}
              </button>
            ))}
          </div>

          <p className="mb-2 mt-5 px-1 text-[12.5px] font-bold text-mute">{t.pickers.minute}</p>
          <div className="grid grid-cols-6 gap-1.5">
            {MINUTES.map((m) => (
              <button key={m} type="button" onClick={() => set(hour, m)} className={cell(m === minute)}>
                {pad(m)}
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </>
  );
};

export default TimeField;
