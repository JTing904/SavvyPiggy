import React, { useEffect, useRef, useState } from 'react';
import type { PiggyBank } from '../../types';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { IconTile, type IconTint } from '../ui/IconTile';
import { Keypad } from '../ui/Keypad';
import DateField from '../DateField';
import EntryTimeField from './TimeField';
import { amountToCents, pressKey } from '../../services/keypad';
import { formatMoney, fromCents } from '../../services/money';
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

/** The amount, as the band's big figure. Tapping it opens the keys below. */
export const AmountFigure: React.FC<{ value: string; onOpen: () => void }> = ({ value, onOpen }) => {
  const t = useT();
  return (
    <button type="button" onClick={onOpen} className="mt-1.5 block max-w-full text-left active:opacity-80">
      <span className="block truncate text-[38px] font-bold leading-[1.15] tracking-[-0.015em] tabular-nums">{formatMoney(fromCents(amountToCents(value)))}</span>
      <span className="mt-0.5 block truncate text-[13.5px] font-semibold text-band-sub">{t.pro.entry.tapToChange}</span>
    </button>
  );
};

/**
 * The app's keypad for the amount. The first key pressed replaces the old figure
 * (a correction is usually a whole new number); backspace edits it instead.
 */
export const AmountKeys: React.FC<{ value: string; onChange: (value: string) => void; onDone: () => void }> = ({ value, onChange, onDone }) => {
  const t = useT();
  const fresh = useRef(true);

  const press = (next: string) => {
    // The first key of a correction starts a new amount; backspace afterwards edits one digit.
    if (fresh.current && next.length > value.length) onChange([...next.slice(value.length)].reduce(pressKey, ''));
    else onChange(next);
    fresh.current = false;
  };

  return (
    <div>
      <Keypad value={value} onChange={press} compact />
      <Button variant="ghost" onClick={onDone} className="mt-2">
        {t.entry.amountDone}
      </Button>
    </div>
  );
};

/** One detail of an entry: what it is on the left, what it is set to on the right. */
export const DetailRow: React.FC<{
  icon: React.ReactNode;
  tint: IconTint;
  /** A round tile marks a record's own kind, like its category. */
  round?: boolean;
  label: string;
  /** Absent: the detail can only be read. */
  onClick?: () => void;
  children: React.ReactNode;
}> = ({ icon, tint, round, label, onClick, children }) => {
  const body = (
    <>
      <IconTile icon={icon} tint={tint} size={38} round={round} />
      <span className="min-w-0 flex-1 truncate font-semibold text-mute">{label}</span>
      <span className="max-w-[60%] shrink-0 truncate text-right font-bold tabular-nums">{children}</span>
    </>
  );
  const layout = 'flex min-h-[60px] w-full items-center gap-2.5 text-left text-[15px]';
  if (!onClick) return <div className={layout}>{body}</div>;
  return (
    <button type="button" onClick={onClick} className={`${layout} active:opacity-70`}>
      {body}
    </button>
  );
};

/** The note, typed straight into its row. */
export const NoteRow: React.FC<{ value: string; onChange: (value: string) => void }> = ({ value, onChange }) => {
  const t = useT();
  return (
    <label className="flex min-h-[60px] w-full items-center gap-2.5 text-[15px]">
      <IconTile icon="pencil" tint="amber" size={38} />
      <span className="shrink-0 font-semibold text-mute">{t.entry.note}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t.entry.notePlaceholder}
        autoComplete="off"
        className="min-h-7 w-full min-w-0 flex-1 select-text border-0 bg-transparent p-0 text-right font-figtree text-[15px] font-bold text-ink placeholder:text-mute focus:ring-0"
      />
    </label>
  );
};

/** The day and the time, as two rows. A day before the retention cutoff or after today cannot be picked. */
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
    <>
      <DateField
        label={t.entry.date}
        value={day}
        onChange={onDay}
        min={notBefore}
        max={toInputDate(Date.now())}
        renderTrigger={(open) => (
          <DetailRow icon="cal" tint="blue" label={t.entry.date} onClick={open}>
            {shortDay(day, lang)}
          </DetailRow>
        )}
      />
      <EntryTimeField
        label={t.entry.time}
        value={time}
        onChange={onTime}
        renderTrigger={(open) => (
          <DetailRow icon="hist" tint="blue" label={t.entry.time} onClick={open}>
            {time}
          </DetailRow>
        )}
      />
    </>
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
