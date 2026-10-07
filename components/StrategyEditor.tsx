import { safeGoalIcon } from '../services/goalIcons';
import React, { useState } from 'react';
import { PiggyBank, Schedule, type WalletSettings } from '../types';
import { evenSplit, sortBanks } from '../services/sorting';
import { useSortOrder } from '../hooks/useSortOrder';
import SortMenu from './SortMenu';
import { SLICE_COLORS } from './DonutChart';
import { formatMoney } from '../services/money';
import { useConfirm } from '../contexts/ConfirmContext';
import { useT } from '../contexts/LanguageContext';
import MoveGoalMoneySheet from './MoveGoalMoneySheet';
import { percentReached, toCents } from '../services/money';
import type { GoalMoneyChoice } from '../services/ledger';
import { Button } from './ui/Button';
import { EmptyState } from './ui/EmptyState';
import { Icon } from './ui/Icon';
import { NumberPad } from './ui/NumberPad';
import { Sheet } from './ui/Sheet';
import { Toggle } from './ui/Toggle';

interface StrategyEditorProps {
  banks: PiggyBank[];
  onUpdateBanks: (banks: PiggyBank[]) => void;
  /**
   * `choice` says where a goal's money goes; null only for an empty goal.
   * `scheduleTarget` is where auto deposits aimed at it save from now on.
   */
  onDeleteBank: (id: string, choice: GoalMoneyChoice | null, scheduleTarget?: string | null) => void;
  onArchiveBank: (id: string) => void;
  onAddGoal: () => void;
  scheduleCount: number;
  schedules: Schedule[];
  onOpenAutoDeposits: () => void;
  wallet: WalletSettings;
}

type Draft = Record<string, { splitPercentage: number; isLocked: boolean; autoSplit: boolean }>;

const STEP = 5;
const clampPct = (n: number) => Math.min(100, Math.max(0, Math.round(n)));

interface StepperProps {
  value: number;
  disabled: boolean;
  color: string;
  /** Opens the sheet that types an exact share on the app's own pad. */
  onType: () => void;
  onChange: (next: number) => void;
}

/**
 * Minus / number / plus. The buttons move in steps of five, snapping to the
 * next multiple so a hand-typed 33 becomes 35 rather than 38. Tapping the
 * number opens a pad for an exact value.
 */
const PercentStepper: React.FC<StepperProps> = ({ value, disabled, color, onType, onChange }) => {
  const t = useT();
  const step = (dir: 1 | -1) => {
    const snapped = dir > 0 ? Math.floor(value / STEP) * STEP + STEP : Math.ceil(value / STEP) * STEP - STEP;
    onChange(clampPct(snapped));
  };
  const btn = 'grid size-11 place-items-center rounded-xl bg-line/10 text-ink active:opacity-70 disabled:opacity-30';
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button type="button" disabled={disabled || value <= 0} onClick={() => step(-1)} className={btn} aria-label={t.goals.less}>
        <Icon name="minus" size={16} />
      </button>
      <button type="button" disabled={disabled} onClick={onType} className="min-h-11 min-w-[3.4rem] rounded-xl text-center text-[16px] font-extrabold tabular-nums active:opacity-70 disabled:opacity-60" style={{ color: disabled ? undefined : color }}>
        {value}%
      </button>
      <button type="button" disabled={disabled || value >= 100} onClick={() => step(1)} className={btn} aria-label={t.goals.more}>
        <Icon name="plus" size={16} />
      </button>
    </div>
  );
};

/** Typing a goal's share exactly, on the app's own pad. */
const PercentSheet: React.FC<{ name: string; initial: number; onDone: (value: number) => void; onClose: () => void }> = ({ name, initial, onDone, onClose }) => {
  const t = useT();
  const [text, setText] = useState(String(initial));
  const value = clampPct(Number(text) || 0);
  return (
    <Sheet
      title={name}
      z={60}
      onClose={onClose}
      footer={
        <Button
          onClick={() => {
            onDone(value);
            onClose();
          }}
        >
          {t.common.save}
        </Button>
      }
    >
      <p className="px-1 text-center text-[54px] font-extrabold leading-none tracking-[-0.04em] tabular-nums">
        {text === '' ? '0' : text}
        <span className="text-[26px] text-mute">%</span>
      </p>
      <NumberPad className="mt-4" fieldKey={name} value={text} decimals={0} onChange={(v) => setText(v)} onDone={() => undefined} hideDone />
    </Sheet>
  );
};

const StrategyEditor: React.FC<StrategyEditorProps> = ({
  banks,
  onUpdateBanks,
  onDeleteBank,
  onArchiveBank,
  onAddGoal,
  scheduleCount,
  schedules,
  onOpenAutoDeposits,
  wallet,
}) => {
  // Unsaved edits only. Everything else reads straight from Firestore, so
  // live updates can never be shadowed by stale local copies.
  const t = useT();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<Draft>({});
  /** The goal being deleted while it still holds money. */
  const [moving, setMoving] = useState<PiggyBank | null>(null);
  const [order, setOrder] = useSortOrder('savvypiggy.sort.strategy');
  /** The goal whose lock / sit-out / delete controls are showing. */
  const [openId, setOpenId] = useState<string | null>(null);
  /** The goal whose share is being typed on the pad. */
  const [typing, setTyping] = useState<string | null>(null);

  const localBanks = banks.map((b) => ({ ...b, ...draft[b.id] }));
  const inSplit = localBanks.filter((b) => b.autoSplit !== false);
  // Excluded goals do not take a share, so they do not count toward 100 either.
  const totalAllocation = inSplit.reduce((sum, b) => sum + b.splitPercentage, 0);
  const isValid = totalAllocation === 100;
  // Dirty means something really differs from what is saved: typing a goal's own value back in is not a change.
  const isDirty = localBanks.some((b) => {
    const saved = banks.find((x) => x.id === b.id);
    return !!saved && (saved.splitPercentage !== b.splitPercentage || saved.isLocked !== b.isLocked || (saved.autoSplit !== false) !== (b.autoSplit !== false));
  });

  // Colours follow creation order, which is how `banks` arrives, so a goal
  // keeps its colour no matter how the list is sorted.
  const colorOf = (id: string) => SLICE_COLORS[banks.findIndex((b) => b.id === id) % SLICE_COLORS.length];

  const edit = (bank: PiggyBank, patch: Partial<Draft[string]>) =>
    setDraft((prev) => ({
      ...prev,
      [bank.id]: {
        splitPercentage: bank.splitPercentage,
        isLocked: bank.isLocked,
        autoSplit: bank.autoSplit !== false,
        ...prev[bank.id],
        ...patch,
      },
    }));

  const even = evenSplit(localBanks);
  const evenLabel = even ? `${Object.values(even)[0]}%` : null;
  const applyEven = () => {
    if (!even) return;
    localBanks.forEach((b) => {
      if (b.id in even) edit(b, { splitPercentage: even[b.id] });
    });
  };

  const handleSave = () => {
    if (!isValid) return;
    onUpdateBanks(localBanks.map((b) => ({ ...b, autoSplit: b.autoSplit !== false })));
    setDraft({});
  };

  const handleDelete = async (id: string) => {
    const bank = localBanks.find((b) => b.id === id);
    // A goal with money in it, or auto deposits aimed at it, asks where they
    // go; that sheet is the confirmation.
    const aimed = schedules.some((s) => s.targetBankId === id);
    if (bank && (toCents(bank.currentAmount) !== 0 || aimed)) {
      setMoving(bank);
      return;
    }
    const ok = await confirm({
      title: t.goals.deleteTitle(bank?.name),
      body: localBanks.length > 1 ? t.goals.deleteBody : t.goals.deleteBodyLast,
      tone: 'danger',
      confirmLabel: t.common.delete,
      detail: bank && {
        icon: safeGoalIcon(bank.icon),
        label: bank.name,
        meta: t.goals.percentOfEachDeposit(bank.splitPercentage),
        amount: formatMoney(bank.currentAmount),
      },
    });
    if (!ok) return;
    onDeleteBank(id, null);
    setDraft(({ [id]: _removed, ...rest }) => rest);
  };

  const moveSheet = moving && (
    <MoveGoalMoneySheet
      bank={moving}
      banks={banks}
      aimed={schedules.filter((s) => s.targetBankId === moving.id).length}
      onConfirm={(choice, scheduleTarget) => {
        onDeleteBank(moving.id, choice, scheduleTarget);
        setDraft(({ [moving.id]: _removed, ...rest }) => rest);
        setMoving(null);
      }}
      onArchive={() => {
        onArchiveBank(moving.id);
        setMoving(null);
      }}
      onClose={() => setMoving(null)}
    />
  );

  const sorted = sortBanks(localBanks, order);
  const typingBank = typing ? localBanks.find((b) => b.id === typing) : undefined;
  const dirtyOrInvalid = isDirty || !isValid;

  return (
    <div className={`flex min-h-full flex-col px-4 pt-3 safe-pt font-figtree text-ink ${dirtyOrInvalid ? 'pb-72' : 'pb-40'}`}>
      <h1 className="px-1 pt-2 text-[30px] font-extrabold tracking-tight">{t.goals.strategyTitle}</h1>
      <p className="mt-0.5 px-1 text-[13.5px] font-semibold text-mute">{t.goals.strategySubtitle}</p>

      {/* One bar for the whole 100%: each goal's share of it, and whether it adds up. */}
      {localBanks.length > 0 && (
        <div className="mt-4 rounded-[28px] bg-hero p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12.5px] font-bold">{t.report.donutAllocated}</p>
            <span className={`rounded-full px-3 py-0.5 text-[12px] font-extrabold ${isValid ? 'bg-card text-pos' : 'bg-peach text-neg'}`}>
              {isValid ? t.goals.balanced : totalAllocation > 100 ? t.goals.percentOver(totalAllocation - 100) : t.goals.percentLeft(100 - totalAllocation)}
            </span>
          </div>
          <div className="mt-3 flex h-4 gap-0.5 overflow-hidden rounded-full bg-line/10" role="img" aria-label={`${totalAllocation}%`}>
            {inSplit
              .filter((b) => b.splitPercentage > 0)
              .map((b) => (
                <i key={b.id} className="block h-full transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${(b.splitPercentage / Math.max(100, totalAllocation)) * 100}%`, background: colorOf(b.id) }} />
              ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            {inSplit.length === 0 ? (
              <p className="text-[13px] font-medium text-mute">{t.goals.everyGoalExcluded}</p>
            ) : (
              inSplit.map((b) => (
                <span key={b.id} className="flex items-center gap-1.5 text-[12.5px] font-bold">
                  <span className="size-2.5 rounded-full" style={{ background: colorOf(b.id) }} />
                  {b.name} <b className="font-extrabold tabular-nums">{b.splitPercentage}%</b>
                </span>
              ))
            )}
          </div>
        </div>
      )}

      <button type="button" onClick={onOpenAutoDeposits} className="mt-3 flex w-full items-center gap-4 rounded-3xl bg-card p-4 text-left active:opacity-80">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-mint">
          <Icon name="repeat" size={22} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold">{t.goals.autoDeposits}</span>
          <span className="block text-[12px] font-medium text-mute">{scheduleCount === 0 ? t.goals.saveOnSchedule : t.goals.activeSchedules(scheduleCount)}</span>
        </span>
        <Icon name="chev" size={18} className="text-mute" />
      </button>

      {localBanks.length > 0 && (
        <div className="mb-2 mt-6 flex items-center justify-between gap-3 px-1">
          <h2 className="text-[16px] font-extrabold">{t.common.goals}</h2>
          <SortMenu order={order} onChange={setOrder} />
        </div>
      )}

      {localBanks.length === 0 ? (
        <EmptyState icon="wallet" title={t.goals.noPiggyBanks} body={t.goals.goalIsWhere} action={{ label: t.goals.addFirstGoal, onClick: onAddGoal }} />
      ) : (
        <div className="divide-y divide-line/10 rounded-3xl bg-card px-4">
          {sorted.map((bank) => {
            const inSplitNow = bank.autoSplit !== false;
            const color = colorOf(bank.id);
            const hasTarget = bank.targetAmount > 0;
            const overspent = toCents(bank.currentAmount) < 0;
            const progress = hasTarget ? Math.min(100, Math.max(0, (bank.currentAmount / bank.targetAmount) * 100)) : 0;
            const remaining = bank.targetAmount - bank.currentAmount;
            const open = openId === bank.id;

            return (
              <div key={bank.id} className="py-3">
                <div className="flex items-center gap-3">
                  {/* Tapping the name opens the rarely-used controls; the share is changed on the right. */}
                  <button type="button" onClick={() => setOpenId(open ? null : bank.id)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-3 text-left active:opacity-70">
                    <span className="grid size-11 shrink-0 place-items-center rounded-2xl" style={{ background: `${color}33` }}>
                      <span className="material-symbols-rounded" style={{ fontSize: 22 }}>
                        {safeGoalIcon(bank.icon)}
                      </span>
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[15.5px] font-bold">
                        {bank.name}
                        {bank.isLocked && <Icon name="lock" size={13} className="ml-1.5 inline text-mute" />}
                      </span>
                      <span className={`block truncate text-[12px] font-medium ${overspent ? 'text-neg' : 'text-mute'}`}>
                        {inSplitNow ? formatMoney(bank.currentAmount, { decimals: 0 }) : t.goals.excluded}
                        {inSplitNow && (hasTarget ? t.goals.ofTarget(formatMoney(bank.targetAmount, { decimals: 0 })) : t.goals.noLimitSuffix)}
                      </span>
                    </span>
                  </button>
                  <PercentStepper
                    value={bank.splitPercentage}
                    disabled={bank.isLocked || !inSplitNow}
                    color={color}
                    onType={() => setTyping(bank.id)}
                    onChange={(next) => edit(bank, { splitPercentage: next })}
                  />
                </div>

                {/* How far along the goal is, for context while deciding its share. */}
                {(hasTarget || overspent) && (
                  <div className="ml-14 mt-2">
                    <div className="h-1.5 overflow-hidden rounded-full bg-line/10">
                      {overspent ? <div className="h-full w-full rounded-full bg-neg/40" /> : <div className="h-full rounded-full transition-all duration-700 motion-reduce:transition-none" style={{ width: `${progress}%`, background: color }} />}
                    </div>
                    <p className="mt-1 text-[11.5px] font-semibold tabular-nums text-mute">
                      {overspent ? t.goals.overspent : toCents(remaining) > 0 ? `${t.goals.goalFunded(percentReached(bank.currentAmount, bank.targetAmount))} · ${t.goals.remaining(formatMoney(remaining, { decimals: 0 }))}` : t.goals.targetReached}
                    </p>
                  </div>
                )}

                {open && (
                  <div className="ml-14 mt-3 divide-y divide-line/10 rounded-2xl bg-line/5 px-4">
                    {/* Off means this goal sits out of every deposit split entirely. */}
                    <div className="flex min-h-12 items-center justify-between gap-3">
                      <span className="text-[14px] font-bold">{inSplitNow ? t.goals.autoSplitOn : t.goals.autoSplitOff}</span>
                      <Toggle checked={inSplitNow} onChange={(on) => edit(bank, { autoSplit: on })} label={inSplitNow ? t.goals.autoSplitOn : t.goals.autoSplitOff} />
                    </div>
                    <div className="flex min-h-12 items-center justify-between gap-3">
                      <span className="text-[14px] font-bold">{bank.isLocked ? t.goals.unlock : t.goals.lock}</span>
                      <Toggle checked={bank.isLocked} onChange={(on) => edit(bank, { isLocked: on })} label={bank.isLocked ? t.goals.unlock : t.goals.lock} />
                    </div>
                    <button type="button" onClick={() => handleDelete(bank.id)} className="flex min-h-12 w-full items-center text-left text-[14px] font-bold text-neg active:opacity-60">
                      {t.goals.deleteThisGoal}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {localBanks.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Button variant="ghost" onClick={applyEven} disabled={!even}>
            {t.goals.evenSplit(evenLabel)}
          </Button>
          <Button variant="ghost" onClick={onAddGoal}>
            <Icon name="plus" size={18} />
            {t.goals.addGoal}
          </Button>
        </div>
      )}

      {/* The save bar only exists while there is something to save, and sits just above the bottom bar. */}
      {localBanks.length > 0 && dirtyOrInvalid && (
        <div className="pointer-events-none fixed bottom-0 left-0 right-0 px-4" style={{ paddingBottom: 'calc(6.2rem + env(safe-area-inset-bottom))' }}>
          <div className="pointer-events-auto mx-auto max-w-md">
            <div className="flex items-center gap-3 rounded-[2rem] bg-card p-3 pl-5 shadow-[0_6px_28px_rgba(0,0,0,0.18)]">
              <div className="min-w-0 flex-1">
                <p className={`text-[20px] font-extrabold tabular-nums ${isValid ? 'text-pos' : 'text-neg'}`}>{totalAllocation}%</p>
                <p className="truncate text-[12px] font-bold text-mute">{isValid ? t.goals.unsavedChanges : totalAllocation > 100 ? t.goals.percentOver(totalAllocation - 100) : t.goals.percentLeft(100 - totalAllocation)}</p>
              </div>
              <Button full={false} className="px-7" onClick={handleSave} disabled={!isValid}>
                {t.goals.saveStrategy}
              </Button>
            </div>
          </div>
        </div>
      )}

      {typingBank && <PercentSheet name={typingBank.name} initial={typingBank.splitPercentage} onDone={(v) => edit(typingBank, { splitPercentage: v })} onClose={() => setTyping(null)} />}
      {moveSheet}
    </div>
  );
};

export default StrategyEditor;
