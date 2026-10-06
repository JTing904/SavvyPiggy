import React, { useState } from 'react';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { useT } from '../../contexts/LanguageContext';

/**
 * Picking the time of an entry, in the app's own language and look: an hour
 * grid and a minute grid, the same as the reminder time's picker but in the new
 * look. Minutes come in five-minute steps; a time that already sits between
 * the steps (an entry made at 20:03) is offered as its own cell so it is
 * never silently rounded.
 */

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const STEPS = Array.from({ length: 12 }, (_, i) => i * 5);
const pad = (n: number) => String(n).padStart(2, '0');

const cell = (on: boolean) =>
  `min-h-11 rounded-2xl text-[14px] font-bold tabular-nums active:opacity-80 ${on ? 'bg-cta text-cta-fg' : 'bg-card text-ink'}`;

interface TimeFieldProps {
  label: string;
  /** "HH:MM", 24-hour. */
  value: string;
  onChange: (value: string) => void;
}

const EntryTimeField: React.FC<TimeFieldProps> = ({ label, value, onChange }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [h, m] = value.split(':').map(Number);
  const minutes = STEPS.includes(m) ? STEPS : [...STEPS, m].sort((a, b) => a - b);

  return (
    <div className="min-w-0 flex-1">
      <p className="mb-2 text-[11.5px] font-bold text-mute">{label}</p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-14 w-full items-center gap-3 rounded-[18px] bg-field px-4 text-left active:opacity-80"
      >
        <span className="min-w-0 flex-1 truncate text-base font-semibold tabular-nums text-ink">{value}</span>
      </button>

      {open && (
        <Sheet
          title={t.pickers.whatTime}
          onClose={() => setOpen(false)}
          z={60}
          footer={<Button onClick={() => setOpen(false)}>{t.common.done}</Button>}
        >
          <p className="mb-2 text-[11.5px] font-bold text-mute">{t.pickers.hour}</p>
          <div className="grid grid-cols-6 gap-1.5">
            {HOURS.map((hour) => (
              <button key={hour} type="button" aria-pressed={hour === h} onClick={() => onChange(`${pad(hour)}:${pad(m)}`)} className={cell(hour === h)}>
                {pad(hour)}
              </button>
            ))}
          </div>
          <p className="mb-2 mt-4 text-[11.5px] font-bold text-mute">{t.pickers.minute}</p>
          <div className="grid grid-cols-6 gap-1.5">
            {minutes.map((min) => (
              <button key={min} type="button" aria-pressed={min === m} onClick={() => onChange(`${pad(h)}:${pad(min)}`)} className={cell(min === m)}>
                {pad(min)}
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  );
};

export default EntryTimeField;
