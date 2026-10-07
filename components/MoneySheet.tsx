import React, { useMemo, useState } from 'react';
import type { Loan, PiggyBank, SavingsSettings, WalletSettings } from '../types';
import { isArchived } from '../services/ledger';
import { formatMoney, fromCents, toCents } from '../services/money';
import { amountToCents, typedFromCents } from '../services/keypad';
import { CATEGORIES, UNCATEGORISED } from '../services/categories';
import { loadLastChoices, saveLastChoices, usableChoices, withChoice, type ChoicePatch } from '../services/lastChoices';
import { atFromPicked, defaultIncomeChoice, defaultSpendSource, WALLET, type IncomeChoice } from '../services/moneySheet';
import { planIncome, walletCents, type IncomeTarget } from '../services/wallet';
import { walletProblemText } from '../services/problemText';
import { fromInputDate, readableDate, toInputDate } from '../services/calendar';
import { useT } from '../contexts/LanguageContext';
import { Sheet } from './ui/Sheet';
import { Segmented } from './ui/Segmented';
import { Chip } from './ui/Chip';
import { Tile, type TileTint } from './ui/Tile';
import { Button } from './ui/Button';
import { Amount } from './ui/Amount';
import { Keypad } from './ui/Keypad';
import { Field } from './ui/Field';
import { Icon } from './ui/Icon';
import DateField from './DateField';

type Tab = 'deposit' | 'spend';

const QUICK_AMOUNTS = [10, 25, 50, 100];
const TINTS: TileTint[] = ['peach', 'lav', 'sun', 'mint'];

interface MoneySheetProps {
  mode: Tab;
  banks: PiggyBank[];
  loans: Loan[];
  savings: SavingsSettings;
  wallet: WalletSettings;
  /** Whose remembered choices to use. */
  uid: string;
  /** The earliest day an entry can be dated: the start of the history the app keeps. */
  liveFrom: Date;
  /** `choice` is `rule`, `split`, `wallet` or a goal's id. `at` is only given for a day other than today. */
  onDeposit: (amount: number, choice: IncomeChoice, at?: Date) => void | Promise<void>;
  /** `source` is `wallet` or a goal's id. */
  onWithdraw: (amount: number, source: string, note: string, category: string, at?: Date) => void | Promise<void>;
  onClose: () => void;
}

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="mb-2 mt-5 px-0.5 text-[12.5px] font-bold text-mute">{children}</p>
);

/** One choice in a row of tinted tiles. */
const Choice: React.FC<{
  tint: TileTint;
  selected: boolean;
  onClick: () => void;
  icon?: string;
  title: string;
  small: string;
}> = ({ tint, selected, onClick, icon, title, small }) => (
  <div className="w-40 shrink-0">
    <Tile tint={tint} selected={selected} onClick={onClick}>
      <span className="flex items-center gap-1.5 pr-6 text-[14px] font-extrabold">
        {icon && <Icon name={icon} size={16} />}
        <span className="min-w-0 truncate">{title}</span>
      </span>
      <span className="mt-0.5 block text-[12px] font-semibold leading-snug opacity-70">{small}</span>
    </Tile>
  </div>
);

const targetOf = (choice: IncomeChoice): IncomeTarget =>
  choice === 'rule' || choice === 'split' || choice === 'wallet' ? { mode: choice } : { mode: 'goal', goalId: choice };

/**
 * Income and spending, in one sheet.
 *
 * Nothing is chosen for the person where a wrong guess moves money: an income
 * starts from the wallet's rule (or where it went last time), but a spend
 * starts from nothing unless it is the same as last time or the wallet is the
 * only place there is. What was chosen is remembered only after the save succeeds.
 */
const MoneySheet: React.FC<MoneySheetProps> = ({
  mode,
  banks,
  loans,
  savings,
  wallet,
  uid,
  liveFrom,
  onDeposit,
  onWithdraw,
  onClose,
}) => {
  const t = useT();
  const w = t.money;

  const goals = useMemo(() => banks.filter((b) => !isArchived(b)), [banks]);
  // Read once: what was picked last time, minus anything that no longer exists.
  const [choices] = useState(() => usableChoices(loadLastChoices(uid), banks));

  const [tab, setTab] = useState<Tab>(mode);
  const [text, setText] = useState('');
  const [choice, setChoice] = useState<IncomeChoice>(() => defaultIncomeChoice(banks, choices.depositTarget));
  /** Spend: undefined is "not chosen yet". */
  const [source, setSource] = useState<string | undefined>(() => defaultSpendSource(banks, choices.spendGoal));
  const [category, setCategory] = useState<string>(UNCATEGORISED);
  const [note, setNote] = useState('');
  const [day, setDay] = useState(() => toInputDate(Date.now()));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const cents = amountToCents(text);
  const held = walletCents(wallet);
  const percent = wallet.goalsPercent;

  const deposit = tab === 'deposit';
  const needsSource = !deposit && source === undefined;

  // The same planner the save uses, so the preview is what happens.
  const income = useMemo(
    () =>
      deposit && cents > 0
        ? planIncome({
            amountCents: cents,
            banks,
            loans: loans.filter((l) => l.outstanding > 0),
            wallet: held,
            goalsPercent: percent,
            target: targetOf(choice),
            overflow: savings.overflow,
          })
        : null,
    [deposit, cents, banks, loans, held, percent, choice, savings.overflow]
  );
  const incomeProblem = income && 'problem' in income ? income.problem : null;
  const plan = income && 'plan' in income ? income.plan : null;
  const ready = cents > 0 && !needsSource && !incomeProblem;

  const todayKey = toInputDate(Date.now());
  const pickedDay = day === todayKey ? null : new Date(fromInputDate(day));
  const pastDay = pickedDay !== null;

  const sourceGoal = !deposit && source && source !== WALLET ? goals.find((b) => b.id === source) : undefined;
  const overBalance = sourceGoal && cents > toCents(sourceGoal.currentAmount);
  // Spending past the wallet is allowed: it goes below zero and the next income clears it.
  const walletAfter = !deposit && source === WALLET ? held - cents : null;
  const overdrawn = walletAfter !== null && cents > 0 && walletAfter < 0;

  // The category used last time leads the list; nothing is preselected, so a
  // spend is never filed under a category by accident.
  const orderedCategories = useMemo(() => {
    const first = choices.spendCategory;
    return first ? [...CATEGORIES].sort((a, b) => Number(b.key === first) - Number(a.key === first)) : CATEGORIES;
  }, [choices.spendCategory]);

  const quick = useMemo(() => {
    const remembered = deposit ? choices.quick?.deposit : choices.quick?.spend;
    const fixed = QUICK_AMOUNTS.map((v) => v * 100);
    return remembered && !fixed.includes(remembered) ? [remembered, ...fixed] : fixed;
  }, [deposit, choices.quick?.deposit, choices.quick?.spend]);

  const remember = () => {
    const patch: ChoicePatch = deposit
      ? { depositTarget: choice, quick: { deposit: cents } }
      : {
          quick: { spend: cents },
          ...(typeof source === 'string' ? { spendGoal: source } : {}),
          ...(category !== UNCATEGORISED ? { spendCategory: category } : {}),
        };
    saveLastChoices(uid, withChoice(loadLastChoices(uid), patch));
  };

  const confirm = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setFailed(false);
    const value = fromCents(cents);
    const at = atFromPicked(pickedDay, new Date());
    try {
      if (deposit) await onDeposit(value, choice, at);
      else await onWithdraw(value, source as string, note.trim(), category, at);
    } catch {
      // Nothing is remembered and the sheet stays, so the amount is not lost.
      setBusy(false);
      setFailed(true);
      return;
    }
    remember();
    onClose();
  };

  const money = (c: number) => formatMoney(fromCents(c));
  const label = deposit ? (cents > 0 ? w.confirmDeposit(money(cents)) : w.deposit) : cents > 0 ? w.confirmSpend(money(cents)) : w.recordSpending;

  const footer = (
    <Button variant={deposit ? 'primary' : 'danger'} disabled={!ready} loading={busy} onClick={confirm}>
      {label}
    </Button>
  );

  return (
    <Sheet title={w.title} onClose={onClose} footer={footer} height="tall">
      <Segmented<Tab>
        ariaLabel={w.tabs}
        value={tab}
        onChange={(next) => {
          setTab(next);
          setFailed(false);
        }}
        options={[
          { value: 'deposit', label: w.deposit },
          { value: 'spend', label: w.spend },
        ]}
      />

      <Label>{deposit ? w.goesTo : w.comesFrom}</Label>
      <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
        {deposit ? (
          <>
            <Choice
              tint="mint"
              selected={choice === 'rule'}
              onClick={() => setChoice('rule')}
              title={w.byRule}
              small={w.ruleSmall(percent)}
            />
            <Choice tint="sun" selected={choice === 'wallet'} onClick={() => setChoice('wallet')} icon="wallet" title={w.keepInWallet} small={w.keepInWalletSmall} />
            {percent < 100 && (
              <Choice tint="lav" selected={choice === 'split'} onClick={() => setChoice('split')} title={w.allToGoals} small={w.allToGoalsSmall} />
            )}
            {goals.map((b, i) => (
              <Choice
                key={b.id}
                tint={TINTS[i % TINTS.length]}
                selected={choice === b.id}
                onClick={() => setChoice(b.id)}
                title={b.name}
                small={money(toCents(b.currentAmount))}
              />
            ))}
          </>
        ) : (
          <>
            <Choice
              tint="mint"
              selected={source === WALLET}
              onClick={() => setSource(WALLET)}
              icon="wallet"
              title={w.wallet}
              small={money(held)}
            />
            {goals.map((b, i) => (
              <Choice
                key={b.id}
                tint={TINTS[i % TINTS.length]}
                selected={source === b.id}
                onClick={() => setSource(b.id)}
                title={b.name}
                small={money(toCents(b.currentAmount))}
              />
            ))}
          </>
        )}
      </div>
      {needsSource && <p className="mt-2 px-0.5 text-[12.5px] font-semibold text-mute">{w.pickSource}</p>}
      {overBalance && sourceGoal && (
        <p className="mt-2 px-0.5 text-[12.5px] font-semibold text-neg">{w.overBalance(formatMoney(sourceGoal.currentAmount))}</p>
      )}
      {overdrawn && walletAfter !== null && (
        <p className="mt-3 rounded-3xl bg-sun px-4 py-3 text-[13px] font-semibold leading-snug text-ink">
          {held > 0 ? w.overdrawnFrom(money(held), money(-walletAfter)) : w.overdrawnMore(money(-walletAfter))}
        </p>
      )}

      <div
        role="group"
        aria-label={w.quickAmounts}
        className="no-scrollbar -mx-5 mt-4 flex gap-2 overflow-x-auto px-5"
      >
        {quick.map((c) => (
          <Chip key={c} selected={cents === c} onClick={() => setText(typedFromCents(c))}>
            {`RM${c / 100 === Math.round(c / 100) ? c / 100 : (c / 100).toFixed(2)}`}
          </Chip>
        ))}
      </div>

      <Keypad value={text} onChange={setText} className="mt-1" />

      {deposit && cents > 0 && plan && (
        <div className="mt-4 rounded-3xl bg-card px-4 py-3">
          <p className="mb-1.5 text-[12.5px] font-bold text-mute">{w.landsHeading}</p>
          {plan.repaidCents > 0 && <p className="mb-1.5 text-[13px] font-bold text-info">{w.coversEarlier(money(plan.repaidCents))}</p>}
          {plan.coveredCents > 0 && <p className="mb-1.5 text-[13px] font-bold text-info">{w.clearsOverdraft(money(plan.coveredCents))}</p>}
          {plan.movements.map((m) => (
            <div key={m.bankId} className="flex items-center justify-between gap-3 py-0.5">
              <span className="min-w-0 truncate text-[13.5px] font-semibold">{banks.find((b) => b.id === m.bankId)?.name}</span>
              <Amount cents={m.cents} size="sm" tone="pos" signed />
            </div>
          ))}
          {plan.walletCents > 0 && (
            <div className="flex items-center justify-between gap-3 py-0.5">
              <span className="min-w-0 truncate text-[13.5px] font-semibold">{w.wallet}</span>
              <Amount cents={plan.walletCents} size="sm" tone="pos" signed />
            </div>
          )}
        </div>
      )}

      {incomeProblem && cents > 0 && (
        <p className="mt-4 rounded-3xl bg-card px-4 py-3 text-[13px] font-bold text-neg">
          {walletProblemText({ kind: incomeProblem, goalId: choice }, t, banks)}
        </p>
      )}

      {!deposit && (
        <>
          <Label>{w.whatFor}</Label>
          <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
            {orderedCategories.map((c) => (
              <Chip key={c.key} selected={category === c.key} onClick={() => setCategory(c.key)}>
                {c.label}
              </Chip>
            ))}
          </div>
          <Field className="mt-3" label={w.note} value={note} onChange={setNote} placeholder={w.spendPlaceholder} autoComplete="off" />
        </>
      )}

      <div className="mt-4">
        <DateField
          label={w.date}
          value={day}
          onChange={setDay}
          min={liveFrom}
          max={todayKey}
          title={w.pickDayTitle}
          hint={w.pickDayHint}
          renderTrigger={(open) => (
            <button
              type="button"
              onClick={open}
              className="flex min-h-14 w-full items-center gap-3 rounded-[18px] bg-field px-4 py-2.5 text-left active:opacity-80"
            >
              <Icon name="cal" size={20} className="text-mute" />
              <span className="min-w-0 flex-1">
                <span className="block text-[11.5px] font-bold text-mute">{w.date}</span>
                <span className="block truncate text-base font-semibold">{pastDay ? readableDate(day) : w.dateToday}</span>
              </span>
              {pastDay && (
                <span className="shrink-0 rounded-full bg-sun px-2.5 py-1 text-[11.5px] font-extrabold text-ink">{w.backDated}</span>
              )}
              <Icon name="chev" size={18} className="text-mute" />
            </button>
          )}
        />
      </div>

      {failed && (
        <p role="alert" className="mt-4 rounded-3xl bg-card px-4 py-3 text-[13px] font-bold text-neg">
          {t.ui.toastError}
        </p>
      )}
    </Sheet>
  );
};

export default MoneySheet;
