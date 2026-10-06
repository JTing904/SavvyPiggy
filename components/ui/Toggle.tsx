import React from 'react';

/** An on/off switch. The 46x28 track sits in a 44dp touch target. */
export const Toggle: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** What the switch controls, for screen readers. */
  label: string;
  disabled?: boolean;
}> = ({ checked, onChange, label, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`grid min-h-11 min-w-12 shrink-0 place-items-center ${disabled ? 'opacity-40' : ''}`}
  >
    <span
      className={`relative block h-7 w-[46px] rounded-full transition-colors motion-reduce:transition-none ${
        checked ? 'bg-pos' : 'bg-[rgb(var(--tog))]'
      }`}
    >
      <span
        className={`absolute top-[3px] size-[22px] rounded-full transition-[left] motion-reduce:transition-none ${
          checked ? 'left-[21px] bg-cta-fg' : 'left-[3px] bg-white'
        }`}
      />
    </span>
  </button>
);
