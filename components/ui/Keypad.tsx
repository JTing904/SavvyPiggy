import React from 'react';
import { useT } from '../../contexts/LanguageContext';
import { formatTyped, pressKey } from '../../services/keypad';

/**
 * The app's own number pad plus the amount it is typing. `value` is the text
 * typed so far ("", "12", "12.5"); every key goes through pressKey, which owns
 * the rules (two decimals, no stray zeros). The missing decimals show as ghosts.
 */
interface KeypadProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

const BackspaceIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 5h11v14H9l-6-7z" />
    <path d="M12.5 9.5l5 5M17.5 9.5l-5 5" />
  </svg>
);

const KEY =
  'grid h-12 place-items-center rounded-[18px] bg-card text-[21px] font-bold text-ink active:bg-line/10';

export const Keypad: React.FC<KeypadProps> = ({ value, onChange, className }) => {
  const t = useT();
  const { whole, cents, hasDot } = formatTyped(value);
  const ghost = '00'.slice(cents.length);
  const spoken = `${t.ui.amountEntered} RM ${whole}${hasDot ? `.${cents}` : ''}`;

  const digits: [string, string][] = [
    ['1', t.ui.keyOne],
    ['2', t.ui.keyTwo],
    ['3', t.ui.keyThree],
    ['4', t.ui.keyFour],
    ['5', t.ui.keyFive],
    ['6', t.ui.keySix],
    ['7', t.ui.keySeven],
    ['8', t.ui.keyEight],
    ['9', t.ui.keyNine],
  ];

  return (
    <div className={`font-figtree ${className ?? ''}`}>
      <div aria-live="polite" aria-atomic="true" className="my-3.5 text-center font-extrabold tabular-nums text-ink">
        <span className="sr-only">{spoken}</span>
        <span aria-hidden="true" className="inline-flex items-baseline whitespace-nowrap">
          <span className="mr-1 self-start pt-2 text-[18px] font-bold text-mute">RM</span>
          <span className="text-[54px] leading-none tracking-[-0.04em]">{whole}</span>
          <span className="text-[54px] leading-none tracking-[-0.04em] text-mute">
            <span className={hasDot ? '' : 'opacity-40'}>.</span>
            {cents}
            <span className="opacity-40">{ghost}</span>
          </span>
        </span>
      </div>

      <div role="group" aria-label={t.ui.keypad} className="grid grid-cols-3 gap-2">
        {digits.map(([k, label]) => (
          <button key={k} type="button" aria-label={label} onClick={() => onChange(pressKey(value, k))} className={KEY}>
            {k}
          </button>
        ))}
        <button type="button" aria-label={t.ui.keyPoint} onClick={() => onChange(pressKey(value, '.'))} className={KEY}>
          .
        </button>
        <button type="button" aria-label={t.ui.keyZero} onClick={() => onChange(pressKey(value, '0'))} className={KEY}>
          0
        </button>
        <button type="button" aria-label={t.ui.keyDelete} onClick={() => onChange(pressKey(value, 'b'))} className={KEY}>
          <BackspaceIcon />
        </button>
      </div>
    </div>
  );
};
