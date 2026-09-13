import React, { useEffect, useMemo, useState } from 'react';
import type { Alert, AlertKind, NotificationPrefs } from '../types';
import { formatTime } from '../services/alerts';
import {
  checkPermission,
  exactAlarmAllowed,
  requestExactAlarms,
  requestPermission,
  type Permission,
} from '../services/notifications';
import { formatMoney } from '../services/money';
import TimeField from './TimeField';
import { useT } from '../contexts/LanguageContext';
import { dateLocale, type Messages } from '../i18n';

interface AlertsProps {
  alerts: Alert[];
  prefs: NotificationPrefs;
  onBack: () => void;
  onMarkRead: (ids: string[]) => void;
  onSavePrefs: (patch: Partial<NotificationPrefs>) => void;
  onOpenStrategy: () => void;
}

type Filter = 'all' | 'deposits' | 'milestones' | 'streaks';

// Labels are looked up by key at render, so they follow the language.
const FILTERS: { key: Filter; kinds: AlertKind[] }[] = [
  { key: 'all', kinds: ['receipt', 'milestone', 'reached', 'streak', 'dividend', 'housekeeping'] },
  { key: 'deposits', kinds: ['receipt', 'dividend'] },
  { key: 'milestones', kinds: ['milestone', 'reached'] },
  { key: 'streaks', kinds: ['streak'] },
];


const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** "Today" / "Yesterday" / "Sep 3", for grouping the timeline. */
const dayLabel = (d: Date, now: Date, t: Messages) => {
  if (sameDay(d, now)) return t.common.today;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameDay(d, yesterday)) return t.common.yesterday;
  return d.toLocaleDateString(dateLocale('en-US'), { month: 'short', day: 'numeric', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
};

/** "10m ago" within the hour, otherwise the clock time. */
const timeLabel = (d: Date, now: Date, t: Messages) => {
  const minutes = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (minutes < 1) return t.alerts.justNow;
  if (minutes < 60) return t.alerts.minutesAgo(minutes);
  return d.toLocaleTimeString(dateLocale('en-US'), { hour: 'numeric', minute: '2-digit' });
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
  const t = useT();
  const [filter, setFilter] = useState<Filter>('all');
  const [permission, setPermission] = useState<Permission>('unsupported');
  const [exact, setExact] = useState(true);
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
      const label = dayLabel(new Date(a.date), now, t);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(a);
      else out.push({ label, items: [a] });
    }
    return out;
  }, [visible, t]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const blocked = permission === 'denied';
  const wantsAlarms = prefs.reminder || prefs.digest || prefs.exDates;

  const body = (a: Alert) => {
    switch (a.kind) {
      case 'receipt':
        return (
          <>
            <p className="text-slate-400 text-xs font-medium leading-relaxed">
              {t.alerts.splitAcross(a.lines?.length ?? 0)}
            </p>
            <div className="grid grid-cols-2 gap-2 mt-3">
              {a.lines?.map((l) => (
                <div key={l.bankId} className="flex items-center justify-between gap-2 bg-white/5 rounded-xl px-3 py-2 min-w-0">
                  {/* A receipt stores "Deleted goal" in English for a goal that was gone. */}
                  <span className="text-slate-300 text-[11px] font-bold truncate">{l.name === 'Deleted goal' ? t.alerts.deletedGoal : l.name}</span>
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
              {t.alerts.milestoneBefore}<span className="text-white font-bold">{a.bankName}</span>{t.alerts.milestonePast}
              <span className="text-primary font-bold">{formatMoney(a.reachedAmount ?? 0)}</span>{t.alerts.milestoneEnd}
              {a.amount !== undefined && (
                <>{t.alerts.milestoneLeft(formatMoney(a.amount))}</>
              )}
            </p>
            {/* Only a goal with a target has a bar to fill. */}
            {a.percent !== undefined && (
              <div className="flex items-center gap-3 mt-3">
                <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${a.percent}%` }} />
                </div>
                <span className="text-white text-[11px] font-black">{a.percent}%</span>
              </div>
            )}
          </>
        );
      case 'reached':
        return (
          <>
            <p className="text-slate-400 text-xs font-medium leading-relaxed">
              <span className="text-white font-bold">{a.bankName}</span>{t.alerts.reachedTarget(formatMoney(a.amount ?? 0, { decimals: 0 }))}
              {a.percent ? t.alerts.reachedStillTakes(a.percent) : ''}
              {a.overflow ? t.alerts.reachedOverflow : ''}
            </p>
            {a.percent ? (
              <div className="flex items-center justify-between gap-3 mt-4">
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">{t.alerts.stillAllocated(a.percent)}</p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onMarkRead([a.id]);
                    onOpenStrategy();
                  }}
                  className="h-10 px-4 rounded-full bg-primary text-black text-xs font-black active:scale-95 transition-transform"
                >
                  {t.alerts.reallocate}
                </button>
              </div>
            ) : null}
          </>
        );
      case 'streak':
        return (
          <p className="text-slate-400 text-xs font-medium leading-relaxed">
            {t.alerts.streakBody(a.days ?? '')}
          </p>
        );
      case 'housekeeping':
        return (
          <p className="text-slate-400 text-xs font-medium leading-relaxed">
            {t.alerts.housekeepingBody(a.months)}
          </p>
        );
      case 'dividend':
        return (
          <p className="text-slate-400 text-xs font-medium leading-relaxed">
            {t.alerts.dividendBody(a.units?.toLocaleString('en-US') ?? '')}
          </p>
        );
    }
  };

  const title = (a: Alert) => {
    switch (a.kind) {
      case 'receipt':
        return t.alerts.receiptTitle(formatMoney(a.amount ?? 0));
      case 'milestone':
        return t.alerts.milestoneTitle(a.bankName, formatMoney(a.reachedAmount ?? 0));
      case 'reached':
        return t.alerts.reachedTitle(a.bankName);
      case 'streak':
        return t.alerts.streakTitle(a.days);
      case 'housekeeping':
        return t.alerts.housekeepingTitle;
      case 'dividend':
        return t.alerts.dividendTitle(a.counter, formatMoney(a.amount ?? 0));
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
          <h2 className="text-white text-3xl font-black tracking-tight">{t.alerts.title}</h2>
          <p className="text-slate-500 text-sm font-medium mt-1">
            {unread.length === 0 ? t.alerts.allCaughtUp : t.alerts.newAlerts(unread.length)}
          </p>
        </div>
        {unread.length > 0 && (
          <button
            onClick={() => onMarkRead(unread.map((a) => a.id))}
            className="shrink-0 h-9 px-4 rounded-full glass text-slate-300 text-xs font-black flex items-center gap-1.5 active:scale-95 transition-transform"
          >
            <span className="material-symbols-rounded text-base">done_all</span>
            {t.alerts.markAllRead}
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
              {t.alerts.filters[f.key]}
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
            <p className="text-white font-black text-sm">{t.alerts.dailySavingsReminder}</p>
            <p className="text-slate-500 text-xs font-medium mt-0.5">
              {prefs.reminder ? (
                <>
                  {t.alerts.everyEveningAt}<span className="text-primary font-bold">{formatTime(prefs.reminderTime)}</span>
                </>
              ) : (
                t.alerts.reminderOff
              )}
            </p>
          </div>
          <Switch on={prefs.reminder} onChange={(on) => void enableSystem({ reminder: on })} />
        </Card>

        {blocked && (
          <div className="rounded-[2rem] bg-amber-500/10 border border-amber-500/20 p-5 flex items-start gap-3">
            <span className="material-symbols-rounded text-amber-400 shrink-0">notifications_off</span>
            <div className="min-w-0">
              <p className="text-amber-200 text-sm font-black">{t.alerts.blockedTitle}</p>
              <p className="text-amber-200/70 text-xs font-medium leading-relaxed mt-1">
                {t.alerts.blockedBody}
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
                <p className="text-amber-200 text-sm font-black">{t.alerts.lateTitle}</p>
                <p className="text-amber-200/70 text-xs font-medium leading-relaxed mt-1">
                  {t.alerts.lateBody}
                </p>
              </div>
            </div>
            <button
              onClick={() => void requestExactAlarms().then(setExact)}
              className="w-full h-12 rounded-2xl bg-amber-400 text-black font-black text-sm mt-4 active:scale-95 transition-transform"
            >
              {t.alerts.allowExact}
            </button>
          </div>
        )}

        {/* Timeline */}
        {groups.length === 0 ? (
          <Card className="p-8 text-center">
            <span className="material-symbols-rounded text-slate-600 text-4xl">notifications_paused</span>
            <p className="text-white font-black mt-3">{t.alerts.emptyTitle}</p>
            <p className="text-slate-500 text-xs font-medium mt-1 leading-relaxed">
              {t.alerts.emptyBody}
            </p>
          </Card>
        ) : (
          groups.map((g) => (
            <section key={g.label}>
              <div className="flex items-center justify-between px-1 mb-3">
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">{g.label}</p>
                <p className="text-slate-600 text-[10px] font-bold">
                  {t.alerts.updates(g.items.length)}
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
                          <p className="text-slate-600 text-[10px] font-bold shrink-0 mt-0.5">{timeLabel(new Date(a.date), now, t)}</p>
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
            <p className="text-white font-black">{t.alerts.deliveryPreferences}</p>
          </div>
          <Card className="divide-y divide-white/5">
            <div className="p-5 flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-white font-bold text-sm">{t.alerts.receiptsTitle}</p>
                <p className="text-slate-500 text-xs font-medium mt-0.5">{t.alerts.receiptsHint}</p>
              </div>
              <Switch on={prefs.receipts} onChange={(receipts) => onSavePrefs({ receipts })} />
            </div>
            <div className="p-5 flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-white font-bold text-sm">{t.alerts.milestonesTitle}</p>
                <p className="text-slate-500 text-xs font-medium mt-0.5">{t.alerts.milestonesHint}</p>
              </div>
              <Switch on={prefs.milestones} onChange={(milestones) => onSavePrefs({ milestones })} />
            </div>
            <div className="p-5 flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-white font-bold text-sm">{t.alerts.dailyReminder}</p>
                <p className="text-slate-500 text-xs font-medium mt-0.5">{t.alerts.dailyReminderHint}</p>
                {prefs.reminder && (
                  <TimeField
                    value={prefs.reminderTime}
                    onChange={(reminderTime) => onSavePrefs({ reminderTime })}
                    title={t.alerts.remindMeAt}
                    hint={t.alerts.remindHint}
                  />
                )}
              </div>
              <Switch on={prefs.reminder} onChange={(on) => void enableSystem({ reminder: on })} />
            </div>
            <div className="p-5 flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-white font-bold text-sm">{t.alerts.monthlyReport}</p>
                <p className="text-slate-500 text-xs font-medium mt-0.5">{t.alerts.monthlyReportHint}</p>
              </div>
              <Switch on={prefs.digest} onChange={(on) => void enableSystem({ digest: on })} />
            </div>
            <div className="p-5 flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-white font-bold text-sm">{t.alerts.exDates}</p>
                <p className="text-slate-500 text-xs font-medium mt-0.5">
                  {t.alerts.exDatesHint}
                </p>
              </div>
              <Switch on={prefs.exDates} onChange={(on) => void enableSystem({ exDates: on })} />
            </div>
          </Card>
          <p className="text-slate-600 text-[11px] font-medium leading-relaxed px-1 mt-3">
            {t.alerts.footer}
          </p>
        </section>
      </div>
    </div>
  );
};

export default Alerts;
