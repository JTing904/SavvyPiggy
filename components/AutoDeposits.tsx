import React, { useState } from 'react';
import type { Frequency, PiggyBank, Schedule } from '../types';
import { describe, FREQUENCIES, MONTH_LABELS, WEEKDAY_LABELS } from '../services/schedules';
import { useBackHandler } from '../hooks/useBackHandler';

interface AutoDepositsProps {
  schedules: Schedule[];
  banks: PiggyBank[];
  onCancel: () => void;
  onCreate: (schedule: Omit<Schedule, 'id' | 'createdAt' | 'lastRunAt'>) => Promise<void> | void;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
}

const DAYS_OF_MONTH = Array.from({ length: 31 }, (_, i) => i + 1);

const AutoDeposits: React.FC<AutoDepositsProps> = ({
  schedules,
  banks,
  onCancel,
  onCreate,
  onToggle,
  onDelete,
}) => {
  const [adding, setAdding] = useState(false);
  useBackHandler(adding, () => setAdding(false));
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('monthly');
  const [weekday, setWeekday] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [month, setMonth] = useState(1);
  const [targetBankId, setTargetBankId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setAdding(false);
    setAmount('');
    setFrequency('monthly');
    setTargetBankId(null);
    setBusy(false);
  };

  const handleCreate = async () => {
    const value = parseFloat(amount);
    if (!(value > 0) || busy) return;
    setBusy(true);
    try {
      await onCreate({
        amount: value,
        frequency,
        weekday,
        dayOfMonth,
        month,
        targetBankId,
        enabled: true,
      });
      reset();
    } catch {
      setBusy(false);
    }
  };

  const chip = (active: boolean) =>
    `px-4 h-11 rounded-2xl text-sm font-bold transition-all shrink-0 ${
      active ? 'bg-primary text-black' : 'bg-white/5 text-slate-400'
    }`;

  const targetName = (id: string | null) =>
    id ? (banks.find((b) => b.id === id)?.name ?? 'Deleted goal') : 'Split by strategy';

  return (
    <div className="flex flex-col h-full bg-bg-dark safe-pt">
      <div className="flex items-center px-6 py-4 justify-between sticky top-0 bg-bg-dark/80 backdrop-blur-md z-20">
        <button
          className="size-10 rounded-full glass flex items-center justify-center text-slate-300 active:scale-90 transition-transform"
          onClick={onCancel}
        >
          <span className="material-symbols-rounded text-xl">arrow_back_ios_new</span>
        </button>
        <h2 className="text-white text-lg font-bold tracking-tight">Auto Deposits</h2>
        <div className="size-10"></div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-6 py-4 pb-16">
        <div className="mb-6">
          <h1 className="text-white text-4xl font-black tracking-tight mb-2">Recurring</h1>
          <p className="text-slate-500 font-medium leading-relaxed">
            Money is added on the days you pick. Missed days are filled in the next time you open
            the app.
          </p>
        </div>

        <div className="space-y-4">
          {schedules.length === 0 && !adding && (
            <div className="bg-surface border border-dashed border-white/10 rounded-[2rem] p-12 flex flex-col items-center justify-center text-center">
              <span className="material-symbols-rounded text-4xl text-slate-700 mb-4">event_repeat</span>
              <p className="text-slate-500 font-bold">No recurring deposits</p>
              <p className="text-slate-600 text-xs mt-1">Add one to save on autopilot</p>
            </div>
          )}

          {schedules.map((s) => (
            <div key={s.id} className="bg-surface border border-white/5 rounded-[2rem] p-5 shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-white text-2xl font-black">${s.amount.toFixed(2)}</p>
                  <p className="text-primary text-xs font-bold mt-0.5">{describe(s)}</p>
                  <p className="text-slate-500 text-xs font-medium mt-1 truncate">
                    → {targetName(s.targetBankId)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => onDelete(s.id)}
                    className="size-10 rounded-full flex items-center justify-center bg-red-500/10 text-red-400 active:scale-90 transition-transform"
                  >
                    <span className="material-symbols-rounded text-xl">delete</span>
                  </button>
                  <button
                    onClick={() => onToggle(s.id, !s.enabled)}
                    className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                      s.enabled ? 'bg-primary/20' : 'bg-white/10'
                    }`}
                  >
                    <span
                      className={`inline-block size-6 transform rounded-full transition-transform ${
                        s.enabled ? 'translate-x-7 bg-primary' : 'translate-x-1 bg-slate-600'
                      }`}
                    ></span>
                  </button>
                </div>
              </div>
            </div>
          ))}

          {adding ? (
            <div className="bg-surface border border-white/5 rounded-[2rem] p-5 space-y-6 shadow-xl">
              <div className="space-y-3">
                <label className="text-slate-500 text-xs font-black uppercase tracking-widest">Amount</label>
                <div className="relative">
                  <span className="absolute left-5 top-1/2 -translate-y-1/2 text-2xl font-black text-slate-600">$</span>
                  <input
                    autoFocus
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    type="number"
                    inputMode="decimal"
                    placeholder="0.00"
                    className="w-full h-16 pl-11 pr-5 rounded-2xl bg-white/5 border border-white/10 text-2xl font-black text-white focus:outline-none focus:border-primary transition-all placeholder:text-slate-700"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-slate-500 text-xs font-black uppercase tracking-widest">Repeat</label>
                <div className="grid grid-cols-4 gap-2">
                  {FREQUENCIES.map((f) => (
                    <button
                      key={f.value}
                      onClick={() => setFrequency(f.value)}
                      className={`h-11 rounded-2xl text-xs font-bold transition-all ${
                        frequency === f.value ? 'bg-primary text-black' : 'bg-white/5 text-slate-400'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {frequency === 'weekly' && (
                <div className="space-y-3">
                  <label className="text-slate-500 text-xs font-black uppercase tracking-widest">On</label>
                  <div className="grid grid-cols-7 gap-1.5">
                    {WEEKDAY_LABELS.map((d, i) => (
                      <button
                        key={d}
                        onClick={() => setWeekday(i)}
                        className={`h-11 rounded-xl text-xs font-black transition-all ${
                          weekday === i ? 'bg-primary text-black' : 'bg-white/5 text-slate-400'
                        }`}
                      >
                        {d.slice(0, 1)}
                      </button>
                    ))}
                  </div>
                  <p className="text-slate-600 text-[11px] font-medium">{WEEKDAY_LABELS[weekday]}</p>
                </div>
              )}

              {frequency === 'yearly' && (
                <div className="space-y-3">
                  <label className="text-slate-500 text-xs font-black uppercase tracking-widest">Month</label>
                  <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
                    {MONTH_LABELS.map((m, i) => (
                      <button key={m} onClick={() => setMonth(i + 1)} className={chip(month === i + 1)}>
                        {m.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {(frequency === 'monthly' || frequency === 'yearly') && (
                <div className="space-y-3">
                  <label className="text-slate-500 text-xs font-black uppercase tracking-widest">Day</label>
                  <div className="grid grid-cols-7 gap-1.5">
                    {DAYS_OF_MONTH.map((d) => (
                      <button
                        key={d}
                        onClick={() => setDayOfMonth(d)}
                        className={`h-10 rounded-xl text-xs font-bold transition-all ${
                          dayOfMonth === d ? 'bg-primary text-black' : 'bg-white/5 text-slate-400'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                  {dayOfMonth > 28 && (
                    <p className="text-slate-600 text-[11px] font-medium leading-relaxed">
                      Shorter months fall back to their last day.
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-3">
                <label className="text-slate-500 text-xs font-black uppercase tracking-widest">Goes to</label>
                <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
                  <button onClick={() => setTargetBankId(null)} className={chip(targetBankId === null)}>
                    Split by strategy
                  </button>
                  {banks.map((b) => (
                    <button key={b.id} onClick={() => setTargetBankId(b.id)} className={chip(targetBankId === b.id)}>
                      {b.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl bg-primary/5 border border-primary/20 px-5 py-4">
                <p className="text-primary text-xs font-bold leading-relaxed">
                  ${(parseFloat(amount) || 0).toFixed(2)} · {describe({ frequency, weekday, dayOfMonth, month })}
                </p>
              </div>

              <div className="flex gap-3">
                <button onClick={reset} className="flex-1 h-14 rounded-2xl bg-white/5 text-slate-400 font-bold">
                  Cancel
                </button>
                <button
                  onClick={() => void handleCreate()}
                  disabled={!(parseFloat(amount) > 0) || busy}
                  className={`flex-1 h-14 rounded-2xl font-black transition-all ${
                    parseFloat(amount) > 0 && !busy
                      ? 'bg-primary text-black active:scale-95'
                      : 'bg-white/5 text-slate-700 cursor-not-allowed'
                  }`}
                >
                  {busy ? 'Saving...' : 'Add'}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="w-full h-16 rounded-[2rem] glass border border-white/10 text-white font-bold flex items-center justify-center gap-3 active:scale-95 transition-transform"
            >
              <span className="material-symbols-rounded text-primary">add_circle</span>
              New recurring deposit
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AutoDeposits;
