import React, { useEffect, useMemo, useState } from 'react';
import type { Alert, AlertKind, NotificationPrefs } from '../types';
import { formatTime } from '../services/alerts';
import { checkPermission, exactAlarmAllowed, requestExactAlarms, requestPermission, type Permission } from '../services/notifications';
import { formatMoney } from '../services/money';
import TimeField from './TimeField';
import { useT } from '../contexts/LanguageContext';
import { dateLocale, type Messages } from '../i18n';
import { Button } from './ui/Button';
import { Chip } from './ui/Chip';
import { EmptyState } from './ui/EmptyState';
import { Icon } from './ui/Icon';
import { Meter } from './ui/Meter';
import { Toggle } from './ui/Toggle';

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

const ICONS: Record<AlertKind, string> = {
  receipt: 'dep',
  milestone: 'spark',
  reached: 'target',
  streak: 'flame',
  dividend: 'coin',
  housekeeping: 'archive',
};

const TINTS: Record<AlertKind, string> = {
  receipt: 'bg-mint',
  milestone: 'bg-sun',
  reached: 'bg-mint',
  streak: 'bg-peach',
  dividend: 'bg-lav',
  housekeeping: 'bg-lav',
};

const OPEN_KEY = 'savvypiggy.alertsPrefsOpen';
const readOpen = () => {
  try {
    return localStorage.getItem(OPEN_KEY) === '1';
  } catch {
    return false;
  }
};

/** One setting. Declared out here so a row that holds a picker is not rebuilt (and its picker closed) each time a switch is flipped. */
const Pref: React.FC<{ title: string; hint: string; on: boolean; onChange: (on: boolean) => void; children?: React.ReactNode }> = ({
  title: name,
  hint,
  on,
  onChange,
  children,
}) => (
  <div className="flex items-center gap-3 py-2.5">
    <div className="min-w-0 flex-1">
      <p className="text-[14.5px] font-bold">{name}</p>
      <p className="text-[11.5px] font-medium leading-snug text-mute">{hint}</p>
      {children}
    </div>
    <Toggle checked={on} onChange={onChange} label={name} />
  </div>
);

const Alerts: React.FC<AlertsProps> = ({ alerts, prefs, onBack, onMarkRead, onSavePrefs, onOpenStrategy }) => {
  const t = useT();
  const [filter, setFilter] = useState<Filter>('all');
  const [permission, setPermission] = useState<Permission>('unsupported');
  const [exact, setExact] = useState(true);
  // The settings sit above the notifications, so they can be folded away once they are set.
  const [prefsOpen, setPrefsOpen] = useState(readOpen);
  const now = new Date();

  const togglePrefs = () => {
    const next = !prefsOpen;
    setPrefsOpen(next);
    try {
      localStorage.setItem(OPEN_KEY, next ? '1' : '0');
    } catch {
      // Storage blocked: it stays as chosen until the page closes.
    }
  };

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

  const names = t.alerts.prefsShortNames;
  const summary = [
    prefs.receipts && names.receipts,
    prefs.milestones && names.milestones,
    prefs.reminder && names.reminder(formatTime(prefs.reminderTime)),
    prefs.digest && names.digest,
    prefs.exDates && names.exDates,
    prefs.bills && names.bills,
  ]
    .filter((x): x is string => typeof x === 'string')
    .join(' · ');

  const money = (cents: number | undefined) => formatMoney(cents ?? 0);

  const body = (a: Alert) => {
    const text = 'text-[13px] font-medium leading-relaxed text-mute';
    switch (a.kind) {
      case 'receipt':
        return (
          <>
            <p className={text}>{t.alerts.splitAcross(a.lines?.length ?? 0)}</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {a.lines?.map((l) => (
                <div key={l.bankId} className="flex min-w-0 items-center justify-between gap-2 rounded-xl bg-line/5 px-3 py-2">
                  {/* A receipt stores "Deleted goal" in English for a goal that was gone. */}
                  <span className="truncate text-[12px] font-bold">{l.name === 'Deleted goal' ? t.alerts.deletedGoal : l.name}</span>
                  <span className="shrink-0 text-[12px] font-extrabold tabular-nums">{money(l.amount)}</span>
                </div>
              ))}
            </div>
          </>
        );
      case 'milestone':
        return (
          <>
            <p className={text}>
              {t.alerts.milestoneBefore}
              <span className="font-bold text-ink">{a.bankName}</span>
              {t.alerts.milestonePast}
              <span className="font-bold text-pos">{money(a.reachedAmount)}</span>
              {t.alerts.milestoneEnd}
              {a.amount !== undefined && t.alerts.milestoneLeft(money(a.amount))}
            </p>
            {/* Only a goal with a target has a bar to fill. */}
            {a.percent !== undefined && (
              <div className="mt-2 flex items-center gap-3">
                <Meter percent={a.percent} status="ok" label={`${a.percent}%`} className="flex-1" />
                <span className="text-[12px] font-extrabold tabular-nums">{a.percent}%</span>
              </div>
            )}
          </>
        );
      case 'reached':
        return (
          <>
            <p className={text}>
              <span className="font-bold text-ink">{a.bankName}</span>
              {t.alerts.reachedTarget(formatMoney(a.amount ?? 0, { decimals: 0 }))}
              {a.percent ? t.alerts.reachedStillTakes(a.percent) : ''}
              {a.overflow ? t.alerts.reachedOverflow : ''}
            </p>
            {a.percent ? (
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-[12px] font-bold text-mute">{t.alerts.stillAllocated(a.percent)}</p>
                <Button
                  full={false}
                  className="min-h-11 px-5 text-[13px]"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMarkRead([a.id]);
                    onOpenStrategy();
                  }}
                >
                  {t.alerts.reallocate}
                </Button>
              </div>
            ) : null}
          </>
        );
      case 'streak':
        return <p className={text}>{t.alerts.streakBody(a.days ?? '')}</p>;
      case 'housekeeping':
        return <p className={text}>{t.alerts.housekeepingBody(a.months)}</p>;
      case 'dividend':
        return <p className={text}>{t.alerts.dividendBody(a.units?.toLocaleString('en-US') ?? '')}</p>;
    }
  };

  const title = (a: Alert) => {
    switch (a.kind) {
      case 'receipt':
        return t.alerts.receiptTitle(money(a.amount));
      case 'milestone':
        return t.alerts.milestoneTitle(a.bankName, money(a.reachedAmount));
      case 'reached':
        return t.alerts.reachedTitle(a.bankName);
      case 'streak':
        return t.alerts.streakTitle(a.days);
      case 'housekeeping':
        return t.alerts.housekeepingTitle;
      case 'dividend':
        return t.alerts.dividendTitle(a.counter, money(a.amount));
    }
  };

  return (
    <div className="flex min-h-full flex-col px-4 pb-24 pt-3 safe-pt font-figtree text-ink">
      <div className="mb-1 flex items-center justify-between gap-3 px-1">
        <button type="button" onClick={onBack} aria-label={t.common.back} className="grid size-11 place-items-center rounded-full bg-card active:opacity-80">
          <Icon name="back" size={20} />
        </button>
        {unread.length > 0 && (
          <button
            type="button"
            onClick={() => onMarkRead(unread.map((a) => a.id))}
            className="flex min-h-11 items-center gap-1.5 rounded-full bg-card px-4 text-[13px] font-extrabold active:opacity-80"
          >
            <Icon name="check" size={16} />
            {t.alerts.markAllRead}
          </button>
        )}
      </div>
      <h1 className="px-1 text-[30px] font-extrabold tracking-tight">{t.alerts.title}</h1>
      <p className="mt-0.5 px-1 text-[13.5px] font-semibold text-mute">
        {unread.length === 0 ? t.alerts.allCaughtUp : t.alerts.newAlerts(unread.length)}
      </p>

      {/* The settings come first: with a notification a day they would otherwise sit far down the page. */}
      <section className="mt-4 rounded-3xl bg-mint px-4 py-3">
        <button type="button" onClick={togglePrefs} aria-expanded={prefsOpen} className="flex min-h-11 w-full items-center gap-3 text-left active:opacity-70">
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-extrabold">{t.alerts.deliveryPreferences}</span>
            {!prefsOpen && <span className="block truncate text-[12px] font-semibold text-mute">{summary || t.alerts.prefsNone}</span>}
          </span>
          <span className="shrink-0 text-[13px] font-extrabold">{prefsOpen ? t.alerts.prefsCollapse : t.alerts.prefsExpand}</span>
          <Icon name="chev" size={16} className={prefsOpen ? '-rotate-90' : 'rotate-90'} />
        </button>

        {prefsOpen && (
          <div className="divide-y divide-line/10">
            <Pref title={t.alerts.receiptsTitle} hint={t.alerts.receiptsHint} on={prefs.receipts} onChange={(receipts) => onSavePrefs({ receipts })} />
            <Pref title={t.alerts.milestonesTitle} hint={t.alerts.milestonesHint} on={prefs.milestones} onChange={(milestones) => onSavePrefs({ milestones })} />
            <Pref title={t.alerts.dailyReminder} hint={t.alerts.dailyReminderHint} on={prefs.reminder} onChange={(on) => void enableSystem({ reminder: on })}>
              {prefs.reminder && (
                <TimeField value={prefs.reminderTime} onChange={(reminderTime) => onSavePrefs({ reminderTime })} title={t.alerts.remindMeAt} hint={t.alerts.remindHint} />
              )}
            </Pref>
            <Pref title={t.alerts.monthlyReport} hint={t.alerts.monthlyReportHint} on={prefs.digest} onChange={(on) => void enableSystem({ digest: on })} />
            <Pref title={t.alerts.exDates} hint={t.alerts.exDatesHint} on={prefs.exDates} onChange={(on) => void enableSystem({ exDates: on })} />
            <Pref title={t.alerts.billReminders} hint={t.alerts.billRemindersHint} on={prefs.bills} onChange={(on) => void enableSystem({ bills: on })} />
          </div>
        )}
        {prefsOpen && <p className="px-1 pb-1 pt-2 text-[11.5px] font-medium leading-relaxed text-mute">{t.alerts.footer}</p>}
      </section>

      {blocked && (
        <div role="alert" className="mt-3 flex items-start gap-3 rounded-3xl bg-sun px-5 py-4">
          <Icon name="bell" size={20} className="mt-0.5" />
          <div className="min-w-0">
            <p className="text-[14px] font-extrabold">{t.alerts.blockedTitle}</p>
            <p className="mt-1 text-[12.5px] font-medium leading-relaxed">{t.alerts.blockedBody}</p>
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
        <div className="mt-3 rounded-3xl bg-sun px-5 py-4">
          <div className="flex items-start gap-3">
            <Icon name="hist" size={20} className="mt-0.5" />
            <div className="min-w-0">
              <p className="text-[14px] font-extrabold">{t.alerts.lateTitle}</p>
              <p className="mt-1 text-[12.5px] font-medium leading-relaxed">{t.alerts.lateBody}</p>
            </div>
          </div>
          <Button className="mt-3" onClick={() => void requestExactAlarms().then(setExact)}>
            {t.alerts.allowExact}
          </Button>
        </div>
      )}

      {/* Filters */}
      <div className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4">
        {FILTERS.map((f) => {
          const n = countOf(f.key);
          return (
            <Chip key={f.key} selected={filter === f.key} onClick={() => setFilter(f.key)} className="inline-flex items-center gap-2">
              {t.alerts.filters[f.key]}
              {n > 0 && <span className={`rounded-full px-1.5 text-[11px] ${filter === f.key ? 'bg-cta-fg/20' : 'bg-line/10'}`}>{n}</span>}
            </Chip>
          );
        })}
      </div>

      {/* Timeline */}
      {groups.length === 0 ? (
        <EmptyState icon="bell" title={t.alerts.emptyTitle} body={t.alerts.emptyBody} className="mt-4" />
      ) : (
        groups.map((g) => (
          <section key={g.label} className="mt-5">
            <div className="mb-2 flex items-baseline justify-between px-1">
              <h2 className="text-[15px] font-extrabold">{g.label}</h2>
              <p className="text-[12px] font-bold text-mute">{t.alerts.updates(g.items.length)}</p>
            </div>
            <div className="space-y-2.5">
              {g.items.map((a) => (
                <div
                  key={a.id}
                  onClick={() => !a.read && onMarkRead([a.id])}
                  className={`rounded-3xl bg-card p-4 ${a.read ? '' : 'outline outline-1 outline-ink/25'}`}
                >
                  <div className="flex items-start gap-3">
                    <span className="relative shrink-0">
                      <span className={`grid size-10 place-items-center rounded-xl text-ink ${TINTS[a.kind]}`}>
                        <Icon name={ICONS[a.kind]} size={20} />
                      </span>
                      {!a.read && <span className="absolute -left-1 -top-1 size-3 rounded-full bg-neg ring-2 ring-card" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-[14.5px] font-extrabold leading-snug">{title(a)}</p>
                        <p className="mt-0.5 shrink-0 text-[11.5px] font-semibold text-mute">{timeLabel(new Date(a.date), now, t)}</p>
                      </div>
                      <div className="mt-1.5">{body(a)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
};

export default Alerts;
