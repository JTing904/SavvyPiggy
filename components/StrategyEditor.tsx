import { safeGoalIcon } from '../services/goalIcons';
import React, { useEffect, useRef, useState } from 'react';
import { PiggyBank, Schedule, type WalletSettings } from '../types';
import { evenSplit, sortBanks } from '../services/sorting';
import { useSortOrder } from '../hooks/useSortOrder';
import SortMenu from './SortMenu';
import DonutChart, { SLICE_COLORS } from './DonutChart';
import { formatMoney } from '../services/money';
import { useConfirm } from '../contexts/ConfirmContext';
import { useT } from '../contexts/LanguageContext';
import MoveGoalMoneySheet from './MoveGoalMoneySheet';
import { percentReached, toCents } from '../services/money';
import type { GoalMoneyChoice } from '../services/ledger';
import { Button } from './ui/Button';
import { EmptyState } from './ui/EmptyState';
import { Icon } from './ui/Icon';
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
  onChange: (next: number) => void;
}

/**
 * Minus / number / plus. The buttons move in steps of five, snapping to the
 * next multiple so a hand-typed 33 becomes 35 rather than 38. Tapping the
 * number turns it into a field for exact values.
 */
const PercentStepper: React.FC<StepperProps> = ({ value, disabled, color, onChange }) => {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      input.current?.focus();
      input.current?.select();
    }
  }, [editing]);

  const step = (dir: 1 | -1) => {
    const snapped = dir > 0 ? Math.floor(value / STEP) * STEP + STEP : Math.ceil(value / STEP) * STEP - STEP;
    onChange(clampPct(snapped));
  };

  const commit = () => {
    setEditing(false);
    const parsed = parseInt(text, 10);
    if (!Number.isNaN(parsed)) onChange(clampPct(parsed));
  };

  const btn = 'grid size-11 place-items-center rounded-2xl bg-line/10 text-ink active:opacity-70 disabled:opacity-30';

  return (
    <div className="flex shrink-0 items-center gap-2">
      <button type="button" disabled={disabled || value <= 0} onClick={() => step(-1)} className={btn} aria-label={t.goals.less}>
        <Icon name="minus" size={18} />
      </button>

      {editing ? (
        <div className="flex h-11 w-[4.5rem] items-center justify-center gap-0.5 rounded-2xl bg-field outline outline-2 outline-ink">
          <input
            ref={input}
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') setEditing(false);
            }}
            className="w-9 border-0 bg-transparent p-0 text-center text-[20px] font-extrabold leading-none text-ink focus:ring-0"
          />
          <span className="text-[14px] font-bold leading-none text-mute">%</span>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setText(String(value));
            setEditing(true);
          }}
          className="flex h-11 w-[4.5rem] items-center justify-center rounded-2xl bg-line/5 active:opacity-70 disabled:opacity-40"
          style={{ color: disabled ? undefined : color }}
        >
          <span className="flex items-baseline gap-0.5 leading-none">
            <span className="text-[20px] font-extrabold tabular-nums">{value}</span>
            <span className="text-[14px] font-bold opacity-60">%</span>
          </span>
        </button>
      )}

      <button type="button" disabled={disabled || value >= 100} onClick={() => step(1)} className={btn} aria-label={t.goals.more}>
        <Icon name="plus" size={18} />
      </button>
    </div>
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

  const localBanks = banks.map((b) => ({ ...b, ...draft[b.id] }));
  const inSplit = localBanks.filter((b) => b.autoSplit !== false);
  // Excluded goals do not take a share, so they do not count toward 100 either.
  const totalAllocation = inSplit.reduce((sum, b) => sum + b.splitPercentage, 0);
  const isValid = totalAllocation === 100;
  const isDirty = Object.keys(draft).length > 0;

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
  const slices = inSplit.map((b) => ({ id: b.id, value: b.splitPercentage, color: colorOf(b.id) }));

  return (
    <div className="flex min-h-full flex-col px-4 pb-[22rem] pt-3 safe-pt font-figtree text-ink">
      <h1 className="px-1 pt-2 text-[30px] font-extrabold tracking-tight">{t.goals.strategyTitle}</h1>
      <p className="mt-0.5 px-1 text-[13.5px] font-semibold text-mute">{t.goals.strategySubtitle}</p>

      {/* The whole picture at a glance. */}
      {localBanks.length > 0 && (
        <div className="mt-4 flex items-center gap-5 rounded-3xl bg-card p-5">
          <DonutChart slices={slices} total={totalAllocation} size={150} thickness={20} />
          <div className="min-w-0 flex-1 space-y-2">
            {inSplit.length === 0 ? (
              <p className="text-[13px] font-medium text-mute">{t.goals.everyGoalExcluded}</p>
            ) : (
              inSplit.map((b) => (
                <div key={b.id} className="flex min-w-0 items-center gap-2">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: colorOf(b.id) }}></span>
                  <span className="flex-1 truncate text-[13px] font-bold">{b.name}</span>
                  <span className="shrink-0 text-[13px] font-extrabold tabular-nums">{b.splitPercentage}%</span>
                </div>
              ))
            )}
            {totalAllocation < 100 && inSplit.length > 0 && (
              <div className="flex min-w-0 items-center gap-2">
                <span className="size-2.5 shrink-0 rounded-full bg-line/20"></span>
                <span className="flex-1 truncate text-[13px] font-medium text-mute">{t.goals.unassigned}</span>
                <span className="shrink-0 text-[13px] font-bold tabular-nums text-mute">{100 - totalAllocation}%</span>
              </div>
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

      <div className="mt-2 space-y-3">
        {localBanks.length === 0 ? (
          <EmptyState icon="wallet" title={t.goals.noPiggyBanks} body={t.goals.goalIsWhere} action={{ label: t.goals.addFirstGoal, onClick: onAddGoal }} />
        ) : (
          sorted.map((bank) => {
            const inSplitNow = bank.autoSplit !== false;
            const color = colorOf(bank.id);
            const hasTarget = bank.targetAmount > 0;
            const overspent = toCents(bank.currentAmount) < 0;
            const progress = hasTarget ? Math.min(100, Math.max(0, (bank.currentAmount / bank.targetAmount) * 100)) : 0;
            const remaining = bank.targetAmount - bank.currentAmount;

            return (
              <div key={bank.id} className="space-y-4 rounded-3xl bg-card p-5">
                {/* Name takes the slack and truncates; the controls never shrink. */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-12 shrink-0 place-items-center rounded-2xl" style={{ background: `${color}33`, color: 'rgb(var(--ink))' }}>
                      <span className="material-symbols-rounded" style={{ fontSize: 24 }}>
                        {safeGoalIcon(bank.icon)}
                      </span>
                    </span>
                    <div className="min-w-0">
                      <h3 className="truncate text-[16px] font-bold">{bank.name}</h3>
                      <p className={`truncate text-[12.5px] font-medium ${overspent ? 'text-neg' : 'text-mute'}`}>
                        {formatMoney(bank.currentAmount, { decimals: 0 })}
                        {hasTarget ? t.goals.ofTarget(formatMoney(bank.targetAmount, { decimals: 0 })) : t.goals.noLimitSuffix}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button type="button" onClick={() => handleDelete(bank.id)} aria-label={t.common.delete} className="grid size-11 place-items-center rounded-full bg-peach text-neg active:opacity-70">
                      <span className="material-symbols-rounded" style={{ fontSize: 20 }}>
                        delete
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => edit(bank, { isLocked: !bank.isLocked })}
                      aria-pressed={bank.isLocked}
                      className={`grid size-11 place-items-center rounded-full active:opacity-70 ${bank.isLocked ? 'bg-sun' : 'bg-line/10 text-mute'}`}
                    >
                      <Icon name="lock" size={18} />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <p className="text-[12.5px] font-bold text-mute">{inSplitNow ? t.goals.split : t.goals.excluded}</p>
                  <PercentStepper value={bank.splitPercentage} disabled={bank.isLocked || !inSplitNow} color={color} onChange={(next) => edit(bank, { splitPercentage: next })} />
                </div>

                {/* How far along the goal is, for context while deciding its share. */}
                <div className="space-y-1.5">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-line/10">
                    {overspent ? (
                      <div className="h-full w-full rounded-full bg-neg/40"></div>
                    ) : hasTarget ? (
                      <div className="h-full rounded-full transition-all duration-700 motion-reduce:transition-none" style={{ width: `${progress}%`, background: color }}></div>
                    ) : (
                      <div className="h-full w-full rounded-full opacity-40" style={{ background: color }}></div>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-3 text-[11.5px] font-semibold">
                    <span className="text-mute">{overspent ? t.goals.overspent : hasTarget ? t.goals.goalFunded(percentReached(bank.currentAmount, bank.targetAmount)) : t.goals.openEnded}</span>
                    {hasTarget && !overspent && (
                      <span className="tabular-nums text-mute">{toCents(remaining) > 0 ? t.goals.remaining(formatMoney(remaining, { decimals: 0 })) : t.goals.targetReached}</span>
                    )}
                  </div>
                </div>

                {/* Off means this goal sits out of every deposit split entirely. */}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[12.5px] font-bold text-mute">{inSplitNow ? t.goals.autoSplitOn : t.goals.autoSplitOff}</span>
                  <Toggle checked={inSplitNow} onChange={(on) => edit(bank, { autoSplit: on })} label={inSplitNow ? t.goals.autoSplitOn : t.goals.autoSplitOff} />
                </div>
              </div>
            );
          })
        )}

        {localBanks.length > 0 && (
          <div className="grid grid-cols-2 gap-3 pt-1">
            <Button variant="ghost" onClick={applyEven} disabled={!even}>
              {t.goals.evenSplit(evenLabel)}
            </Button>
            <Button variant="ghost" onClick={onAddGoal}>
              <Icon name="plus" size={18} />
              {t.goals.addGoal}
            </Button>
          </div>
        )}
      </div>

      {/* Sits clear of the bottom navigation, which is fixed at bottom-0 too. */}
      <div className="pointer-events-none fixed bottom-0 left-0 right-0 px-4" style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}>
        <div className="pointer-events-auto mx-auto max-w-md">
          <div className="space-y-3 rounded-[2rem] bg-card p-5 shadow-[0_-6px_28px_rgba(0,0,0,0.14)]">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[12.5px] font-bold text-mute">{t.goals.totalAllocation}</p>
                <p className="text-[26px] font-extrabold tabular-nums">
                  <span className={isValid ? 'text-pos' : 'text-neg'}>{totalAllocation}%</span>
                  <span className="text-[16px] font-bold text-mute"> / 100%</span>
                </p>
              </div>
              <div className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[12.5px] font-extrabold ${isValid ? 'bg-mint text-pos' : 'bg-peach text-neg'}`}>
                {isValid ? t.goals.balanced : totalAllocation > 100 ? t.goals.percentOver(totalAllocation - 100) : t.goals.percentLeft(100 - totalAllocation)}
              </div>
            </div>
            <Button onClick={handleSave} disabled={!isValid || localBanks.length === 0}>
              {localBanks.length === 0 ? t.goals.addAGoal : !isValid ? t.goals.allocationMismatch : isDirty ? t.goals.saveStrategy : t.goals.strategySaved}
            </Button>
          </div>
        </div>
      </div>

      {moveSheet}
    </div>
  );
};

export default StrategyEditor;
