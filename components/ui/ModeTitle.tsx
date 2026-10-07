import React, { useRef } from 'react';

export type Mode = 'save' | 'invest';

/**
 * The screen title that is also the switch between Savings and Investing: two
 * big words, the active one in ink, the other muted. The labels come from the
 * caller so the words follow the language.
 */
export const ModeTitle: React.FC<{
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  labels: { save: string; invest: string };
  className?: string;
}> = ({ mode, onModeChange, labels, className }) => {
  const refs = useRef<Record<Mode, HTMLButtonElement | null>>({ save: null, invest: null });
  const order: Mode[] = ['save', 'invest'];

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next = mode === 'save' ? 'invest' : 'save';
    onModeChange(next);
    refs.current[next]?.focus();
  };

  return (
    <div role="tablist" className={`flex items-baseline gap-4 font-figtree ${className ?? ''}`}>
      {order.map((m) => {
        const on = m === mode;
        return (
          <button
            key={m}
            ref={(el) => {
              refs.current[m] = el;
            }}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onModeChange(m)}
            onKeyDown={onKeyDown}
            className={`min-h-11 text-[30px] font-extrabold leading-none tracking-[-0.035em] ${
              on ? 'text-ink' : 'text-mute'
            }`}
          >
            {labels[m]}
          </button>
        );
      })}
    </div>
  );
};
