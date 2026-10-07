import React from 'react';
import { Icon } from '../ui/Icon';
import { formatMoney, fromCents } from '../../services/money';
import { useT } from '../../contexts/LanguageContext';

export interface PreviewRow {
  id: string;
  name: string;
  beforeCents: number;
  afterCents: number;
}

const rm = (cents: number) => formatMoney(fromCents(cents));

/** "+RM5.00" / "-RM12.50": the sign is in the text as well as the colour. */
const delta = (cents: number) => formatMoney(fromCents(cents), { signed: true });

/**
 * "What changes": each goal (and the investing cash, or a debt) with what it
 * holds now and what it would hold. Shown live while the sheet is edited, so
 * nothing is saved on trust. Green is more, red is less.
 */
export const PlanPreview: React.FC<{ rows: PreviewRow[] }> = ({ rows }) => {
  const t = useT();
  if (rows.length === 0) return null;
  return (
    <section aria-label={t.entry.previewTitle} className="rounded-3xl bg-card px-4 py-3 text-ink">
      <p className="mb-1 text-[11.5px] font-bold text-mute">{t.entry.previewTitle}</p>
      <ul className="divide-y divide-line/10">
        {rows.map((row) => {
          const change = row.afterCents - row.beforeCents;
          return (
            <li key={row.id} className="flex min-h-11 items-center gap-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-bold">{row.name}</span>
                <span className={`block text-[11.5px] font-bold ${change < 0 ? 'text-neg' : 'text-pos'}`}>{delta(change)}</span>
              </span>
              <span
                role="img"
                aria-label={t.entry.beforeAfter(rm(row.beforeCents), rm(row.afterCents))}
                className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[13px] tabular-nums"
              >
                <span className="font-semibold text-mute">{rm(row.beforeCents)}</span>
                <Icon name="right" size={12} className="text-mute" />
                <span className="font-extrabold">{rm(row.afterCents)}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
