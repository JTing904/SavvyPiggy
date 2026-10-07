import React from 'react';
import type { Frequency } from '../types';
import { useT } from '../contexts/LanguageContext';
import { Segmented } from './ui/Segmented';
import { Chip } from './ui/Chip';

export interface Repeat {
  frequency: Frequency;
  /** 0 = Sunday .. 6 = Saturday. */
  weekday: number;
  /** 1..31. */
  dayOfMonth: number;
  /** 1..12. */
  month: number;
}

const FREQUENCIES: Frequency[] = ['daily', 'weekly', 'monthly', 'yearly'];
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="mb-2 mt-5 px-0.5 text-[12.5px] font-bold text-mute">{children}</p>
);

/**
 * When something repeats: every day, week, month or year, and which day of it.
 * Shared by the bill sheet and the scheduled-deposit sheet, which fall due on
 * exactly the same rules.
 */
export const RepeatFields: React.FC<{ value: Repeat; onChange: (next: Repeat) => void }> = ({ value, onChange }) => {
  const t = useT();
  const b = t.bills;
  const set = (patch: Partial<Repeat>) => onChange({ ...value, ...patch });

  return (
    <>
      <Label>{b.repeat}</Label>
      <Segmented<Frequency>
        ariaLabel={b.repeat}
        value={value.frequency}
        onChange={(frequency) => set({ frequency })}
        options={FREQUENCIES.map((f) => ({ value: f, label: t.profile.frequencies[f] }))}
      />

      {value.frequency === 'weekly' && (
        <>
          <Label>{b.on}</Label>
          <div role="group" aria-label={b.on} className="flex flex-wrap gap-2">
            {t.common.weekdaysLong.map((name, i) => (
              <Chip key={name} selected={value.weekday === i} onClick={() => set({ weekday: i })}>
                {t.common.weekdaysNarrow[i]}
              </Chip>
            ))}
          </div>
          <p className="mt-1.5 px-0.5 text-[12px] font-semibold text-mute">{t.common.weekdaysLong[value.weekday]}</p>
        </>
      )}

      {value.frequency === 'yearly' && (
        <>
          <Label>{b.month}</Label>
          <div role="group" aria-label={b.month} className="flex flex-wrap gap-2">
            {t.report.monthsShort.map((name, i) => (
              <Chip key={name} selected={value.month === i + 1} onClick={() => set({ month: i + 1 })}>
                {name}
              </Chip>
            ))}
          </div>
        </>
      )}

      {(value.frequency === 'monthly' || value.frequency === 'yearly') && (
        <>
          <Label>{b.day}</Label>
          <div role="group" aria-label={b.day} className="flex flex-wrap gap-2">
            {DAYS.map((d) => (
              <Chip key={d} selected={value.dayOfMonth === d} onClick={() => set({ dayOfMonth: d })}>
                {d}
              </Chip>
            ))}
          </div>
          {value.dayOfMonth > 28 && <p className="mt-1.5 px-0.5 text-[12px] font-semibold text-mute">{b.shortMonths}</p>}
        </>
      )}
    </>
  );
};
