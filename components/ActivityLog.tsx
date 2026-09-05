import React, { useMemo, useState } from 'react';
import { Activity, ActivityType, PiggyBank } from '../types';
import { fromCents, toCents } from '../services/money';
import { useBackHandler } from '../hooks/useBackHandler';
import { SLICE_COLORS } from './DonutChart';

const STYLES: Record<ActivityType, { label: string; icon: string; tint: string; outgoing: boolean }> = {
  'auto-save': { label: 'Scheduled deposit', icon: 'cycle', tint: 'bg-primary/10 text-primary', outgoing: false },
  manual: { label: 'Deposit', icon: 'person', tint: 'bg-blue-400/10 text-blue-400', outgoing: false },
  withdraw: { label: 'Withdrawal', icon: 'north_east', tint: 'bg-slate-500/10 text-slate-400', outgoing: true },
  borrow: { label: 'Borrowed', icon: 'account_balance', tint: 'bg-amber-500/10 text-amber-400', outgoing: true },
};

interface ActivityLogProps {
  activities: Activity[];
  banks: PiggyBank[];
  onDeleteActivity: (id: string) => void;
  onEditActivity: (id: string, newAmount: number) => void;
}

const money = (n: number) =>
  `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** What actually reached the goals, and what left them, in cents. */
const inflow = (a: Activity) => a.distributions.reduce((s, d) => (d.amount > 0 ? s + toCents(d.amount) : s), 0);
const outflow = (a: Activity) => a.distributions.reduce((s, d) => (d.amount < 0 ? s - toCents(d.amount) : s), 0);

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthLabel = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
const shortMonth = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** TODAY / YESTERDAY / SATURDAY, SEP 5 */
const dayLabel = (d: Date, now: Date) => {
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
  if (sameDay(d, now)) return `TODAY, ${date}`;
  if (sameDay(d, new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))) return `YESTERDAY, ${date}`;
  return `${d.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase()}, ${date}`;
};

interface Day {
  key: string;
  date: Date;
  entries: Activity[];
  saved: number;
  spent: number;
  borrowed: number;
  repaid: number;
}

const ActivityLog: React.FC<ActivityLogProps> = ({ activities, banks, onDeleteActivity, onEditActivity }) => {
  const now = new Date();
  const [month, setMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [openEntry, setOpenEntry] = useState<string | null>(null);
  const [pickMonth, setPickMonth] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  useBackHandler(pickMonth, () => setPickMonth(false));

  const colorOf = (bankId: string) =>
    SLICE_COLORS[Math.max(0, banks.findIndex((b) => b.id === bankId)) % SLICE_COLORS.length];

  /** Every month that holds a record, newest first, plus the current one. */
  const months = useMemo(() => {
    const seen = new Map<string, { date: Date; saved: number }>();
    const current = new Date(now.getFullYear(), now.getMonth(), 1);
    seen.set(monthKey(current), { date: current, saved: 0 });

    for (const a of activities) {
      const d = new Date(a.date);
      const first = new Date(d.getFullYear(), d.getMonth(), 1);
      const row = seen.get(monthKey(first)) ?? { date: first, saved: 0 };
      row.saved += inflow(a);
      seen.set(monthKey(first), row);
    }
    return [...seen.values()].sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [activities]); // eslint-disable-line react-hooks/exhaustive-deps

  const savedIn = (d: Date) => months.find((m) => monthKey(m.date) === monthKey(d))?.saved ?? 0;
  const savedThisMonth = savedIn(month);
  const savedLastMonth = savedIn(new Date(month.getFullYear(), month.getMonth() - 1, 1));
  const change =
    savedLastMonth > 0 ? Math.round(((savedThisMonth - savedLastMonth) / savedLastMonth) * 1000) / 10 : null;

  /** The selected month's records, bundled by day, newest day first. */
  const days = useMemo(() => {
    const out = new Map<string, Day>();
    for (const a of activities) {
      const d = new Date(a.date);
      if (d.getFullYear() !== month.getFullYear() || d.getMonth() !== month.getMonth()) continue;

      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const day =
        out.get(key) ??
        ({
          key,
          date: new Date(d.getFullYear(), d.getMonth(), d.getDate()),
          entries: [],
          saved: 0,
          spent: 0,
          borrowed: 0,
          repaid: 0,
        } as Day);

      day.entries.push(a);
      day.saved += inflow(a);
      day.spent += outflow(a);
      if (a.type === 'borrow') day.borrowed += toCents(a.amount);
      day.repaid += toCents(a.repaid ?? 0);
      out.set(key, day);
    }
    // Activities arrive newest first, so each day's entries already are too.
    return [...out.values()].sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [activities, month]);

  /** Only a plain split can be re-derived from its percentages. Anything that
      moved money out, or paid down a loan, has to be deleted and redone. */
  const canEdit = (activity: Activity) => !STYLES[activity.type].outgoing && !activity.repaid;

  const handleSaveEdit = (id: string) => {
    const val = parseFloat(editValue);
    if (!isNaN(val) && val >= 0) onEditActivity(id, val);
    setEditingId(null);
  };

  const handleDelete = (activity: Activity) => {
    const undo = STYLES[activity.type].outgoing
      ? 'This will put the money back into your goals.'
      : 'This will deduct the corresponding amounts from your goals.';
    if (window.confirm(`Remove this entry? ${undo}`)) onDeleteActivity(activity.id);
  };

  /** Where one entry's money went, as coloured rows carrying their share. */
  const splitRows = (activity: Activity) => {
    const total = inflow(activity);
    // Borrowing is money from outside, so it touches no goal at all.
    if (activity.distributions.length === 0) {
      return (
        <p className="text-slate-500 text-xs font-medium py-2 leading-relaxed">
          No goal was touched — borrowed money is cleared by your next deposits.
        </p>
      );
    }
    return activity.distributions.map((dist) => {
      const bank = banks.find((b) => b.id === dist.bankId);
      const color = colorOf(dist.bankId);
      const share = total > 0 && dist.amount > 0 ? Math.round((toCents(dist.amount) / total) * 100) : null;
      return (
        <div key={dist.bankId} className="flex items-center gap-3 py-2">
          <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <span className="text-slate-300 text-sm font-bold truncate">{bank?.name ?? 'Deleted goal'}</span>
          {share !== null && (
            <span
              className="text-[10px] font-black px-1.5 py-0.5 rounded-md shrink-0"
              style={{ color, backgroundColor: `${color}1f` }}
            >
              {share}%
            </span>
          )}
          <span className={`ml-auto text-sm font-black shrink-0 ${dist.amount < 0 ? 'text-slate-400' : 'text-white'}`}>
            {dist.amount < 0 ? '-' : '+'}
            {money(dist.amount)}
          </span>
        </div>
      );
    });
  };

  /**
   * One entry: what it was and how much, then its time and buttons underneath.
   * Two rows rather than one, so a long name still fits on a narrow phone.
   */
  const entryRow = (activity: Activity, boxed: boolean) => {
    const style = STYLES[activity.type];
    return (
      <div className={boxed ? '' : 'pt-3 mt-1 border-t border-white/5'}>
        <div className="flex items-center gap-3">
          <span className={`size-8 shrink-0 rounded-xl flex items-center justify-center ${style.tint}`}>
            <span className="material-symbols-rounded text-base">{style.icon}</span>
          </span>
          <p className="text-slate-300 text-xs font-bold truncate flex-1">{activity.note || style.label}</p>
          <span className={`text-sm font-black shrink-0 ${style.outgoing ? 'text-slate-400' : 'text-white'}`}>
            {style.outgoing ? '-' : '+'}
            {money(activity.amount)}
          </span>
        </div>

        <div className="flex items-center gap-2 mt-1.5 pl-11">
          <p className="text-slate-600 text-[10px] font-medium truncate flex-1">
            {new Date(activity.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            {activity.repaid ? ` · ${money(activity.repaid)} to debt` : ''}
          </p>

          {editingId === activity.id ? (
            <>
              <input
                autoFocus
                type="number"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="w-20 bg-white/10 border border-primary/30 rounded-lg px-2 py-1 text-white font-black text-right outline-none"
              />
              <button onClick={() => setEditingId(null)} className="text-[10px] text-slate-500 font-black uppercase">
                Cancel
              </button>
              <button onClick={() => handleSaveEdit(activity.id)} className="text-[10px] text-primary font-black uppercase">
                Save
              </button>
            </>
          ) : (
            <>
              {canEdit(activity) && (
                <button
                  onClick={() => {
                    setEditingId(activity.id);
                    setEditValue(activity.amount.toString());
                  }}
                  className="size-8 shrink-0 rounded-full flex items-center justify-center bg-white/5 text-slate-500 active:scale-90"
                >
                  <span className="material-symbols-rounded text-base">edit</span>
                </button>
              )}
              <button
                onClick={() => handleDelete(activity)}
                className="size-8 shrink-0 rounded-full flex items-center justify-center bg-red-500/5 text-red-500/40 active:scale-90"
              >
                <span className="material-symbols-rounded text-base">delete</span>
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col min-h-full pb-32 safe-pt">
      {/* Header */}
      <div className="px-6 pt-6 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-white text-3xl font-black tracking-tight">History</h2>
          <p className="text-slate-500 text-sm font-medium mt-1">Every deposit, and where it landed.</p>
        </div>
        <button
          onClick={() => setPickMonth(true)}
          aria-label="Pick a month"
          className="size-10 shrink-0 rounded-full glass flex items-center justify-center text-slate-300 active:scale-90 transition-transform"
        >
          <span className="material-symbols-rounded">calendar_month</span>
        </button>
      </div>

      {/* Month total */}
      <div className="px-6 mt-6">
        <div className="rounded-[2rem] border border-primary/20 bg-primary/5 p-6">
          <p className="text-primary/70 text-[10px] font-black uppercase tracking-widest">
            Total saved · {monthLabel(month)}
          </p>
          <div className="flex items-end gap-3 mt-2 flex-wrap">
            <h3 className="text-white text-4xl font-black tracking-tight">{money(fromCents(savedThisMonth))}</h3>
            {change !== null && (
              <span
                className={`flex items-center gap-0.5 text-sm font-black ${change < 0 ? 'text-slate-400' : 'text-primary'}`}
              >
                <span className="material-symbols-rounded text-base">
                  {change < 0 ? 'trending_down' : 'trending_up'}
                </span>
                {change > 0 ? '+' : ''}
                {change}%
              </span>
            )}
          </div>
          <p className="text-slate-500 text-xs font-medium mt-1">
            {change === null ? 'Nothing saved the month before.' : 'Compared with the month before.'}
          </p>
        </div>
      </div>

      {/* Timeline */}
      <div className="px-6 mt-8">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h3 className="text-white text-lg font-black">Activity feed</h3>
          <p className="text-primary text-xs font-black">{shortMonth(month)}</p>
        </div>

        {days.length === 0 ? (
          <div className="bg-surface border border-dashed border-white/10 rounded-[2rem] p-12 flex flex-col items-center justify-center text-center">
            <span className="material-symbols-rounded text-4xl text-slate-700 mb-4">history</span>
            <p className="text-slate-500 font-bold">Nothing in {monthLabel(month)}</p>
            <p className="text-slate-600 text-xs mt-1">Pick another month with the calendar above</p>
          </div>
        ) : (
          <div className="relative">
            {/* The rail the day markers sit on. */}
            <div className="absolute left-[1.375rem] top-4 bottom-4 w-px bg-white/5" />

            <div className="space-y-3">
              {days.map((day) => {
                const open = openDay === day.key;
                const net = day.saved - day.spent;
                const tint =
                  day.borrowed > 0
                    ? 'bg-amber-500/10 text-amber-400'
                    : net < 0
                      ? 'bg-slate-500/10 text-slate-400'
                      : 'bg-primary/10 text-primary';
                const icon = day.borrowed > 0 ? 'account_balance' : net < 0 ? 'north_east' : 'savings';
                const single = day.entries.length === 1;

                return (
                  <div key={day.key} className="relative pl-14">
                    <span
                      className={`absolute left-0 top-4 size-11 rounded-2xl flex items-center justify-center ring-4 ring-bg-dark ${tint}`}
                    >
                      <span className="material-symbols-rounded">{icon}</span>
                    </span>

                    <div className="bg-surface border border-white/5 rounded-3xl shadow-lg overflow-hidden">
                      <button
                        onClick={() => {
                          setOpenDay(open ? null : day.key);
                          setOpenEntry(null);
                        }}
                        className="w-full p-5 flex items-start gap-3 text-left"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">
                            {dayLabel(day.date, now)}
                          </p>
                          <p className={`text-2xl font-black mt-1 ${net < 0 ? 'text-slate-300' : 'text-white'}`}>
                            {net < 0 ? '-' : '+'}
                            {money(fromCents(net))}
                          </p>
                          {(day.spent > 0 || day.borrowed > 0 || day.repaid > 0) && (
                            <p className="text-slate-500 text-[11px] font-bold mt-1">
                              {day.saved > 0 && `saved ${money(fromCents(day.saved))}`}
                              {day.saved > 0 && day.spent > 0 && ' · '}
                              {day.spent > 0 && `spent ${money(fromCents(day.spent))}`}
                              {day.repaid > 0 && (
                                <span className="text-amber-400"> · {money(fromCents(day.repaid))} to debt</span>
                              )}
                              {day.borrowed > 0 && (
                                <span className="text-amber-400"> · borrowed {money(fromCents(day.borrowed))}</span>
                              )}
                            </p>
                          )}
                        </div>
                        <span
                          className={`material-symbols-rounded text-slate-600 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
                        >
                          expand_more
                        </span>
                      </button>

                      {open && (
                        <div className="px-5 pb-5">
                          {single ? (
                            <>
                              <div className="divide-y divide-white/5">{splitRows(day.entries[0])}</div>
                              {entryRow(day.entries[0], false)}
                            </>
                          ) : (
                            <div className="space-y-2">
                              {day.entries.map((entry) => {
                                const shown = openEntry === entry.id;
                                return (
                                  <div key={entry.id} className="rounded-2xl bg-white/5 p-3">
                                    <button onClick={() => setOpenEntry(shown ? null : entry.id)} className="w-full text-left">
                                      {entryRow(entry, true)}
                                    </button>
                                    {shown && (
                                      <div className="mt-2 pt-2 border-t border-white/5 divide-y divide-white/5">
                                        {splitRows(entry)}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Month picker */}
      {pickMonth && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setPickMonth(false)}
        >
          <div
            className="w-full max-w-md bg-surface rounded-t-[3rem] sm:rounded-[3rem] sm:mb-6 shadow-2xl animate-in slide-in-from-bottom duration-300 p-7 safe-pb"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-white text-2xl font-black">Jump to a month</h3>
            <p className="text-slate-500 text-sm font-medium mt-1">Only months holding records are listed.</p>

            <div className="mt-5 space-y-2 max-h-[50vh] overflow-y-auto no-scrollbar">
              {months.map((m) => {
                const on = monthKey(m.date) === monthKey(month);
                return (
                  <button
                    key={monthKey(m.date)}
                    onClick={() => {
                      setMonth(m.date);
                      setOpenDay(null);
                      setPickMonth(false);
                    }}
                    className={`w-full flex items-center justify-between gap-3 rounded-2xl px-5 h-14 transition-colors ${
                      on ? 'bg-primary text-black' : 'bg-white/5 text-white'
                    }`}
                  >
                    <span className="font-black">{monthLabel(m.date)}</span>
                    <span className={`text-sm font-black ${on ? 'text-black/70' : 'text-slate-400'}`}>
                      {money(fromCents(m.saved))}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ActivityLog;
