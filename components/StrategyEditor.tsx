import React, { useEffect, useRef, useState } from 'react';
import { PiggyBank } from '../types';
import { evenSplit, sortBanks } from '../services/sorting';
import { useSortOrder } from '../hooks/useSortOrder';
import SortMenu from './SortMenu';
import DonutChart, { SLICE_COLORS } from './DonutChart';

interface StrategyEditorProps {
  banks: PiggyBank[];
  onUpdateBanks: (banks: PiggyBank[]) => void;
  onDeleteBank: (id: string) => void;
  onAddGoal: () => void;
  scheduleCount: number;
  onOpenAutoDeposits: () => void;
}

type Draft = Record<string, { splitPercentage: number; isLocked: boolean; autoSplit: boolean }>;

const STEP = 5;
const clampPct = (n: number) => Math.min(100, Math.max(0, Math.round(n)));
const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

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

  const btn =
    'size-11 rounded-2xl flex items-center justify-center bg-white/5 text-white active:scale-90 transition-transform disabled:opacity-30 disabled:active:scale-100';

  return (
    <div className="flex items-center gap-2 shrink-0">
      <button disabled={disabled || value <= 0} onClick={() => step(-1)} className={btn} aria-label="Less">
        <span className="material-symbols-rounded">remove</span>
      </button>

      {editing ? (
        <div className="w-[4.5rem] h-11 rounded-2xl bg-white/10 border border-primary flex items-center justify-center gap-0.5">
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
            className="w-9 bg-transparent text-center text-xl font-black text-white leading-none focus:outline-none"
          />
          <span className="text-slate-500 text-sm font-bold leading-none">%</span>
        </div>
      ) : (
        <button
          disabled={disabled}
          onClick={() => {
            setText(String(value));
            setEditing(true);
          }}
          className="w-[4.5rem] h-11 rounded-2xl bg-white/5 flex items-center justify-center active:scale-95 transition-transform disabled:opacity-30"
          style={{ color: disabled ? undefined : color }}
        >
          <span className="flex items-baseline gap-0.5 leading-none">
            <span className="text-xl font-black tabular-nums">{value}</span>
            <span className="text-sm font-bold opacity-60">%</span>
          </span>
        </button>
      )}

      <button disabled={disabled || value >= 100} onClick={() => step(1)} className={btn} aria-label="More">
        <span className="material-symbols-rounded">add</span>
      </button>
    </div>
  );
};

const StrategyEditor: React.FC<StrategyEditorProps> = ({
  banks,
  onUpdateBanks,
  onDeleteBank,
  onAddGoal,
  scheduleCount,
  onOpenAutoDeposits,
}) => {
  // Unsaved edits only. Everything else reads straight from Firestore, so
  // live updates can never be shadowed by stale local copies.
  const [draft, setDraft] = useState<Draft>({});
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

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this piggy bank? This will not return funds already saved.')) {
      onDeleteBank(id);
      setDraft(({ [id]: _removed, ...rest }) => rest);
    }
  };

  const sorted = sortBanks(localBanks, order);
  const slices = inSplit.map((b) => ({ id: b.id, value: b.splitPercentage, color: colorOf(b.id) }));

  return (
    <div className="flex flex-col min-h-full pb-[22rem] safe-pt">
      <div className="px-6 pt-6 pb-2">
        <h2 className="text-white text-3xl font-black tracking-tight">Distribution Strategy</h2>
        <p className="text-slate-500 text-sm font-medium mt-1">
          Every untargeted deposit is split by these shares.
        </p>
      </div>

      {/* The whole picture at a glance. */}
      {localBanks.length > 0 && (
        <div className="mt-4 px-6">
          <div className="bg-surface border border-white/5 rounded-[2rem] p-5 flex items-center gap-5 shadow-xl">
            <DonutChart slices={slices} total={totalAllocation} size={150} thickness={20} />
            <div className="min-w-0 flex-1 space-y-2">
              {inSplit.length === 0 ? (
                <p className="text-slate-500 text-xs font-medium">Every goal is excluded from deposits.</p>
              ) : (
                inSplit.map((b) => (
                  <div key={b.id} className="flex items-center gap-2 min-w-0">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: colorOf(b.id) }}></span>
                    <span className="text-slate-300 text-xs font-bold truncate flex-1">{b.name}</span>
                    <span className="text-white text-xs font-black tabular-nums shrink-0">{b.splitPercentage}%</span>
                  </div>
                ))
              )}
              {totalAllocation < 100 && inSplit.length > 0 && (
                <div className="flex items-center gap-2 min-w-0">
                  <span className="size-2.5 shrink-0 rounded-full bg-white/10"></span>
                  <span className="text-slate-600 text-xs font-bold truncate flex-1">Unassigned</span>
                  <span className="text-slate-500 text-xs font-black tabular-nums shrink-0">
                    {100 - totalAllocation}%
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 px-6">
        <button
          onClick={onOpenAutoDeposits}
          className="w-full bg-surface border border-white/5 rounded-[2rem] p-5 flex items-center gap-4 shadow-xl active:scale-[0.99] transition-transform text-left"
        >
          <div className="size-12 shrink-0 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
            <span className="material-symbols-rounded text-2xl">event_repeat</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-white font-bold">Auto Deposits</p>
            <p className="text-slate-500 text-xs font-medium">
              {scheduleCount === 0
                ? 'Save on a schedule'
                : `${scheduleCount} active schedule${scheduleCount > 1 ? 's' : ''}`}
            </p>
          </div>
          <span className="material-symbols-rounded text-slate-600">chevron_right</span>
        </button>
      </div>

      {localBanks.length > 0 && (
        <div className="mt-8 px-6 flex items-center justify-between gap-3">
          <h3 className="text-white text-lg font-bold">Goals</h3>
          <SortMenu order={order} onChange={setOrder} />
        </div>
      )}

      <div className="mt-4 px-6 space-y-4">
        {localBanks.length === 0 ? (
          <div className="bg-surface border border-dashed border-white/10 rounded-[2rem] p-12 flex flex-col items-center justify-center text-center">
            <span className="material-symbols-rounded text-4xl text-slate-700 mb-4">account_balance_wallet</span>
            <p className="text-slate-500 font-bold">No piggy banks yet</p>
            <p className="text-slate-600 text-xs mt-1">Add one using the + button below</p>
          </div>
        ) : (
          sorted.map((bank) => {
            const inSplitNow = bank.autoSplit !== false;
            const color = colorOf(bank.id);
            const hasTarget = bank.targetAmount > 0;
            const overspent = bank.currentAmount < 0;
            const progress = hasTarget
              ? Math.min(100, Math.max(0, (bank.currentAmount / bank.targetAmount) * 100))
              : 0;
            const remaining = bank.targetAmount - bank.currentAmount;

            return (
              <div key={bank.id} className="bg-surface border border-white/5 rounded-[2rem] p-5 space-y-4 shadow-xl">
                {/* Name takes the slack and truncates; the controls never shrink. */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="size-12 shrink-0 rounded-2xl flex items-center justify-center"
                      style={{ background: `${color}1A`, color }}
                    >
                      <span className="material-symbols-rounded text-2xl">{bank.icon}</span>
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-white font-bold truncate">{bank.name}</h4>
                      <p className={`text-xs truncate ${overspent ? 'text-red-400' : 'text-slate-500'}`}>
                        {money(bank.currentAmount)}
                        {hasTarget ? ` of ${money(bank.targetAmount)}` : ' · no limit'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleDelete(bank.id)}
                      className="size-10 rounded-full flex items-center justify-center bg-red-500/10 text-red-400 active:scale-90 transition-transform"
                    >
                      <span className="material-symbols-rounded text-xl">delete</span>
                    </button>
                    <button
                      onClick={() => edit(bank, { isLocked: !bank.isLocked })}
                      className={`size-10 rounded-full flex items-center justify-center transition-colors ${
                        bank.isLocked ? 'bg-amber-500/10 text-amber-400' : 'bg-white/5 text-slate-500'
                      }`}
                    >
                      <span className="material-symbols-rounded text-xl">{bank.isLocked ? 'lock' : 'lock_open'}</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <p className="text-slate-500 text-[11px] font-bold uppercase tracking-wider">
                    {inSplitNow ? 'Split' : 'Excluded'}
                  </p>
                  <PercentStepper
                    value={bank.splitPercentage}
                    disabled={bank.isLocked || !inSplitNow}
                    color={color}
                    onChange={(next) => edit(bank, { splitPercentage: next })}
                  />
                </div>

                {/* How far along the goal is, for context while deciding its share. */}
                <div className="space-y-1.5">
                  <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                    {overspent ? (
                      <div className="h-full w-full rounded-full bg-red-500/30"></div>
                    ) : hasTarget ? (
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${progress}%`, background: color }}
                      ></div>
                    ) : (
                      <div className="h-full w-full rounded-full opacity-40" style={{ background: color }}></div>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-3 text-[10px] font-bold">
                    <span className="text-slate-500">
                      {overspent ? 'Overspent' : hasTarget ? `Goal funded ${Math.round(progress)}%` : 'Open-ended'}
                    </span>
                    {hasTarget && !overspent && (
                      <span className="text-slate-500 tabular-nums">
                        {remaining > 0 ? `${money(remaining)} remaining` : 'Target reached'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Off means this goal sits out of every deposit split entirely. */}
                <button
                  onClick={() => edit(bank, { autoSplit: !inSplitNow })}
                  className="w-full flex items-center justify-between gap-3 pt-1"
                >
                  <span className="text-slate-500 text-[11px] font-bold uppercase tracking-wider">
                    {inSplitNow ? 'Auto-split on' : 'Auto-split off'}
                  </span>
                  <div
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                      inSplitNow ? 'bg-primary/20' : 'bg-white/10'
                    }`}
                  >
                    <span
                      className={`inline-block size-4 transform rounded-full transition-transform ${
                        inSplitNow ? 'translate-x-6 bg-primary' : 'translate-x-1 bg-slate-600'
                      }`}
                    ></span>
                  </div>
                </button>
              </div>
            );
          })
        )}

        {localBanks.length > 0 && (
          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              onClick={applyEven}
              disabled={!even}
              className="h-14 rounded-2xl bg-white/5 border border-white/10 text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-30 disabled:active:scale-100"
            >
              <span className="material-symbols-rounded text-primary text-xl">balance</span>
              Even Split{evenLabel ? ` (${evenLabel})` : ''}
            </button>
            <button
              onClick={onAddGoal}
              className="h-14 rounded-2xl bg-white/5 border border-white/10 text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform"
            >
              <span className="material-symbols-rounded text-primary text-xl">add_circle</span>
              Add Goal
            </button>
          </div>
        )}
      </div>

      {/* Sits clear of the bottom navigation, which is fixed at bottom-0 too. */}
      <div
        className="fixed bottom-0 left-0 right-0 px-4 pointer-events-none"
        style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}
      >
        <div className="max-w-md mx-auto pointer-events-auto">
          <div className="glass rounded-[2.5rem] p-5 space-y-4 border border-white/10 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Total Allocation</p>
                <p className="text-2xl font-black tabular-nums">
                  <span className={isValid ? 'text-primary' : 'text-red-400'}>{totalAllocation}%</span>
                  <span className="text-slate-600 text-base"> / 100%</span>
                </p>
              </div>
              <div
                className={`shrink-0 h-9 px-4 rounded-full flex items-center gap-1.5 text-xs font-black ${
                  isValid
                    ? 'bg-primary/10 text-primary'
                    : 'bg-red-500/10 text-red-400'
                }`}
              >
                <span className="material-symbols-rounded text-base">
                  {isValid ? 'check_circle' : totalAllocation > 100 ? 'error' : 'pending'}
                </span>
                {isValid
                  ? 'Balanced'
                  : totalAllocation > 100
                    ? `${totalAllocation - 100}% over`
                    : `${100 - totalAllocation}% left`}
              </div>
            </div>
            <button
              onClick={handleSave}
              disabled={!isValid || localBanks.length === 0}
              className={`w-full h-16 rounded-2xl font-black text-lg transition-all shadow-xl ${
                isValid && localBanks.length > 0
                  ? 'bg-primary text-black shadow-primary/20 active:scale-95'
                  : 'bg-white/5 text-slate-600 cursor-not-allowed'
              }`}
            >
              {localBanks.length === 0
                ? 'Add a Goal'
                : !isValid
                  ? 'Allocation Mismatch'
                  : isDirty
                    ? 'Save Strategy'
                    : 'Strategy Saved'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StrategyEditor;
