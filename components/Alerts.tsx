import React, { useEffect, useMemo, useState } from 'react';
import type { Alert, AlertKind, NotificationPrefs } from '../types';
import { formatTime } from '../services/alerts';
import {
  checkPermission,
  exactAlarmAllowed,
  requestExactAlarms,
  requestPermission,
  sendTestNotification,
  type Permission,
} from '../services/notifications';
import { formatMoney } from '../services/money';

interface AlertsProps {
  alerts: Alert[];
  prefs: NotificationPrefs;
  onBack: () => void;
  onMarkRead: (ids: string[]) => void;
  onSavePrefs: (patch: Partial<NotificationPrefs>) => void;
  onOpenStrategy: () => void;
}

type Filter = 'all' | 'deposits' | 'milestones' | 'streaks';

const FILTERS: { key: Filter; label: string; kinds: AlertKind[] }[] = [
  { key: 'all', label: 'All', kinds: ['receipt', 'milestone', 'reached', 'streak', 'dividend', 'housekeeping'] },
  { key: 'deposits', label: 'Deposits', kinds: ['receipt', 'dividend'] },
  { key: 'milestones', label: 'Milestones', kinds: ['milestone', 'reached'] },
  { key: 'streaks', label: 'Streaks', kinds: ['streak'] },
];


const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** "Today" / "Yesterday" / "Sep 3", for grouping the timeline. */
const dayLabel = (d: Date, now: Date) => {
  if (sameDay(d, now)) return 'Today';
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
};

/** "10m ago" within the hour, otherwise the clock time. */
const timeLabel = (d: Date, now: Date) => {
  const minutes = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

const Switch: React.FC<{ on: boolean; onChange: (on: boolean) => void }> = ({ on, onChange }) => (
  <button
    role="switch"
    aria-checked={on}
    onClick={() => onChange(!on)}
    className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors ${on ? 'bg-primary/20' : 'bg-white/10'}`}
  >
    <span className={`inline-block size-6 transform rounded-full transition-transform ${on ? 'translate-x-7 bg-primary' : 'translate-x-1 bg-slate-600'}`} />
  </button>
);

const Card: React.FC<{ className?: string; children: React.ReactNode; onClick?: () => void }> = ({ className = '', children, onClick }) => (
  <div onClick={onClick} className={`bg-surface border border-white/5 rounded-[2rem] shadow-xl ${className}`}>
    {children}
  </div>
);

const ICONS: Record<AlertKind, string> = {
  receipt: 'call_split',
  milestone: 'emoji_events',
  reached: 'celebration',
  streak: 'local_fire_department',
  dividend: 'payments',
  housekeeping: 'cleaning_services',
};

const Alerts: React.FC<AlertsProps> = ({ alerts, prefs, onBack, onMarkRead, onSavePrefs, onOpenStrategy }) => {
  const [filter, setFilter] = useState<Filter>('all');
  const [permission, setPermission] = useState<Permission>('unsupported');
  const [exact, setExact] = useState(true);
  const [tested, setTested] = useState<string | null>(null);
  const now = new Date();

  // Checked again every time the screen comes back into view. It used to be
  // read once on mount, so someone who went to Android's settings to allow
  // notifications came back to an app still convinced it was blocked.
  useEffect(() => {
    const read = () => {
      if (document.visibilityState !== 'visible') return;
      void checkPermission().then(setPermission);
      void exactAlarmAllowed().then(setExact);
    };
    read();
    document.addEventListener('visibilitychange', read);
    return () => document.removeEventListener('visibilitychange', read);
  }, []);

  const unread = alerts.filter((a) => !a.read);
  const kinds = FILTERS.find((f) => f.key === filter)!.kinds;
  const visible = alerts.filter((a) => kinds.includes(a.kind));

  // Timeline groups, newest day first, in the order the sorted list arrives.
  const groups = useMemo(() => {
    const out: { label: string; items: Alert[] }[] = [];
    for (const a of visible) {
      const label = dayLabel(new Date(a.date), now);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(a);
      else out.push({ label, items: [a] });
    }
    return out;
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const countOf = (f: Filter) => alerts.filter((a) => !a.read && FILTERS.find((x) => x.key === f)!.kinds.includes(a.kind)).length;

  /**
   * Turning a system notification on is the moment to ask the phone.
   *
   * The setting is only saved if the phone will actually deliver it. It used
   * to be saved either way, so a refused permission left the switch on and the
   * card cheerfully reading "Every evening at 8:00 PM" while `syncNotifications`
   * bailed on its first line and nothing was ever scheduled. Turning something
   * off always saves — that never needs permission.
   */
  const enableSystem = async (patch: Partial<NotificationPrefs>) => {
    const turningOn = Object.values(patch).some((v) => v === true);
    if (!turningOn) {
      onSavePrefs(patch);
      return;
    }
    let state = permission;
    if (state === 'prompt') {
      state = await requestPermission();
      setPermission(state);
    }
    if (state === 'denied') return;
    onSavePrefs(patch);
  };

  const test = async () => {
    setTested(
      (await sendTestNotification())
        ? 'Sent — it should appear in about five seconds.'
        : 'Could not send it. Notifications are still blocked.'
    );
  };

  const blocked = permission === 'denied';
  const wantsAlarms = prefs.reminder || prefs.digest || prefs.exDates;

  const body = (a: Alert) => {
    switch (a.kind) {
      case 'receipt':
        return (
          <>
            <p className="text-slate-400 text-xs font-medium leading-relaxed">
              Split across {a.lines?.length ?? 0} goal{a.lines?.length === 1 ? '' : 's'}:
            </p>
            <div className="grid grid-cols-2 gap-2 mt-3">
              {a.lines?.map((l) => (
                <div key={l.bankId} className="flex items-center justify-between gap-2 bg-white/5 rounded-xl px-3 py-2 min-w-0">
                  <span className="text-slate-300 text-[11px] font-bold truncate">{l.name}</span>
                  <span className="text-white text-[11px] font-black shrink-0">{formatMoney(l.amount)}</span>
                </div>
              ))}
            </div>
          </>
        );
      case 'milestone':
        return (
          <>
            <p className="text-slate-400 text-xs font-medium leading-relaxed">
              A deposit pushed <span className="text-white font-bold">{a.bankName}</span> past {a.percent}% of its target.{' '}
              <span className="text-primary font-bold">{formatMoney(a.amount ?? 0)}</span> left to go.
            </p>
            <div className="flex items-center gap-3 mt-3">
              <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full bg-primary" style={{ width: `${a.percent}%` }} />
              </div>
              <span className="text-white text-[11px] font-black">{a.percent}%</span>
            </div>
          </>
        );
      case 'reached':
        return (
          <>
            <p className="text-slate-400 text-xs font-medium leading-relaxed">
              <span className="text-white font-bold">{a.bankName}</span> reached its {formatMoney(a.amount ?? 0, { decimals: 0 })} target.
              {a.percent ? ` It still takes ${a.percent}% of every deposit.` : ''}
              {a.overflow ? ' Its share now goes to your other goals automatically.' : ''}
            </p>
            {a.percent ? (
              <div className="flex items-center justify-between gap-3 mt-4">
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Still allocated: {a.percent}%</p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onMarkRead([a.id]);
                    onOpenStrategy();
                  }}
                  className="h-10 px-4 rounded-full bg-primary text-black text-xs font-black active:scale-95 transition-transform"
                >
                  Reallocate Split
                </button>
              </div>
            ) : null}
          </>
        );
      case 'streak':
        return (
          <p className="text-slate-400 text-xs font-medium leading-relaxed">
            You have put money into your goals every day for {a.days} days straight. Keep it going.
          </p>
        );
      case 'housekeeping':
        return (
          <p className="text-slate-400 text-xs font-medium leading-relaxed">
            The app reads your whole history every time it opens, so records older than {a.months} months
            are cleared to keep that quick. Nothing has been removed yet. Open Report → Statements to save
            those months first, or to keep them for longer. Your balances are never affected.
          </p>
        );
      case 'dividend':
        return (
          <p className="text-slate-400 text-xs font-medium leading-relaxed">
            Worked out on the {a.units?.toLocaleString('en-US')} units you held on the ex-date and split
            across your goals like any other deposit. Companies deduct tax and fees, so check the amount
            that actually landed and correct it in Trades if it differs.
          </p>
        );
    }
  };

  const title = (a: Alert) => {
    switch (a.kind) {
      case 'receipt':
        return `Auto deposit posted (${formatMoney(a.amount ?? 0)})`;
      case 'milestone':
        return `Milestone: ${a.bankName}`;
      case 'reached':
        return `Goal reached: ${a.bankName}`;
      case 'streak':
        return `${a.days}-day savings streak`;
      case 'housekeeping':
        return 'Old records are ready to be cleared';
      case 'dividend':
        return `${a.counter} paid ${formatMoney(a.amount ?? 0)}`;
    }
  };

  return (
    <div className="flex flex-col min-h-full pb-16 safe-pt">
      {/* Header */}
      <div className="px-6 pt-6 flex items-center gap-4">
        <button
          onClick={onBack}
          className="size-10 shrink-0 rounded-full glass flex items-center justify-center text-slate-300 active:scale-90 transition-transform"
        >
          <span className="material-symbols-rounded">arrow_back</span>
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-white text-3xl font-black tracking-tight">Alerts</h2>
          <p className="text-slate-500 text-sm font-medium mt-1">
            {unread.length === 0 ? 'You are all caught up.' : `${unread.length} new alert${unread.length === 1 ? '' : 's'}`}
          </p>
        </div>
        {unread.length > 0 && (
          <button
            onClick={() => onMarkRead(unread.map((a) => a.id))}
            className="shrink-0 h-9 px-4 rounded-full glass text-slate-300 text-xs font-black flex items-center gap-1.5 active:scale-95 transition-transform"
          >
            <span className="material-symbols-rounded text-base">done_all</span>
            Mark all read
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 px-6 mt-6 overflow-x-auto no-scrollbar">
        {FILTERS.map((f) => {
          const n = countOf(f.key);
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`shrink-0 h-9 px-4 rounded-full text-xs font-black flex items-center gap-2 transition-colors ${
                filter === f.key ? 'bg-primary text-black' : 'glass text-slate-300'
              }`}
            >
              {f.label}
              {n > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${filter === f.key ? 'bg-black/15' : 'bg-primary/20 text-primary'}`}>
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="px-6 mt-6 space-y-6">
        {/* Daily reminder */}
        <Card className="p-5 flex items-center gap-4 bg-gradient-to-br from-surface to-primary/5">
          <div className="size-12 shrink-0 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
            <span className="material-symbols-rounded">alarm</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-white font-black text-sm">Daily savings reminder</p>
            <p className="text-slate-500 text-xs font-medium mt-0.5">
              {prefs.reminder ? (
                <>
                  Every evening at <span className="text-primary font-bold">{formatTime(prefs.reminderTime)}</span>
                </>
              ) : (
                'Off — a nudge to keep your streak alive'
              )}
            </p>
          </div>
          <Switch on={prefs.reminder} onChange={(on) => void enableSystem({ reminder: on })} />
        </Card>

        {blocked && (
          <div className="rounded-[2rem] bg-amber-500/10 border border-amber-500/20 p-5 flex items-start gap-3">
            <span className="material-symbols-rounded text-amber-400 shrink-0">notifications_off</span>
            <div className="min-w-0">
              <p className="text-amber-200 text-sm font-black">Android is blocking these</p>
              <p className="text-amber-200/70 text-xs font-medium leading-relaxed mt-1">
                Nothing can be scheduled until you allow them. Open Settings → Apps → SavvyPiggy →
                Notifications and turn them on, then come back — this screen rechecks itself.
              </p>
            </div>
          </div>
        )}

        {/*
          An inexact alarm is handed to the system as a suggestion: a dozing
          phone can sit on it for the best part of an hour, and an aggressive
          battery saver can drop it entirely. Since Android 13 this is not
          granted on install, and the app never asked — which is the most
          likely reason an evening reminder simply never arrived.
        */}
        {!blocked && permission === 'granted' && wantsAlarms && !exact && (
          <div className="rounded-[2rem] bg-amber-500/10 border border-amber-500/20 p-5">
            <div className="flex items-start gap-3">
              <span className="material-symbols-rounded text-amber-400 shrink-0">schedule</span>
              <div className="min-w-0">
                <p className="text-amber-200 text-sm font-black">Reminders may arrive late</p>
                <p className="text-amber-200/70 text-xs font-medium leading-relaxed mt-1">
                  Android is allowed to delay these by up to an hour, or skip them while the phone is
                  asleep. Allowing exact alarms makes 8:00 PM mean 8:00 PM.
                </p>
              </div>
            </div>
            <button
              onClick={() => void requestExactAlarms().then(setExact)}
              className="w-full h-12 rounded-2xl bg-amber-400 text-black font-black text-sm mt-4 active:scale-95 transition-transform"
            >
              Allow exact alarms
            </button>
          </div>
        )}

        {/* "Is this thing on?" deserves an answer that isn't "wait until 8pm". */}
        {permission !== 'unsupported' && (
          <div className="rounded-[2rem] glass p-5">
            <div className="flex items-center gap-3">
              <span className="material-symbols-rounded text-slate-400 shrink-0">notifications_active</span>
              <div className="min-w-0 flex-1">
                <p className="text-white text-sm font-black">Check it works</p>
                <p className="text-slate-500 text-[11px] font-medium mt-0.5 leading-relaxed">
                  {tested ?? 'Sends one notification now, so you can see it arrive.'}
                </p>
              </div>
              <button
                onClick={() => void test()}
                disabled={blocked}
                className="shrink-0 h-10 px-4 rounded-2xl bg-white/5 border border-white/10 text-slate-300 font-black text-xs active:scale-95 transition-transform disabled:opacity-40"
              >
                Send
              </button>
            </div>
          </div>
        )}

        {/* Timeline */}
        {groups.length === 0 ? (
          <Card className="p-8 text-center">
            <span className="material-symbols-rounded text-slate-600 text-4xl">notifications_paused</span>
            <p className="text-white font-black mt-3">Nothing here yet</p>
            <p className="text-slate-500 text-xs font-medium mt-1 leading-relaxed">
              Milestones, auto-deposit receipts and streaks show up here as they happen.
            </p>
          </Card>
        ) : (
          groups.map((g) => (
            <section key={g.label}>
              <div className="flex items-center justify-between px-1 mb-3">
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">{g.label}</p>
                <p className="text-slate-600 text-[10px] font-bold">
                  {g.items.length} update{g.items.length === 1 ? '' : 's'}
                </p>
              </div>
              <div className="space-y-3">
                {g.items.map((a) => (
                  <Card
                    key={a.id}
                    onClick={() => !a.read && onMarkRead([a.id])}
                    className={`p-5 ${a.read ? '' : 'border-primary/20'} ${a.kind === 'reached' ? 'bg-gradient-to-br from-surface to-primary/10' : ''}`}
                  >
                    <div className="flex items-start gap-4">
                      <div className="relative shrink-0">
                        <div
                          className={`size-11 rounded-2xl flex items-center justify-center ${
                            a.kind === 'reached' ? 'bg-primary text-black' : 'bg-primary/10 text-primary'
                          }`}
                        >
                          <span className="material-symbols-rounded">{ICONS[a.kind]}</span>
                        </div>
                        {!a.read && <span className="absolute -top-1 -left-1 size-3 rounded-full bg-primary ring-2 ring-surface" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p className={`font-black text-sm leading-snug ${a.kind === 'reached' ? 'text-primary' : 'text-white'}`}>{title(a)}</p>
                          <p className="text-slate-600 text-[10px] font-bold shrink-0 mt-0.5">{timeLabel(new Date(a.date), now)}</p>
                        </div>
                        <div className="mt-1.5">{body(a)}</div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ))
        )}

        {/* Preferences */}
        <section>
          <div className="flex items-center gap-2 px-1 mb-3">
            <span className="material-symbols-rounded text-primary text-lg">tune</span>
            <p className="text-white font-black">Delivery preferences</p>
          </div>
          <Card className="divide-y divide-white/5">
            <div className="p-5 flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-white font-bold text-sm">Auto-deposit receipts</p>
                <p className="text-slate-500 text-xs font-medium mt-0.5">A card here each time a rule posts a deposit.</p>
              </div>
              <Switch on={prefs.receipts} onChange={(receipts) => onSavePrefs({ receipts })} />
            </div>
            <div className="p-5 flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-white font-bold text-sm">Milestones &amp; streaks</p>
                <p className="text-slate-500 text-xs font-medium mt-0.5">At 25, 50, 75 and 100% of a target, and on 7, 30, 100 and 365-day streaks.</p>
              </div>
              <Switch on={prefs.milestones} onChange={(milestones) => onSavePrefs({ milestones })} />
            </div>
            <div className="p-5 flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-white font-bold text-sm">Daily reminder</p>
                <p className="text-slate-500 text-xs font-medium mt-0.5">A system notification every evening.</p>
                {prefs.reminder && (
                  <label className="mt-3 inline-flex items-center gap-2 h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm font-bold">
                    <span className="material-symbols-rounded text-primary text-base">schedule</span>
                    <input
                      type="time"
                      value={prefs.reminderTime}
                      onChange={(e) => e.target.value && onSavePrefs({ reminderTime: e.target.value })}
                      className="bg-transparent outline-none text-white font-bold [color-scheme:dark]"
                    />
                  </label>
                )}
              </div>
              <Switch on={prefs.reminder} onChange={(on) => void enableSystem({ reminder: on })} />
            </div>
            <div className="p-5 flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-white font-bold text-sm">Monthly report</p>
                <p className="text-slate-500 text-xs font-medium mt-0.5">On the 1st at 9:00 AM, opening last month’s Report.</p>
              </div>
              <Switch on={prefs.digest} onChange={(on) => void enableSystem({ digest: on })} />
            </div>
            <div className="p-5 flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-white font-bold text-sm">Ex-dividend days</p>
                <p className="text-slate-500 text-xs font-medium mt-0.5">
                  Two days before a counter you hold goes ex-dividend — the day that decides whether the
                  payment is yours.
                </p>
              </div>
              <Switch on={prefs.exDates} onChange={(on) => void enableSystem({ exDates: on })} />
            </div>
          </Card>
          <p className="text-slate-600 text-[11px] font-medium leading-relaxed px-1 mt-3">
            Reminders are set on this phone and fire even when the app is closed. Auto deposits themselves are only posted when
            you open the app — there is no server behind SavvyPiggy — so a rule that is due gets a 9:00 AM nudge to open it.
          </p>
        </section>
      </div>
    </div>
  );
};

export default Alerts;
