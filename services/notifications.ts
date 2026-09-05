import { Capacitor } from '@capacitor/core';
import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications';
import type { NotificationPrefs, Schedule } from '../types';
import { parseTime } from './alerts';
import { nextOccurrence } from './schedules';

/**
 * System notifications without a server: the phone itself holds the alarms.
 * Nothing here can fire while the app has never been opened on a device, and
 * nothing is delivered to any other device — which is also why the settings
 * live in Firestore but the alarms are rebuilt locally from them.
 */

export const REMINDER_ID = 1;
export const DIGEST_ID = 2;
/** One slot per auto-deposit rule, in list order. */
const DUE_BASE = 100;

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

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** What the phone should hold, given the settings and the auto-deposit rules. */
export const plannedNotifications = (
  prefs: NotificationPrefs,
  schedules: Schedule[],
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
  schedules.forEach((s, i) => {
    if (!s.enabled) return;
    const day = nextOccurrence(s, now);
    if (!day) return;
    day.setHours(MORNING, 0, 0, 0);
    out.push({
      id: DUE_BASE + i,
      title: `Auto deposit of ${money(s.amount)} due today`,
      body: 'Open SavvyPiggy to post it to your goals.',
      schedule: { at: day },
      extra: { open: 'home' satisfies OpenTarget },
    });
  });

  return out;
};

/**
 * Rebuilds every alarm from scratch. Called on any change to the settings or
 * the rules, so the phone always holds exactly what they say — never a stale
 * reminder for a rule that was deleted or a time that was changed.
 */
let lastPlan = '';

export const syncNotifications = async (prefs: NotificationPrefs, schedules: Schedule[], now = new Date()) => {
  if (!native() || (await checkPermission()) !== 'granted') return;

  const planned = plannedNotifications(prefs, schedules, now);
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
