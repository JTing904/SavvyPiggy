import React, { useEffect, useRef, useState } from 'react';
import type { PiggyBank } from '../../types';
import { Amount } from '../ui/Amount';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { Keypad } from '../ui/Keypad';
import DateField from '../DateField';
import EntryTimeField from './TimeField';
import { amountToCents, pressKey } from '../../services/keypad';
import { toInputDate } from '../../services/calendar';
import { useLanguage, useT } from '../../contexts/LanguageContext';

/** "Tue, 15 Sep" / "9月15日 周二": short enough for half a row, the year only when it is not this one. */
const shortDay = (day: string, lang: string) => {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(y === new Date().getFullYear() ? {} : { year: 'numeric' as const }),
  });
};

/** Whether the phone says it has a connection. Only a hint: a write is what proves it. */
export const useOnline = () => {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
};

/** A small heading above a group of choices. */
export const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="mb-2 mt-5 text-[11.5px] font-bold text-mute">{children}</p>
);

/**
 * The amount: a field showing it, which opens the app's keypad. The first key
 * pressed replaces the old figure (a correction is usually a whole new number);
 * backspace edits it instead.
 */
export const AmountField: React.FC<{
  value: string;
  onChange: (value: string) => void;
  /** Told when the keypad opens or closes, so the sheet can keep still while keys are pressed. */
  onOpenChange?: (open: boolean) => void;
}> = ({ value, onChange, onOpenChange }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const fresh = useRef(true);
  useEffect(() => {
    onOpenChange?.(open);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          fresh.current = true;
          setOpen(true);
        }}
        className="flex min-h-14 w-full flex-col justify-center rounded-[18px] bg-field px-4 py-2.5 text-left active:opacity-80"
      >
        <span className="block text-[11.5px] font-bold text-mute">{t.entry.amount}</span>
        <Amount cents={amountToCents(value)} size="md" />
      </button>
    );
  }

  const press = (next: string) => {
    if (fresh.current && next.length > value.length) onChange(pressKey('', next[next.length - 1]));
    else onChange(next);
    fresh.current = false;
  };

  return (
    <div>
      <Keypad value={value} onChange={press} />
      <Button variant="ghost" onClick={() => setOpen(false)} className="mt-2">
        {t.entry.amountDone}
      </Button>
    </div>
  );
};

/** The day and the time, side by side. A day before the retention cutoff or after today cannot be picked. */
export const WhenFields: React.FC<{
  day: string;
  time: string;
  notBefore: Date;
  onDay: (day: string) => void;
  onTime: (time: string) => void;
}> = ({ day, time, notBefore, onDay, onTime }) => {
  const t = useT();
  const { lang } = useLanguage();
  return (
    <div className="mt-2 flex gap-2">
      <DateField
        label={t.entry.date}
        value={day}
        onChange={onDay}
        min={notBefore}
        max={toInputDate(Date.now())}
        renderTrigger={(open) => (
          <>
            <p className="mb-2 text-[11.5px] font-bold text-mute">{t.entry.date}</p>
            <button
              type="button"
              onClick={open}
              className="flex min-h-14 w-full items-center gap-3 rounded-[18px] bg-field px-4 text-left active:opacity-80"
            >
              <span className="min-w-0 flex-1 truncate text-base font-semibold tabular-nums text-ink">{shortDay(day, lang)}</span>
            </button>
          </>
        )}
      />
      <EntryTimeField label={t.entry.time} value={time} onChange={onTime} />
    </div>
  );
};

/** Goals as pills, one chosen. `lead` puts extra choices (like "As it was") in front. */
export const GoalChips: React.FC<{
  goals: PiggyBank[];
  value: string | null;
  onChange: (goalId: string) => void;
  lead?: React.ReactNode;
  ariaLabel: string;
}> = ({ goals, value, onChange, lead, ariaLabel }) => (
  <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-2">
    {lead}
    {goals.map((g) => (
      <Chip key={g.id} selected={value === g.id} onClick={() => onChange(g.id)}>
        {g.name}
      </Chip>
    ))}
  </div>
);
