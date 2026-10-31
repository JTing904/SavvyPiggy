import React, { useState } from 'react';
import type { Activity, Bill, Liability, PiggyBank } from '../types';
import { formatMoney, fromCents } from '../services/money';
import { expectedCents, pendingVariable, type PendingBill } from '../services/bills';
import { pendingDebts, suggestPayment, type PendingDebt } from '../services/debts';
import { localDate } from '../services/schedules';
import { dateLocale } from '../i18n';
import { useT } from '../contexts/LanguageContext';
import ConfirmBillSheet from './ConfirmBillSheet';
import DebtPaymentSheet from './DebtPaymentSheet';
import { Button } from './ui/Button';
import { IconTile } from './ui/IconTile';

interface PendingListProps {
  bills: Bill[];
  liabilities: Liability[];
  activities: Activity[];
  banks: PiggyBank[];
  walletCents: number;
  liveFrom: Date;
  onRecordBill: (bill: Bill, day: string, amount: number) => void | Promise<void>;
  onSkipBill: (bill: Bill, day: string) => void | Promise<void>;
  onConfirmDebt: (debt: Liability, payment: { totalCents: number; interestCents: number; source: string }, day?: string) => void | Promise<void>;
  onSkipDebt: (debt: Liability, day: string) => void | Promise<void>;
}

/** How many answers the money is waiting for, for the badge on Home. */
export const pendingCount = (bills: Bill[], liabilities: Liability[], now: Date, liveFrom: Date) =>
  pendingVariable(bills, now, liveFrom).length + pendingDebts(liabilities, now, liveFrom).length;

/** Bills that change each time and repayments, each waiting for one answer. Nothing moves until it is given. */
const PendingList: React.FC<PendingListProps> = ({ bills, liabilities, activities, banks, walletCents, liveFrom, onRecordBill, onSkipBill, onConfirmDebt, onSkipDebt }) => {
  const t = useT();
  const [confirming, setConfirming] = useState<PendingBill | null>(null);
  const [paying, setPaying] = useState<PendingDebt | null>(null);
  const now = new Date();
  const waiting = pendingVariable(bills, now, liveFrom);
  const dueDebts = pendingDebts(liabilities, now, liveFrom);
  const money = (cents: number) => formatMoney(fromCents(cents));
  const dayLabel = (day: string) => localDate(day).toLocaleDateString(dateLocale('en-GB'), { day: 'numeric', month: 'short' });

  if (waiting.length === 0 && dueDebts.length === 0 && !confirming && !paying) return null;

  return (
    <div className="flex flex-col gap-2">
      <h2 className="px-1 text-[15px] font-bold">{t.bills.dueHeading}</h2>
      {waiting.map((p) => {
        const last = expectedCents(p.bill, activities);
        return (
          <div key={p.bill.id} className="rounded-3xl bg-card px-3.5 py-3">
            <div className="flex items-center gap-2.5">
              <IconTile icon="doc" tint="amber" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-bold">{t.bills.dueTitle(p.bill.name, dayLabel(p.day))}</span>
                <span className="block truncate text-[12.5px] font-semibold text-mute">{last > 0 ? t.bills.dueLast(money(last)) : t.bills.dueNone}</span>
                {p.waiting > 1 && <span className="block text-[12.5px] font-semibold text-mute">{t.bills.dueMore(p.waiting - 1)}</span>}
              </span>
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <Button onClick={() => setConfirming(p)}>{t.bills.recordPlain}</Button>
              <Button variant="ghost" className="!bg-page" onClick={() => void onSkipBill(p.bill, p.day)}>
                {t.bills.skipThis}
              </Button>
            </div>
          </div>
        );
      })}
      {dueDebts.map((p) => {
        const plan = suggestPayment(p.debt);
        return (
          <div key={p.debt.id} className="rounded-3xl bg-card px-3.5 py-3">
            <div className="flex items-center gap-2.5">
              <IconTile icon="car" tint="coral" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-bold">{t.net.dueTitle(p.debt.name, dayLabel(p.day))}</span>
                {plan && <span className="block truncate text-[12.5px] font-semibold text-mute">{t.net.dueBody(money(plan.totalCents), money(plan.interestCents))}</span>}
                {p.waiting > 1 && <span className="block text-[12.5px] font-semibold text-mute">{t.net.dueMore(p.waiting - 1)}</span>}
              </span>
            </div>
            <div className={`mt-2.5 grid gap-2 ${plan ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {plan && (
                <Button className="!px-2" onClick={() => void onConfirmDebt(p.debt, { totalCents: plan.totalCents, interestCents: plan.interestCents, source: 'wallet' }, p.day)}>
                  {t.net.confirm}
                </Button>
              )}
              <Button variant="ghost" className="!bg-page !px-2" onClick={() => setPaying(p)}>
                {t.net.change}
              </Button>
              <Button variant="ghost" className="!bg-page !px-2" onClick={() => void onSkipDebt(p.debt, p.day)}>
                {t.net.skip}
              </Button>
            </div>
          </div>
        );
      })}

      {confirming && (
        <ConfirmBillSheet
          pending={confirming}
          banks={banks}
          activities={activities}
          walletCents={walletCents}
          onRecord={(amount) => onRecordBill(confirming.bill, confirming.day, amount)}
          onSkip={() => onSkipBill(confirming.bill, confirming.day)}
          onClose={() => setConfirming(null)}
        />
      )}
      {paying && (
        <DebtPaymentSheet
          debt={paying.debt}
          mode="month"
          day={paying.day}
          banks={banks}
          walletCents={walletCents}
          onRecord={(payment) => onConfirmDebt(paying.debt, payment, paying.day)}
          onSkip={() => onSkipDebt(paying.debt, paying.day)}
          onClose={() => setPaying(null)}
        />
      )}
    </div>
  );
};

export default PendingList;
