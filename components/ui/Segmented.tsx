import React, { useRef } from 'react';

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
}

/** A row of pills where exactly one is chosen. Tabs semantics; arrow keys move the choice. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div role="tablist" aria-label={ariaLabel} className={`flex flex-wrap gap-2 ${className ?? ''}`}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`min-h-11 rounded-full px-4 text-[13px] font-bold ${on ? 'bg-cta text-cta-fg' : 'bg-card text-mute'}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
