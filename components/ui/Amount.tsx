import React from 'react';
import { formatMoney } from '../../services/money';

/**
 * A money figure the way the new look writes it: a heavy whole part, with the
 * "RM" and the cents smaller and lighter. Takes cents, because that is what the
 * app stores. `tone` is the meaning (money in, spending, moved to investing),
 * never decoration.
 */
export type AmountSize = 'xl' | 'lg' | 'md' | 'sm';
export type AmountTone = 'ink' | 'mute' | 'pos' | 'neg' | 'info';

// Full literal class strings so the build keeps every one of them.
const WHOLE: Record<AmountSize, string> = {
  xl: 'text-[48px] leading-[1.05] tracking-[-0.04em]',
  lg: 'text-[34px] leading-[1.1] tracking-[-0.035em]',
  md: 'text-[22px] leading-[1.15] tracking-[-0.02em]',
  sm: 'text-[15px] leading-[1.25]',
};
const RM: Record<AmountSize, string> = {
  xl: 'text-[17px] mr-1',
  lg: 'text-[14px] mr-1',
  md: 'text-[12px] mr-0.5',
  sm: 'text-[11px] mr-0.5',
};
const CENTS: Record<AmountSize, string> = {
  xl: 'text-[26px]',
  lg: 'text-[19px]',
  md: 'text-[14px]',
  sm: 'text-[12px]',
};
const TONE: Record<AmountTone, string> = {
  ink: 'text-ink',
  mute: 'text-mute',
  pos: 'text-pos',
  neg: 'text-neg',
  info: 'text-info',
};

interface AmountProps {
  cents: number;
  size?: AmountSize;
  /** Always show + or -, for movements. */
  signed?: boolean;
  tone?: AmountTone;
  className?: string;
}

export const Amount: React.FC<AmountProps> = ({ cents, size = 'md', signed = false, tone = 'ink', className }) => {
  const ringgit = cents / 100;
  const spoken = formatMoney(ringgit, { signed });
  const [, sign, whole, fraction] = formatMoney(ringgit, { signed, symbol: false }).match(/^([+-]?)([\d,]+)(?:\.(\d+))?$/) ?? ['', '', '0', '00'];

  return (
    <span
      role="img"
      aria-label={spoken}
      className={`inline-flex items-baseline whitespace-nowrap font-figtree font-extrabold tabular-nums ${TONE[tone]} ${className ?? ''}`}
    >
      {sign && <span aria-hidden="true" className={WHOLE[size]}>{sign}</span>}
      <span aria-hidden="true" className={`font-bold text-mute ${RM[size]} self-start`}>RM</span>
      <span aria-hidden="true" className={WHOLE[size]}>{whole}</span>
      <span aria-hidden="true" className={`font-bold text-mute ${CENTS[size]}`}>.{fraction ?? '00'}</span>
    </span>
  );
};
