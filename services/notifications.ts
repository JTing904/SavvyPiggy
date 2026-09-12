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

/**
 * Everything posts to one named channel.
 *
 * The plugin creates a generic "Default" channel if none is given, which is
 * both unfindable in Android's settings and easy to mute by accident — and a
 * muted channel is invisible to `checkPermissions`, which keeps reporting
 * `granted` while nothing is ever shown. A channel of our own can be pointed
 * at, and HIGH importance is what makes a reminder appear on screen instead of
 * landing silently in the shade.
 */
export const CHANNEL_ID = 'savvypiggy-reminders';

let channelReady = false;
const ensureChannel = async () => {
  if (!native() || channelReady) return;
  try {
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: 'Reminders',
      description: 'Savings reminders, auto-deposit nudges and ex-dividend dates.',
      importance: 4,
      visibility: 1,
      vibration: true,
    });
    channelReady = true;
  } catch {
    // Channels only exist on Android 8+; elsewhere the notification posts fine
    // without one.
    channelReady = true;
  }
};

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

export const exactAlarmAllowed = exactAllowed;

/**
 * Opens Android's "Alarms & reminders" screen.
 *
 * From API 33 `SCHEDULE_EXACT_ALARM` is not granted on install, and nothing in
 * the app ever asked — so every alarm fell back to an inexact one, which a
 * dozing phone can hold for the best part of an hour, or drop entirely under
 * an aggressive battery saver. The app can only open the screen; the switch is
 * the user's to flip.
 */
export const requestExactAlarms = async () => {
  if (!native()) return false;
  try {
    await LocalNotifications.changeExactNotificationSetting();
    return (await exactAllowed());
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
/**
 * The last plan actually written to the phone.
 *
 * This used to be a module variable, which reset to '' on every cold start —
 * so the guard below could never fire on the first sync after launch, and the
 * app cancelled and re-armed every alarm each time it opened. Re-arming a
 * daily reminder pushes its next trigger to tomorrow, so anyone who opened the
 * app in the evening kept moving their own 8pm reminder out of reach, night
 * after night. Kept on the device so a restart remembers.
 */
const PLAN_KEY = 'savvypiggy.notifications.plan';

const readPlan = (): Record<string, string> => {
  try {
    const raw = localStorage.getItem(PLAN_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
};

const writePlan = (plan: Record<string, string>) => {
  try {
    localStorage.setItem(PLAN_KEY, JSON.stringify(plan));
  } catch {
    // Storage can be unavailable; the worst case is a rebuild next launch.
  }
};

export const syncNotifications = async (
  prefs: NotificationPrefs,
  schedules: Schedule[],
  dividends: Dividend[] = [],
  trades: Trade[] = [],
  now = new Date()
) => {
  if (!native() || (await checkPermission()) !== 'granted') return;
  await ensureChannel();

  // An inexact alarm can be held back for the best part of an hour while the
  // phone dozes, which is no use for "remind me at 8pm" — so take a real one
  // whenever the phone already allows it, and fall back quietly when it does not.
  const isExactNotification = await exactAllowed();
  const planned = plannedNotifications(prefs, schedules, dividends, trades, now).map((n) => ({
    ...n,
    channelId: CHANNEL_ID,
    isExactNotification,
    schedule: { ...n.schedule, allowWhileIdle: true },
  }));

  const pending = await LocalNotifications.getPending();
  const held = new Set(pending.notifications.map((n) => n.id));
  const before = readPlan();
  const after: Record<string, string> = {};
  for (const n of planned) after[n.id] = JSON.stringify(n);

  // Re-arming an alarm is not free: scheduling an id that already exists
  // replaces it, and replacing a daily reminder pushes its next trigger to
  // tomorrow. So each alarm is judged on its own — one that the phone is
  // already holding, unchanged, is left exactly where it is. Rebuilding the
  // lot on every app open is what kept moving the evening reminder out of
  // reach for anyone who opened the app in the evening.
  const changed = planned.filter((n) => !held.has(n.id) || before[n.id] !== after[n.id]);

  // Anything the phone holds that is no longer planned goes, except the test
  // notification, which is nobody's business but the person who asked for it.
  const wanted = new Set(planned.map((n) => n.id));
  const stale = pending.notifications.filter((n) => !wanted.has(n.id));

  if (stale.length === 0 && changed.length === 0) return;
  if (stale.length > 0) {
    await LocalNotifications.cancel({ notifications: stale.map((n) => ({ id: n.id })) });
  }
  if (changed.length > 0) await LocalNotifications.schedule({ notifications: changed });
  writePlan(after);
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
