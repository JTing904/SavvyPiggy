import React, { useState } from 'react';
import type { Activity, Bill, PiggyBank, Schedule } from '../types';
import type { NewBill } from '../services/firestore';
import { categoryOf } from '../services/categories';
import { billSchedule, expectedCents, upcomingBills, WALLET_SOURCE } from '../services/bills';
import { formatMoney, fromCents } from '../services/money';
import { describe, localDate, nextOccurrence, scheduleDay } from '../services/schedules';
import { soonestFirst } from '../services/sorting';
import { useT } from '../contexts/LanguageContext';
import { Group } from './ui/Group';
import { Row } from './ui/Row';
import { Amount } from './ui/Amount';
import { Button } from './ui/Button';
import { Icon } from './ui/Icon';
import { PageBand } from './ui/PageBand';
import { Toggle } from './ui/Toggle';
import BillSheet from './BillSheet';
import DepositRuleSheet from './DepositRuleSheet';

type DepositShape = Pick<Schedule, 'amount' | 'frequency' | 'weekday' | 'dayOfMonth' | 'month' | 'targetBankId'>;

interface AutoPageProps {
  schedules: Schedule[];
  bills: Bill[];
  banks: PiggyBank[];
  /** For what each bill usually costs. */
  activities: Activity[];
  onBack: () => void;
  onCreateSchedule: (schedule: Omit<Schedule, 'id' | 'createdAt' | 'lastRunAt'>) => Promise<void> | void;
  onUpdateSchedule: (id: string, patch: Partial<DepositShape>) => Promise<void> | void;
  onToggleSchedule: (id: string, enabled: boolean) => void;
  onDeleteSchedule: (id: string) => void;
  onCreateBill: (bill: NewBill) => Promise<void> | void;
  onUpdateBill: (id: string, patch: Partial<Bill>) => Promise<void> | void;
  onDeleteBill: (id: string) => void;
}

type Open = { kind: 'bill'; bill?: Bill } | { kind: 'deposit'; schedule?: Schedule } | null;

/**
 * Everything that happens on its own: bills that go out, and deposits that go
 * in. Both fall due on the same kind of repeating day, so they share a page.
 */
const AutoPage: React.FC<AutoPageProps> = ({
  schedules,
  bills,
  banks,
  activities,
  onBack,
  onCreateSchedule,
  onUpdateSchedule,
  onToggleSchedule,
  onDeleteSchedule,
  onCreateBill,
  onUpdateBill,
  onDeleteBill,
}) => {
  const t = useT();
  const b = t.bills;
  const [open, setOpen] = useState<Open>(null);

  // The next seven days from today, with a dot on each day a bill falls due.
  const now = new Date();
  const coming = upcomingBills(bills, activities, now, 7);
  const today = scheduleDay(now);
  const start = today ? localDate(today) : now;
  const days = Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const dueOn = (day: Date) => coming.filter((u) => localDate(u.day).getTime() === day.getTime());

  const goalName = (id: string | null) =>
    id === WALLET_SOURCE ? t.wallet.name : id ? (banks.find((g) => g.id === id)?.name ?? t.profile.deletedGoal) : b.bySplit;
  const sourceName = (id: string) => (id === WALLET_SOURCE ? t.wallet.name : goalName(id));

  return (
    <div className="flex min-h-full flex-col pb-40 font-figtree text-ink">
      <PageBand
        title={b.autoTitle}
        onBack={onBack}
        overlap={16}
        trailing={
          <button type="button" onClick={() => setOpen({ kind: 'bill' })} className="-mr-2 flex min-h-11 shrink-0 items-center gap-1 px-2 text-[14px] font-bold active:opacity-70">
            <Icon name="plus" size={19} strokeWidth={2.4} />
            {b.newBill}
          </button>
        }
      />

      <div className="-mt-[58px] flex flex-col gap-2.5 px-4">
        <div className="rounded-3xl bg-card px-3.5 py-3 shadow-[0_2px_10px_rgba(20,35,58,0.1)]">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-[15px] font-bold">{b.upcomingHeading}</h2>
            <span className="truncate text-[13px] font-semibold tabular-nums text-mute">{t.pro.bills.due(formatMoney(fromCents(coming.reduce((sum, u) => sum + u.cents, 0)), { symbol: false }))}</span>
          </div>
          <div className="mt-2.5 grid grid-cols-7 text-center text-[12px] font-semibold text-mute">
            {days.map((day, i) => (
              <span key={day.getTime()} className="min-w-0">
                <span className="block">{t.common.weekdaysNarrow[day.getDay()]}</span>
                <span className={`block text-[14.5px] font-bold tabular-nums ${i === 0 ? 'text-tblue' : 'text-ink'}`}>{day.getDate()}</span>
                <span className="mt-0.5 flex h-2 justify-center gap-0.5">
                  {dueOn(day)
                    .slice(0, 3)
                    .map((u) => (
                      <span key={u.bill.id} className="size-2 rounded-full bg-c1" />
                    ))}
                </span>
              </span>
            ))}
          </div>
        </div>

        <p className="px-1 text-[13px] font-medium leading-relaxed text-mute">{b.intro}</p>

        <div className="mt-1 flex items-baseline justify-between px-1">
          <h2 className="text-[15px] font-bold">{b.billsHeading}</h2>
          <span className="text-[12.5px] font-semibold text-mute">{bills.length}</span>
        </div>
        {bills.length === 0 ? (
          <p className="rounded-3xl bg-card px-5 py-8 text-center text-[13px] font-semibold text-mute">{b.noBills}</p>
        ) : (
          <Group>
            {soonestFirst(bills, (bill) => nextOccurrence(billSchedule(bill))).map((bill) => {
              const expected = expectedCents(bill, activities);
              return (
                <Row
                  key={bill.id}
                  icon={bill.mode === 'fixed' ? 'repeat' : 'bell'}
                  tint={bill.mode === 'fixed' ? 'mint' : 'sun'}
                  title={
                    <>
                      {bill.name}
                      <span className="ml-1.5 rounded-md bg-page px-1.5 py-0.5 align-middle text-[11.5px] font-bold text-mute">
                        {!bill.enabled ? b.pausedTag : bill.mode === 'fixed' ? b.fixedTag : b.askTag}
                      </span>
                    </>
                  }
                  sub={b.rowSub(describe(bill), sourceName(bill.sourceId), categoryOf(bill.category).label)}
                  trailing={
                    bill.mode === 'fixed' ? (
                      <Amount cents={Math.round(bill.amount * 100)} size="sm" tone={bill.enabled ? 'neg' : 'mute'} />
                    ) : expected > 0 ? (
                      b.about(formatMoney(fromCents(expected)))
                    ) : (
                      b.unknownAmount
                    )
                  }
                  tone={bill.enabled ? 'ink' : 'mute'}
                  onClick={() => setOpen({ kind: 'bill', bill })}
                />
              );
            })}
          </Group>
        )}
        <div className="mt-2 flex items-baseline justify-between px-1">
          <h2 className="text-[15px] font-bold">{b.depositsHeading}</h2>
          <span className="text-[12.5px] font-semibold text-mute">{schedules.length}</span>
        </div>
        {schedules.length === 0 ? (
          <p className="rounded-3xl bg-card px-5 py-8 text-center text-[13px] font-semibold text-mute">{b.noDeposits}</p>
        ) : (
          <Group>
            {soonestFirst(schedules, (s) => nextOccurrence(s)).map((s) => (
              <Row
                key={s.id}
                icon="dep"
                tint="mint"
                title={b.depositRowTitle(formatMoney(s.amount))}
                sub={b.depositRowSub(describe(s), goalName(s.targetBankId))}
                trailing={<Toggle checked={s.enabled} onChange={(on) => onToggleSchedule(s.id, on)} label={b.toggleLabel(formatMoney(s.amount))} />}
                tone={s.enabled ? 'ink' : 'mute'}
                onClick={() => setOpen({ kind: 'deposit', schedule: s })}
              />
            ))}
          </Group>
        )}
        <Button full={false} variant="ghost" className="self-start" onClick={() => setOpen({ kind: 'deposit' })}>
          <Icon name="plus" size={16} strokeWidth={2.4} />
          {b.newDeposit}
        </Button>
      </div>

      {open?.kind === 'bill' && (
        <BillSheet
          bill={open.bill}
          banks={banks}
          onSave={(shape) => (open.bill ? onUpdateBill(open.bill.id, shape as Partial<Bill>) : onCreateBill(shape as NewBill))}
          onDelete={open.bill ? () => onDeleteBill((open.bill as Bill).id) : undefined}
          onClose={() => setOpen(null)}
        />
      )}
      {open?.kind === 'deposit' && (
        <DepositRuleSheet
          schedule={open.schedule}
          banks={banks}
          onSave={(shape) =>
            open.schedule
              ? onUpdateSchedule(open.schedule.id, shape as Partial<DepositShape>)
              : onCreateSchedule({ ...(shape as DepositShape), enabled: true })
          }
          onDelete={open.schedule ? () => onDeleteSchedule((open.schedule as Schedule).id) : undefined}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
};

export default AutoPage;
