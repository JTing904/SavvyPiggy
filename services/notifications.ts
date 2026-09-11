import { Capacitor } from '@capacitor/core';
import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications';
import type { Dividend, NotificationPrefs, Schedule, Trade } from '../types';
import { parseTime } from './alerts';
import { nextOccurrence } from './schedules';
import { unitsOnExDate } from './holdings';
import { formatMoney } from '../services/money';

/**
 * System notifications without a server: the phone itself holds the alarms.
 * Nothing here can fire while the app has never been opened on a device, and
 * nothing is delivered to any other device — which is also why the settings
 * live in Firestore but the alarms are rebuilt locally from them.
 */

export const REMINDER_ID = 1;
export const DIGEST_ID = 2;
/**
 * Alarm ids come from the thing they are about, not its place in a list.
 * They used to be `DUE_BASE + index`: deleting one rule silently re-pointed
 * a live alarm at a different rule, and the signature check below could call
 * the plan unchanged while the mapping had shifted underneath it.
 */
const DUE_BASE = 100;
const EX_BASE = 300;

/** A small stable number from a string, so an id survives reordering. */
const slot = (key: string, span: number) => {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return Math.abs(hash) % span;
};

/** Reminders about a due rule and the monthly digest fire at this hour. */
const MORNING = 9;

export type Permission = 'granted' | 'denied' | 'prompt' | 'unsupported';

/** Which screen a tapped notification should land on. */
export type OpenTarget = 'home' | 'report';

const native = () => Capacitor.isNativePlatform();

export const checkPermission = async (): Promise<Permission> => {
  if (!native()) return 'unsupported';
  const { display } = await LocalNotifications.checkPermissions();
  return display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'prompt';
};

export const requestPermission = async (): Promise<Permission> => {
  if (!native()) return 'unsupported';
  const { display } = await LocalNotifications.requestPermissions();
  return display === 'granted' ? 'granted' : 'denied';
};

/** Phones batch inexact alarms, so use a real one whenever it is allowed. */
const exactAllowed = async () => {
  try {
    return (await LocalNotifications.checkExactNotificationSetting()).exact_alarm === 'granted';
  } catch {
    return false;
  }
};

/** What the phone should hold, given the settings and the auto-deposit rules. */
export const plannedNotifications = (
  prefs: NotificationPrefs,
  schedules: Schedule[],
  dividends: Dividend[] = [],
  trades: Trade[] = [],
  now = new Date()
): LocalNotificationSchema[] => {
  const out: LocalNotificationSchema[] = [];

  if (prefs.reminder) {
    const { hour, minute } = parseTime(prefs.reminderTime);
    out.push({
      id: REMINDER_ID,
      title: 'Time to save',
      body: 'Put a little aside today and keep your streak alive.',
      schedule: { on: { hour, minute } },
      extra: { open: 'home' satisfies OpenTarget },
    });
  }

  if (prefs.digest) {
    out.push({
      id: DIGEST_ID,
      title: 'Your monthly report is ready',
      body: 'See where last month’s deposits went and how fast you saved.',
      schedule: { on: { day: 1, hour: MORNING, minute: 0 } },
      extra: { open: 'report' satisfies OpenTarget },
    });
  }

  // Rules only post when the app is open, so the useful nudge is "open me".
  schedules.forEach((s) => {
    if (!s.enabled) return;
    const day = nextOccurrence(s, now);
    if (!day) return;
    day.setHours(MORNING, 0, 0, 0);
    out.push({
      id: DUE_BASE + slot(s.id, 100),
      title: `Auto deposit of ${formatMoney(s.amount)} due today`,
      body: 'Open SavvyPiggy to post it to your goals.',
      schedule: { at: day },
      extra: { open: 'home' satisfies OpenTarget },
    });
  });

  /**
   * The ex-date is the one day that decides a dividend: hold the shares the
   * day before and it is yours, buy on the day itself and it belongs to the
   * seller. Two days is enough notice to act on and near enough to still be
   * about this dividend.
   */
  if (prefs.exDates) {
    for (const d of dividends) {
      const warn = new Date(d.exDate);
      warn.setDate(warn.getDate() - 2);
      warn.setHours(MORNING, 0, 0, 0);
      if (warn.getTime() <= now.getTime()) continue;

      const units = unitsOnExDate(trades.filter((t) => t.symbol === d.symbol), d.exDate);
      out.push({
        id: EX_BASE + slot(`${d.symbol}_${d.exDate}`, 100),
        title: `${d.symbol} goes ex-dividend in 2 days`,
        body:
          units > 0
            ? `RM${(d.perUnitPoints / 10_000).toFixed(4)} a unit. You hold ${units.toLocaleString('en-US')}.`
            : `RM${(d.perUnitPoints / 10_000).toFixed(4)} a unit. Buy before the ex-date to qualify.`,
        schedule: { at: warn },
        extra: { open: 'home' satisfies OpenTarget },
      });
    }
  }

  return out;
};

/**
 * Rebuilds every alarm from scratch. Called on any change to the settings or
 * the rules, so the phone always holds exactly what they say — never a stale
 * reminder for a rule that was deleted or a time that was changed.
 */
let lastPlan = '';

export const syncNotifications = async (
  prefs: NotificationPrefs,
  schedules: Schedule[],
  dividends: Dividend[] = [],
  trades: Trade[] = [],
  now = new Date()
) => {
  if (!native() || (await checkPermission()) !== 'granted') return;

  const planned = plannedNotifications(prefs, schedules, dividends, trades, now);
  // Rebuilding on every app open would wipe an alarm that is due but has not
  // been delivered yet — this phone can run minutes late — so only touch the
  // alarms when what they should be has actually changed.
  const signature = JSON.stringify(planned);
  const pending = await LocalNotifications.getPending();
  const held = new Set(pending.notifications.map((n) => n.id));
  // ...but do rebuild if the phone has lost one, which happens when the app is
  // reinstalled or the system clears its alarms.
  if (signature === lastPlan && planned.every((n) => held.has(n.id))) return;

  if (pending.notifications.length > 0) {
    await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
  }

  // An inexact alarm can be held back for the best part of an hour while the
  // phone dozes, which is no use for "remind me at 8pm" — so take a real one
  // whenever the phone already allows it, and fall back quietly when it does not.
  const isExactNotification = await exactAllowed();
  const notifications = planned.map((n) => ({
    ...n,
    isExactNotification,
    schedule: { ...n.schedule, allowWhileIdle: true },
  }));
  if (notifications.length > 0) await LocalNotifications.schedule({ notifications });
  lastPlan = signature;
};

/** Fires when the user taps a notification; returns a way to stop listening. */
export const onNotificationOpen = (handler: (target: OpenTarget) => void) => {
  if (!native()) return () => {};
  const handle = LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
    const target = action.notification.extra?.open;
    handler(target === 'report' ? 'report' : 'home');
  });
  return () => void handle.then((h) => h.remove());
};
