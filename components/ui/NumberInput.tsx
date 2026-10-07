import React, { useState } from 'react';
import { NumberPad } from './NumberPad';

/**
 * A number in a form (a rate, a percentage): closed it is a box showing the
 * figure, tapped it opens the app's own pad right below it. The phone's
 * keyboard never appears. `value` is the number as text ("4.2").
 */
export const NumberInput: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Most decimal places allowed; 0 for a whole number. */
  decimals: number;
  suffix?: string;
  placeholder?: string;
  error?: string;
  hint?: string;
  className?: string;
}> = ({ label, value, onChange, decimals, suffix, placeholder = '0', error, hint, className }) => {
  const [open, setOpen] = useState(false);
  const note = error ?? hint;
  return (
    <div className={className}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="block w-full text-left">
        <span className="mb-1.5 block px-1 text-[12.5px] font-bold text-mute">{label}</span>
        <span
          className={`flex min-h-14 items-center gap-2 rounded-[18px] bg-field px-4 ${
            error ? 'outline outline-2 outline-neg' : open ? 'outline outline-2 outline-ink' : ''
          }`}
        >
          <span className={`min-w-0 flex-1 truncate text-[20px] font-extrabold tabular-nums ${value === '' ? 'text-mute' : 'text-ink'}`}>{value === '' ? placeholder : value}</span>
          {suffix && <span className="shrink-0 font-bold text-mute">{suffix}</span>}
        </span>
      </button>
      {note && <p className={`mt-1.5 px-1 text-xs font-semibold ${error ? 'text-neg' : 'text-mute'}`}>{note}</p>}
      {open && <NumberPad className="mt-3" fieldKey={label} value={value} decimals={decimals} onChange={onChange} onDone={() => setOpen(false)} />}
    </div>
  );
};
