import React, { useEffect, useState } from 'react';
import { useT } from '../../contexts/LanguageContext';
import { pressNumber } from '../../services/keypad';
import { Button } from './Button';

/**
 * The app's own pad for a number that is typed as it reads (shares, a share
 * price, a fee), in place of the phone's keyboard. The first key after it opens
 * starts the number over, so tapping a field and typing replaces what was there;
 * backspace edits it instead.
 */
interface NumberPadProps {
  value: string;
  onChange: (value: string) => void;
  /** 0 for a whole number (no point key), otherwise the most places allowed. */
  decimals: number;
  onDone: () => void;
  /** Changes when the pad is pointed at another field, so the next key starts that one over. */
  fieldKey?: string;
  /** Leaves out the Done button, for a pad that sits in a sheet with its own. */
  hideDone?: boolean;
  className?: string;
}

const KEY = 'grid h-12 place-items-center rounded-[18px] bg-card text-[21px] font-bold text-ink active:bg-line/10';

const BackspaceIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 5h11v14H9l-6-7z" />
    <path d="M12.5 9.5l5 5M17.5 9.5l-5 5" />
  </svg>
);

export const NumberPad: React.FC<NumberPadProps> = ({ value, onChange, decimals, onDone, fieldKey, hideDone, className }) => {
  const t = useT();
  const [fresh, setFresh] = useState(true);
  useEffect(() => setFresh(true), [fieldKey]);

  const press = (key: string) => {
    const base = fresh && key !== 'b' ? '' : value;
    setFresh(false);
    onChange(pressNumber(base, key, decimals));
  };

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
      <div role="group" aria-label={t.ui.keypad} className="grid grid-cols-3 gap-2">
        {digits.map(([k, label]) => (
          <button key={k} type="button" aria-label={label} onClick={() => press(k)} className={KEY}>
            {k}
          </button>
        ))}
        {decimals > 0 ? (
          <button type="button" aria-label="." onClick={() => press('.')} className={`${KEY} text-mute`}>
            .
          </button>
        ) : (
          <span aria-hidden="true" />
        )}
        <button type="button" aria-label={t.ui.keyZero} onClick={() => press('0')} className={KEY}>
          0
        </button>
        <button type="button" aria-label={t.ui.keyDelete} onClick={() => press('b')} className={KEY}>
          <BackspaceIcon />
        </button>
      </div>
      {!hideDone && (
        <Button variant="ghost" onClick={onDone} className="mt-2">
          {t.entry.amountDone}
        </Button>
      )}
    </div>
  );
};
