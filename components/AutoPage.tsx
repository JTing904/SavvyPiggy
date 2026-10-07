import React, { useState } from 'react';
import type { Activity, Bill, PiggyBank, Schedule } from '../types';
import type { NewBill } from '../services/firestore';
import { categoryOf } from '../services/categories';
import { billSchedule, expectedCents, WALLET_SOURCE } from '../services/bills';
import { formatMoney, fromCents } from '../services/money';
import { describe, nextOccurrence } from '../services/schedules';
import { soonestFirst } from '../services/sorting';
import { useT } from '../contexts/LanguageContext';
import { Group } from './ui/Group';
import { Row } from './ui/Row';
import { Amount } from './ui/Amount';
import { Button } from './ui/Button';
import { Icon } from './ui/Icon';
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

  const goalName = (id: string | null) =>
    id === WALLET_SOURCE ? t.wallet.name : id ? (banks.find((g) => g.id === id)?.name ?? t.profile.deletedGoal) : b.bySplit;
  const sourceName = (id: string) => (id === WALLET_SOURCE ? t.wallet.name : goalName(id));

  return (
    <div className="flex min-h-full flex-col px-4 pb-40 pt-3 safe-pt font-figtree text-ink">
      <div className="mb-1 flex items-center gap-3 px-1">
        <button type="button" onClick={onBack} aria-label={t.common.back} className="grid size-11 place-items-center rounded-full bg-card active:opacity-80">
          <Icon name="back" size={20} />
        </button>
      </div>
      <h1 className="px-1 text-[30px] font-extrabold tracking-tight">{b.autoTitle}</h1>
      <p className="mt-1 px-1 text-[13.5px] font-medium leading-relaxed text-mute">{b.intro}</p>

      <div className="mb-2 mt-6 flex items-baseline justify-between px-1">
        <h2 className="text-[16px] font-extrabold">{b.billsHeading}</h2>
        <span className="text-[12.5px] font-bold text-mute">{bills.length}</span>
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
                    <span className="ml-2 rounded-full bg-field px-2 py-0.5 align-middle text-[10.5px] font-extrabold text-mute">
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
      <Button full={false} variant="ghost" className="mt-3 self-start" onClick={() => setOpen({ kind: 'bill' })}>
        <Icon name="plus" size={16} strokeWidth={2.4} />
        {b.newBill}
      </Button>

      <div className="mb-2 mt-8 flex items-baseline justify-between px-1">
        <h2 className="text-[16px] font-extrabold">{b.depositsHeading}</h2>
        <span className="text-[12.5px] font-bold text-mute">{schedules.length}</span>
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
      <Button full={false} variant="ghost" className="mt-3 self-start" onClick={() => setOpen({ kind: 'deposit' })}>
        <Icon name="plus" size={16} strokeWidth={2.4} />
        {b.newDeposit}
      </Button>

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
