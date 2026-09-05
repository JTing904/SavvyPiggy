import type { Activity, PiggyBank } from '../types';

/**
 * A flat statement: one row per transaction, one column per goal holding the
 * signed amount that reached it. Opens cleanly in Excel / Sheets and carries
 * everything needed to rebuild the ledger later.
 */

const TYPE_LABEL: Record<Activity['type'], string> = {
  'auto-save': 'Scheduled deposit',
  manual: 'Deposit',
  withdraw: 'Withdrawal',
  borrow: 'Borrowed',
};

/** Quotes a cell when it holds anything CSV treats specially. */
const cell = (value: string | number) => {
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const money = (n: number) => n.toFixed(2);

const pad = (n: number) => String(n).padStart(2, '0');
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export const buildCsv = (activities: Activity[], banks: PiggyBank[]): string => {
  // Distributions pointing at a goal that has since been deleted still hold
  // money that moved, so they get a column of their own.
  const orphaned = activities.some((a) =>
    a.distributions.some((d) => !banks.some((b) => b.id === d.bankId))
  );

  const header = [
    'Date',
    'Time',
    'Type',
    'Amount',
    'Repaid debt',
    'Note',
    ...banks.map((b) => b.name),
    ...(orphaned ? ['Deleted goals'] : []),
  ];

  const rows = [...activities]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((a) => {
      const d = new Date(a.date);
      const perBank = banks.map((b) => {
        const sum = a.distributions.filter((x) => x.bankId === b.id).reduce((s, x) => s + x.amount, 0);
        return sum === 0 ? '' : money(sum);
      });
      const other = a.distributions
        .filter((x) => !banks.some((b) => b.id === x.bankId))
        .reduce((s, x) => s + x.amount, 0);

      return [
        localDate(d),
        localTime(d),
        TYPE_LABEL[a.type] ?? a.type,
        money(a.amount),
        a.repaid ? money(a.repaid) : '',
        a.note ?? '',
        ...perBank,
        ...(orphaned ? [other === 0 ? '' : money(other)] : []),
      ];
    });

  // The BOM makes Excel read the file as UTF-8, so non-Latin goal names survive.
  return '﻿' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
};

/** "SavvyPiggy_2026-09-05_Month.csv" — safe on every filesystem. */
export const exportFileName = (label: string, ext: string, now: Date = new Date()) =>
  `SavvyPiggy_${localDate(now)}_${label.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')}.${ext}`;
