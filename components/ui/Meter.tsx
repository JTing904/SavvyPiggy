import React from 'react';
import type { BudgetStatus } from '../../services/budgets';

// Full literal class strings so the build keeps every one of them.
const FILL: Record<BudgetStatus, string> = {
  ok: 'bg-pos',
  near: 'bg-warn',
  over: 'bg-neg',
  none: 'bg-mute',
};

/**
 * How much of a limit is used. Colour says where it stands (green, amber, red),
 * and the figures beside it say the same in words, so the colour is never the
 * only signal.
 */
export const Meter: React.FC<{ percent: number; status: BudgetStatus; label: string; className?: string }> = ({
  percent,
  status,
  label,
  className,
}) => (
  <div
    role="progressbar"
    aria-label={label}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={Math.min(100, Math.max(0, percent))}
    className={`h-2.5 overflow-hidden rounded-full bg-line/10 ${className ?? ''}`}
  >
    <div className={`h-full rounded-full ${FILL[status]}`} style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
  </div>
);
