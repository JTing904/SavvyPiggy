import React, { useEffect, useMemo, useState } from 'react';
import type { Activity, Loan, PiggyBank, SavingsSettings, WalletSettings } from '../types';
import { isArchived } from '../services/ledger';
import { formatMoney, fromCents, toCents } from '../services/money';
import { amountToCents, typedFromCents } from '../services/keypad';
import { CATEGORIES, categoryOf, UNCATEGORISED } from '../services/categories';
import { findDuplicate, parseQuick } from '../services/quickParse';
import { canReadPictures, compressPicture, pickPicture, readPicture, type QuickDraft } from '../services/quickRead';
import type { ReceiptRead } from '../services/receipt';
import { loadLastChoices, saveLastChoices, usableChoices, withChoice, type ChoicePatch } from '../services/lastChoices';
import { atFromPicked, defaultIncomeChoice, WALLET, type IncomeChoice } from '../services/moneySheet';
import { debtExistedOn } from '../services/activityDate';
import { isInSplit } from '../services/ledger';
import { planIncome, walletCents, type IncomeTarget } from '../services/wallet';
import { walletProblemText } from '../services/problemText';
import { fromInputDate, readableDate, toInputDate } from '../services/calendar';
import { useT } from '../contexts/LanguageContext';
import { safeGoalIcon } from '../services/goalIcons';
import { useBackHandler } from '../hooks/useBackHandler';
import { Sheet } from './ui/Sheet';
import { Chip } from './ui/Chip';
import { Button } from './ui/Button';
import { Keypad } from './ui/Keypad';
import { IconTile, TINT_ORDER, type IconTint } from './ui/IconTile';
import { PageBand } from './ui/PageBand';
import { StackedBar, Swatch, type ChartColor } from './ui/Charts';
import { Toggle } from './ui/Toggle';
import { Icon } from './ui/Icon';
import DateField from './DateField';

type Tab = 'deposit' | 'spend';

interface MoneySheetProps {
  mode: Tab;
  banks: PiggyBank[];
  loans: Loan[];
  savings: SavingsSettings;
  wallet: WalletSettings;
  /** What is on the books, to warn before the same spending is recorded twice. */
  activities: Activity[];
  /** Text or a picture shared in from another app, to start from. */
  draft?: QuickDraft;
  /** Opens straight on choosing a picture to read. */
  scan?: boolean;
  /** The goal a spend starts from, when the sheet was opened from that goal's page. */
  fromGoal?: string;
  /** Where "change the shares" goes from the income page. */
  onOpenStrategy?: () => void;
  /** Whose remembered choices to use. */
  uid: string;
  /** The earliest day an entry can be dated: the start of the history the app keeps. */
  liveFrom: Date;
  /** `choice` is `split`, `wallet` or a goal's id. `at` is only given for a day other than today. */
  onDeposit: (amount: number, choice: IncomeChoice, at?: Date) => void | Promise<void>;
  /** `source` is `wallet` or a goal's id. */
  /** `extras.receipts` are compressed pictures (base64) to keep with the entry. */
  onWithdraw: (amount: number, source: string, note: string, category: string, at?: Date, extras?: { receipts?: string[] }) => void | Promise<void>;
  onClose: () => void;
}

const targetOf = (choice: IncomeChoice): IncomeTarget =>
  choice === 'split' || choice === 'wallet' ? { mode: choice } : { mode: 'goal', goalId: choice };

/**
 * Income and spending, in one sheet.
 *
 * An income starts in the wallet or where it went last time, a spend from the
 * wallet or the goal used last time, and both say so on the page before saving.
 * What was chosen is remembered only after the save succeeds.
 */
const MoneySheet: React.FC<MoneySheetProps> = ({
  mode,
  banks,
  loans,
  savings,
  wallet,
  activities,
  draft,
  scan = false,
  fromGoal,
  onOpenStrategy,
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

  useBackHandler(true, onClose);
  const [tab, setTab] = useState<Tab>(mode);
  const [choosing, setChoosing] = useState(scan);
  const [pickingSource, setPickingSource] = useState(false);
  const [showAll, setShowAll] = useState(false);
  /** A picture that was read leaves the keys folded away: there is nothing to type. */
  const [keysOpen, setKeysOpen] = useState(true);
  const [text, setText] = useState('');
  const [choice, setChoice] = useState<IncomeChoice>(() => defaultIncomeChoice(banks, choices.depositTarget));
  /** Spend: undefined is "not chosen yet". */
  const [source, setSource] = useState<string | undefined>(() => fromGoal ?? WALLET);
  const [category, setCategory] = useState<string>(UNCATEGORISED);
  const [note, setNote] = useState('');
  const [day, setDay] = useState(() => toInputDate(Date.now()));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  // Text shared in, or a picture. Either one fills the fields below, which stay editable.
  const q = t.quick;
  const [line, setLine] = useState(draft?.text ?? '');
  const [reading, setReading] = useState(false);
  const [readInfo, setReadInfo] = useState<ReceiptRead | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  /** Amounts to choose from, when the line or the picture has several and does not say which. */
  const [options, setOptions] = useState<number[]>([]);
  const [repeatAsked, setRepeatAsked] = useState(false);
  /** The picture just read, kept in memory only; it is saved with the entry only when the person says so. */
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [attach, setAttach] = useState(false);

  const parsed = useMemo(
    () =>
      line.trim()
        ? parseQuick(line, { goals: goals.map((g) => ({ id: g.id, name: g.name })), now: new Date(), liveFrom })
        : null,
    // Only a new line is read again: a goal changing must not write over what was edited since.
    [line] // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(() => {
    if (!parsed) return;
    setReadInfo(null);
    setReadError(null);
    setReceiptImage(null);
    setAttach(false);
    setTab(parsed.kind === 'income' ? 'deposit' : 'spend');
    setText(parsed.cents !== null ? typedFromCents(parsed.cents) : '');
    setOptions(parsed.issues.includes('manyAmounts') ? parsed.amounts : []);
    setCategory(parsed.category ?? UNCATEGORISED);
    setNote(parsed.note);
    setDay(parsed.day ? toInputDate(parsed.day.getTime()) : toInputDate(Date.now()));
    // Where it comes from or goes to: the goal the line names, otherwise the wallet, and the sheet says so.
    if (parsed.kind === 'income') setChoice(parsed.goalId ?? WALLET);
    else setSource(parsed.goalId ?? WALLET);
  }, [parsed]);

  const earliest = new Date(liveFrom.getFullYear(), liveFrom.getMonth(), liveFrom.getDate()).getTime();
  const applyRead = (r: ReceiptRead) => {
    setLine('');
    setKeysOpen(r.cents === null);
    setReadInfo(r);
    setOptions(r.cents === null ? r.candidates : []);
    setTab(r.income ? 'deposit' : 'spend');
    setText(r.cents !== null ? typedFromCents(r.cents) : '');
    setCategory(UNCATEGORISED);
    setNote(r.merchant ?? '');
    setDay(r.day && r.day.getTime() >= earliest ? toInputDate(r.day.getTime()) : toInputDate(Date.now()));
  };
  const readFrom = async (uri: string) => {
    setReading(true);
    setReadError(null);
    setReadInfo(null);
    setReceiptImage(null);
    setAttach(false);
    try {
      // A small copy first, while the photo still exists (reading it deletes a photo just taken).
      const copy = await compressPicture(uri, false).catch(() => null);
      applyRead(await readPicture(uri));
      setReceiptImage(copy);
    } catch {
      setReadError(q.readFailed);
    } finally {
      setReading(false);
    }
  };
  const pick = async (source: 'camera' | 'gallery') => {
    setReadError(null);
    try {
      const uri = await pickPicture(source);
      if (uri) await readFrom(uri);
    } catch {
      setReadError(q.readFailed);
    }
  };
  useEffect(() => {
    if (draft?.imageUri) void readFrom(draft.imageUri);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cents = amountToCents(text);
  const held = walletCents(wallet);

  const deposit = tab === 'deposit';
  const needsSource = !deposit && source === undefined;

  const todayKey = toInputDate(Date.now());
  const pickedDay = day === todayKey ? null : new Date(fromInputDate(day));
  const pastDay = pickedDay !== null;

  // The same planner the save uses, so the preview is what happens.
  const income = useMemo(
    () =>
      deposit && cents > 0
        ? planIncome({
            amountCents: cents,
            banks,
            // A back-dated income can only repay a debt already owed that day, as the save decides.
            loans: loans.filter((l) => l.outstanding > 0 && (!pickedDay || debtExistedOn(new Date(l.createdAt).toISOString(), pickedDay))),
            wallet: held,
            target: targetOf(choice),
            overflow: savings.overflow,
          })
        : null,
    [deposit, cents, banks, loans, held, choice, savings.overflow, day] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const incomeProblem = income && 'problem' in income ? income.problem : null;
  const plan = income && 'plan' in income ? income.plan : null;
  const ready = cents > 0 && !needsSource && !incomeProblem;

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

  const remember = () => {
    const patch: ChoicePatch = deposit
      ? { depositTarget: choice, quick: { deposit: cents } }
      : {
          quick: { spend: cents },
          ...(category !== UNCATEGORISED ? { spendCategory: category } : {}),
        };
    saveLastChoices(uid, withChoice(loadLastChoices(uid), patch));
  };

  // The same spending twice is asked about once; any change to it asks again.
  useEffect(() => setRepeatAsked(false), [cents, category, day, tab, source]);

  /** `again` keeps the page open, cleared for the next spending. */
  const confirm = async (again = false) => {
    if (!ready || busy) return;
    if (!deposit && !repeatAsked && findDuplicate(activities, { cents, category, day: pickedDay }, new Date())) {
      setRepeatAsked(true);
      return;
    }
    setBusy(true);
    setFailed(false);
    const value = fromCents(cents);
    const at = atFromPicked(pickedDay, new Date());
    try {
      if (deposit) await onDeposit(value, choice, at);
      else await onWithdraw(value, source as string, note.trim(), category, at, attach && receiptImage ? { receipts: [receiptImage] } : undefined);
    } catch {
      // Nothing is remembered and the sheet stays, so the amount is not lost.
      setBusy(false);
      setFailed(true);
      return;
    }
    remember();
    if (!again) return onClose();
    setBusy(false);
    setText('');
    setNote('');
    setLine('');
    setOptions([]);
    setCategory(UNCATEGORISED);
    setReadInfo(null);
    setReceiptImage(null);
    setAttach(false);
    setRepeatAsked(false);
    setKeysOpen(true);
  };

  const money = (c: number) => formatMoney(fromCents(c));
  const p = t.pro.sheet;

  const sourceName = source === WALLET || source === undefined ? w.wallet : goals.find((b) => b.id === source)?.name ?? w.wallet;
  const shownCategories = showAll ? orderedCategories : orderedCategories.slice(0, 7);

  const band = (
    <PageBand
      title={deposit ? p.income : p.spend}
      onClose={onClose}
      trailing={
        <span className="-mr-2.5 flex shrink-0">
          {canReadPictures() && (
            <button type="button" onClick={() => setChoosing(true)} aria-label={p.scan} className="grid size-11 place-items-center active:opacity-70">
              <Icon name="camera" size={22} strokeWidth={1.9} />
            </button>
          )}
        </span>
      }
    >
      <button type="button" onClick={() => setKeysOpen(true)} className="mt-1 block max-w-full text-left active:opacity-80">
        <span className="block truncate text-[38px] font-bold leading-[1.15] tracking-[-0.015em] tabular-nums">{money(cents)}</span>
        {readInfo?.evidence.amount ? (
          <span className="mt-0.5 block truncate text-[13.5px] font-semibold text-band-sub">{p.readFrom(readInfo.evidence.amount)}</span>
        ) : null}
      </button>
    </PageBand>
  );

  const manyAmounts = options.length > 0 && (
    <div>
      <p className="mb-1.5 px-0.5 text-[12.5px] font-bold text-mute">{readInfo ? q.readPick : q.manyAmounts}</p>
      <div role="group" aria-label={q.manyAmounts} className="flex flex-wrap gap-2">
        {options.map((c) => (
          <Chip key={c} selected={cents === c} onClick={() => setText(typedFromCents(c))}>
            {money(c)}
          </Chip>
        ))}
      </div>
    </div>
  );

  const readNotes = (
    <>
      {reading && <p className="px-0.5 text-[13px] font-semibold text-mute">{q.reading}</p>}
      {readError && <p className="rounded-3xl bg-card px-4 py-3 text-[13px] font-bold text-neg">{readError}</p>}
      {readInfo && (readInfo.zeroPaid || (readInfo.cents === null && readInfo.candidates.length > 0)) && (
        <p className="rounded-3xl bg-sun px-4 py-3 text-[13px] font-semibold">{readInfo.zeroPaid ? q.readZero : q.readNoAmount}</p>
      )}
      {readInfo && readInfo.cents === null && !readInfo.zeroPaid && readInfo.candidates.length === 0 && !readInfo.day && !readInfo.merchant && (
        <p className="rounded-3xl bg-sun px-4 py-3 text-[13px] font-semibold">{q.readEmpty}</p>
      )}
      {readInfo && !readInfo.day && <p className="px-0.5 text-[12.5px] font-semibold text-mute">{q.readNoDate}</p>}
      {readInfo?.day && readInfo.day.getTime() < earliest && <p className="px-0.5 text-[12.5px] font-semibold text-mute">{q.readTooOld}</p>}
      {readInfo && <p className="px-0.5 text-[12.5px] font-medium text-mute">{q.readOnPhone}</p>}
      {receiptImage && !deposit && (
        <div className="flex items-center gap-3 rounded-3xl bg-card px-3.5 py-2.5">
          <img src={`data:image/jpeg;base64,${receiptImage}`} alt="" className="h-12 w-9 shrink-0 rounded-md object-cover" />
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-bold">{t.net.attach}</span>
            <span className="block text-[12.5px] font-medium text-mute">{t.net.attachHint}</span>
          </span>
          <Toggle checked={attach} onChange={setAttach} label={t.net.attach} />
        </div>
      )}
      {repeatAsked && (
        <div className="rounded-3xl bg-sun px-4 py-3 text-[13px] font-semibold leading-snug">
          <p className="font-extrabold">{q.dupTitle}</p>
          <p className="mt-0.5">{q.dupBody(money(cents), categoryOf(category).label)}</p>
        </div>
      )}
    </>
  );

  const failure = failed && (
    <p role="alert" className="rounded-3xl bg-card px-4 py-3 text-[13px] font-bold text-neg">
      {t.ui.toastError}
    </p>
  );

  const dayButton = (
    <DateField
      label={w.date}
      value={day}
      onChange={setDay}
      min={liveFrom}
      max={todayKey}
      title={w.pickDayTitle}
      hint={w.pickDayHint}
      renderTrigger={(open) => (
        <button type="button" onClick={open} className="flex min-h-12 w-full min-w-0 items-center gap-2 rounded-xl bg-card px-3 text-left text-[14px] font-bold active:opacity-80">
          <Icon name="cal" size={20} strokeWidth={2} className="shrink-0 text-tblue" />
          <span className="min-w-0 flex-1 truncate">{pastDay ? readableDate(day) : w.dateToday}</span>
          {pastDay && <span className="shrink-0 rounded-full bg-sun px-2 py-0.5 text-[11.5px] font-bold">{w.backDated}</span>}
        </button>
      )}
    />
  );

  const frame = (children: React.ReactNode) => (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 overflow-y-auto bg-page font-figtree text-ink no-scrollbar">
      <div className="mx-auto flex min-h-full max-w-xl flex-col">
        {band}
        <div className="flex flex-1 flex-col gap-2.5 px-4 pt-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}>
          {children}
        </div>
      </div>
      {choosing && (
        <Sheet title={p.scan} z={60} onClose={() => setChoosing(false)}>
          <div className="grid grid-cols-2 gap-2 pb-2">
            <Button variant="ghost" onClick={() => { setChoosing(false); void pick('camera'); }}>
              <Icon name="camera" size={20} strokeWidth={2} />
              {q.fromCamera}
            </Button>
            <Button variant="ghost" onClick={() => { setChoosing(false); void pick('gallery'); }}>
              <Icon name="image" size={20} strokeWidth={2} />
              {q.fromGallery}
            </Button>
          </div>
        </Sheet>
      )}
      {pickingSource && (
        <Sheet title={w.comesFrom} z={60} onClose={() => setPickingSource(false)}>
          <div className="divide-y divide-line/10 rounded-3xl bg-card px-3.5">
            {[{ id: WALLET, name: w.wallet, cents: held, icon: 'wallet' as React.ReactNode, tint: 'teal' as IconTint }, ...goals.map((b, i) => ({
              id: b.id,
              name: b.name,
              cents: toCents(b.currentAmount),
              icon: <span className="material-symbols-rounded text-[20px] leading-none">{safeGoalIcon(b.icon)}</span> as React.ReactNode,
              tint: TINT_ORDER[i % TINT_ORDER.length],
            }))].map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  setSource(option.id);
                  setPickingSource(false);
                }}
                className="flex min-h-14 w-full items-center gap-2.5 py-1.5 text-left active:opacity-70"
              >
                <IconTile icon={option.icon} tint={option.tint} size={38} />
                <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{option.name}</span>
                <span className="shrink-0 text-[13px] font-semibold tabular-nums text-mute">{money(option.cents)}</span>
                {source === option.id && <Icon name="check" size={18} strokeWidth={2.4} className="text-tblue" />}
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  );

  if (deposit) {
    const goalChoice = choice !== 'wallet' && choice !== 'split';
    const colorOf = (id: string) => ((Math.max(0, goals.findIndex((b) => b.id === id)) % 5) + 1) as ChartColor;
    // Before an amount is typed the same rows show at zero, so the page already says where it will go.
    const lands: { id: string; cents: number; share?: number }[] = plan
      ? [
          ...plan.movements.map((m) => ({ id: m.bankId, cents: m.cents, share: choice === 'split' ? goals.find((b) => b.id === m.bankId)?.splitPercentage : undefined })),
          ...(plan.walletCents > 0 ? [{ id: WALLET, cents: plan.walletCents }] : []),
        ]
      : choice === 'split'
        ? goals.filter((b) => b.splitPercentage > 0).map((b) => ({ id: b.id, cents: 0, share: b.splitPercentage }))
        : [{ id: choice, cents: 0 }];
    const slices = lands.filter((l) => l.id !== WALLET).map((l) => ({ value: plan ? l.cents : l.share ?? 0, color: colorOf(l.id) }));
    return frame(
      <>
        {manyAmounts}
        {readNotes}
        <div className="grid grid-cols-3 gap-2">
          {[
            { key: 'wallet', icon: 'wallet', tint: 'teal' as IconTint, label: p.keep, on: choice === 'wallet', go: () => setChoice('wallet') },
            ...(goals.some(isInSplit)
              ? [{ key: 'split', icon: 'pie', tint: 'blue' as IconTint, label: p.bySplit, on: choice === 'split', go: () => setChoice('split') }]
              : []),
            ...(goals.length > 0
              ? [{ key: 'goal', icon: 'target', tint: 'amber' as IconTint, label: p.oneGoal, on: goalChoice, go: () => !goalChoice && setChoice(goals[0].id) }]
              : []),
          ].map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={option.on}
              onClick={option.go}
              className={`flex min-h-[92px] flex-col items-center justify-center gap-1.5 rounded-3xl bg-card px-1 text-[13px] font-bold active:opacity-80 sm:min-h-[104px] sm:text-[14px] ${option.on ? 'outline outline-2 -outline-offset-2 outline-cta' : ''}`}
            >
              <IconTile icon={option.icon} tint={option.tint} />
              <span className="w-full truncate text-center">{option.label}</span>
            </button>
          ))}
        </div>

        {goalChoice && (
          <div role="group" aria-label={p.oneGoal} className="flex flex-wrap gap-2">
            {goals.map((b) => (
              <Chip key={b.id} selected={choice === b.id} onClick={() => setChoice(b.id)}>
                {b.name}
              </Chip>
            ))}
          </div>
        )}

        <div className="rounded-3xl bg-card px-3.5 py-2">
          <div className="flex min-h-9 items-center justify-between gap-2">
            <h2 className="text-[15px] font-bold">{p.lands}</h2>
            {choice === 'split' && onOpenStrategy && (
              <button type="button" onClick={onOpenStrategy} className="min-h-9 text-[13.5px] font-bold text-tblue active:opacity-70">
                {p.changeSplit}
              </button>
            )}
          </div>
          {slices.length > 1 && <StackedBar slices={slices} label={p.lands} height={14} />}
          {plan && plan.repaidCents > 0 && <p className="mt-1.5 text-[13px] font-bold text-info">{w.coversEarlier(money(plan.repaidCents))}</p>}
          {plan && plan.coveredCents > 0 && <p className="mt-1.5 text-[13px] font-bold text-info">{w.clearsOverdraft(money(plan.coveredCents))}</p>}
          <div className="mt-0.5 divide-y divide-line/10">
            {lands.map((l) => (
              <div key={l.id} className="flex min-h-11 items-center gap-2.5 text-[14.5px] font-bold tabular-nums sm:min-h-[52px] sm:text-[15px]">
                {l.id === WALLET ? <Icon name="wallet" size={16} strokeWidth={2} className="text-tteal" /> : <Swatch color={colorOf(l.id)} />}
                <span className="min-w-0 flex-1 truncate">
                  {l.id === WALLET ? w.wallet : goals.find((b) => b.id === l.id)?.name}
                  {l.share !== undefined && l.share > 0 && <span className="ml-1.5 text-[13px] font-semibold text-mute">{l.share}%</span>}
                </span>
                <span className={l.cents > 0 ? 'text-pos' : 'text-mute'}>+{money(l.cents)}</span>
              </div>
            ))}
          </div>
        </div>

        {incomeProblem && <p className="rounded-3xl bg-card px-4 py-3 text-[13px] font-bold text-neg">{walletProblemText({ kind: incomeProblem, goalId: choice }, t, banks)}</p>}
        {dayButton}
        {failure}
        <div className="mt-auto pt-1">
          <Keypad value={text} onChange={setText} compact />
          <Button className="mt-2.5" disabled={!ready} loading={busy} onClick={() => void confirm()}>
            {p.confirm}
          </Button>
        </div>
      </>
    );
  }

  return frame(
    <>
      {manyAmounts}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setPickingSource(true)} className="flex min-h-12 min-w-0 items-center gap-2 rounded-xl bg-card px-3 text-left text-[14px] font-bold active:opacity-80">
          <Icon name={sourceGoal ? 'target' : 'wallet'} size={20} strokeWidth={2} className="shrink-0 text-tteal" />
          <span className="min-w-0 truncate">{p.fromSource(sourceName)}</span>
        </button>
        {dayButton}
      </div>
      {overBalance && sourceGoal && <p className="px-0.5 text-[12.5px] font-semibold text-neg">{w.overBalance(formatMoney(sourceGoal.currentAmount))}</p>}
      {overdrawn && walletAfter !== null && (
        <p className="rounded-3xl bg-sun px-4 py-2.5 text-[13px] font-semibold leading-snug">
          {held > 0 ? w.overdrawnFrom(money(held), money(-walletAfter)) : w.overdrawnMore(money(-walletAfter))}
        </p>
      )}

      <div role="group" aria-label={w.whatFor} className="grid grid-cols-4 gap-1 rounded-3xl bg-card px-1 py-2">
        {shownCategories.map((c, i) => {
          const on = category === c.key;
          return (
            <button key={c.key} type="button" aria-pressed={on} onClick={() => setCategory(c.key)} className="flex min-h-[60px] min-w-0 flex-col items-center justify-center gap-0.5 active:opacity-70">
              <IconTile
                icon={<span className="material-symbols-rounded text-[20px] leading-none">{c.icon}</span>}
                tint={TINT_ORDER[i % TINT_ORDER.length]}
                size={38}
                round
                className={on ? '!bg-cta !text-cta-fg' : ''}
              />
              <span className={`w-full truncate text-center text-[12.5px] ${on ? 'font-bold' : 'font-semibold'}`}>{c.label}</span>
            </button>
          );
        })}
        {!showAll && (
          <button type="button" onClick={() => setShowAll(true)} className="flex min-h-[60px] min-w-0 flex-col items-center justify-center gap-0.5 active:opacity-70">
            <IconTile icon="more" tint="plain" size={38} round />
            <span className="w-full truncate text-center text-[12.5px] font-semibold">{p.more}</span>
          </button>
        )}
      </div>

      <label className="flex min-h-11 items-center rounded-xl bg-card px-3.5">
        <span className="sr-only">{w.note}</span>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={p.noteOptional}
          autoComplete="off"
          className="w-full border-0 bg-transparent p-0 text-[14.5px] font-medium text-ink placeholder:text-mute focus:ring-0"
        />
      </label>

      {readNotes}
      {failure}

      <div className="mt-auto">
        {keysOpen && <Keypad value={text} onChange={setText} compact />}
        <div className="mt-2 grid grid-cols-[2fr_1fr] gap-2">
          <Button disabled={!ready} loading={busy} onClick={() => void confirm()}>
            {repeatAsked ? q.recordAgain : p.save}
          </Button>
          {readInfo ? (
            <Button variant="ghost" className="!px-2" onClick={() => setChoosing(true)}>
              {p.readAgain}
            </Button>
          ) : (
            <Button variant="ghost" className="!px-2" disabled={!ready || busy} onClick={() => void confirm(true)}>
              {p.saveAnother}
            </Button>
          )}
        </div>
      </div>
    </>
  );
};

export default MoneySheet;
