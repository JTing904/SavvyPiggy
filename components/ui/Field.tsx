import React, { useId } from 'react';

interface FieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'className'> {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string;
  /** Shown after the text, e.g. a unit. */
  suffix?: React.ReactNode;
  className?: string;
}

/** A labelled text input on the field colour. The focused field gets an ink outline. */
export const Field: React.FC<FieldProps> = ({ label, value, onChange, hint, error, suffix, className, id, ...rest }) => {
  const auto = useId();
  const inputId = id ?? auto;
  const noteId = `${inputId}-note`;
  const note = error ?? hint;
  return (
    <div className={className}>
      <label
        htmlFor={inputId}
        className={`flex min-h-14 flex-col justify-center rounded-[18px] bg-field px-4 py-2.5 focus-within:outline focus-within:outline-2 focus-within:outline-ink ${
          error ? 'outline outline-2 outline-neg' : ''
        }`}
      >
        <span className="block text-[11.5px] font-bold text-mute">{label}</span>
        <span className="flex items-center gap-2">
          <input
            {...rest}
            id={inputId}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={note ? noteId : undefined}
            className="min-h-6 w-full min-w-0 select-text border-0 bg-transparent p-0 font-figtree text-base font-semibold text-ink placeholder:text-mute focus:ring-0"
          />
          {suffix && <span className="shrink-0 text-sm font-bold text-mute">{suffix}</span>}
        </span>
      </label>
      {note && (
        <p id={noteId} className={`mt-1.5 px-1 text-xs font-semibold ${error ? 'text-neg' : 'text-mute'}`}>
          {note}
        </p>
      )}
    </div>
  );
};
