import React, { useState } from 'react';
import { amountToCents } from '../services/keypad';
import { useT } from '../contexts/LanguageContext';
import { Amount } from './ui/Amount';
import { Button } from './ui/Button';
import { Keypad } from './ui/Keypad';

/**
 * An amount typed on the app's own keypad, in a form that has other things to
 * fill in: closed it is a field showing the figure, tapped it opens the pad.
 * `value` is the digits typed (cents), the same as the keypad itself.
 */
export const AmountInput: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Shown while nothing is typed. */
  placeholder?: string;
  /** Start with the pad open. */
  startOpen?: boolean;
  hint?: string;
  className?: string;
}> = ({ label, value, onChange, placeholder, startOpen = false, hint, className }) => {
  const t = useT();
  const [open, setOpen] = useState(startOpen);
  const cents = amountToCents(value);
  return (
    <div className={className}>
      <p className="mb-2 px-0.5 text-[12.5px] font-bold text-mute">{label}</p>
      {open ? (
        <>
          <Keypad value={value} onChange={onChange} />
          <Button variant="ghost" onClick={() => setOpen(false)} className="mt-2">
            {t.entry.amountDone}
          </Button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-h-14 w-full items-center rounded-[18px] bg-field px-4 py-2.5 text-left active:opacity-80"
        >
          {cents > 0 ? <Amount cents={cents} size="md" /> : <span className="text-base font-semibold text-mute">{placeholder ?? ''}</span>}
        </button>
      )}
      {hint && <p className="mt-1.5 px-1 text-[12px] font-medium leading-snug text-mute">{hint}</p>}
    </div>
  );
};
