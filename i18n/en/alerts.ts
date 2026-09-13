/** The alerts screen, and the system notifications the phone holds. */
export const alerts = {
  title: 'Alerts',
  allCaughtUp: 'You are all caught up.',
  newAlerts: (n: number) => `${n} new alert${n === 1 ? '' : 's'}`,
  markAllRead: 'Mark all read',

  filters: {
    all: 'All',
    deposits: 'Deposits',
    milestones: 'Milestones',
    streaks: 'Streaks',
  },

  justNow: 'Just now',
  minutesAgo: (n: number) => `${n}m ago`,
  updates: (n: number) => `${n} update${n === 1 ? '' : 's'}`,

  /** Stored on a receipt line whose goal was gone; read back in the current language. */
  deletedGoal: 'Deleted goal',

  // Card titles
  receiptTitle: (amount: string) => `Auto deposit posted (${amount})`,
  milestoneTitle: (name: string | undefined, amount: string) => `${name} passed ${amount}`,
  reachedTitle: (name: string | undefined) => `Goal reached: ${name}`,
  streakTitle: (days: number | undefined) => `${days}-day savings streak`,
  housekeepingTitle: 'Old records are ready to be cleared',
  dividendTitle: (counter: string | undefined, amount: string) => `${counter} paid ${amount}`,

  // Card bodies. A name or amount is drawn between the pieces.
  splitAcross: (n: number) => `Split across ${n} goal${n === 1 ? '' : 's'}:`,
  milestoneBefore: 'A deposit carried ',
  milestonePast: ' past ',
  milestoneEnd: '.',
  milestoneLeft: (amount: string) => ` ${amount} left to reach its target.`,
  reachedTarget: (amount: string) => ` reached its ${amount} target.`,
  reachedStillTakes: (percent: number) => ` It still takes ${percent}% of every deposit.`,
  reachedOverflow: ' Its share now goes to your other goals automatically.',
  stillAllocated: (percent: number) => `Still allocated: ${percent}%`,
  reallocate: 'Reallocate Split',
  streakBody: (days: number | string) =>
    `You have put money into your goals every day for ${days} days straight. Keep it going.`,
  housekeepingBody: (months: number | undefined) =>
    `The app reads your whole history every time it opens, so records older than ${months ?? ''} months are cleared to keep that quick. Nothing has been removed yet. Open Report → Statements to save those months first, or to keep them for longer. Your balances are never affected.`,
  dividendBody: (units: string) =>
    `Worked out on the ${units} units you held on the ex-date and split across your goals like any other deposit. Companies deduct tax and fees, so check the amount that actually landed and correct it in Trades if it differs.`,

  // Reminder card and warnings
  dailySavingsReminder: 'Daily savings reminder',
  everyEveningAt: 'Every evening at ',
  reminderOff: 'Off — a nudge to keep your streak alive',
  blockedTitle: 'Android is blocking these',
  blockedBody:
    'Nothing can be scheduled until you allow them. Open Settings → Apps → SavvyPiggy → Notifications and turn them on, then come back — this screen rechecks itself.',
  lateTitle: 'Reminders may arrive late',
  lateBody:
    'Android is allowed to delay these by up to an hour, or skip them while the phone is asleep. Allowing exact alarms makes 8:00 PM mean 8:00 PM.',
  allowExact: 'Allow exact alarms',
  emptyTitle: 'Nothing here yet',
  emptyBody: 'Milestones, auto-deposit receipts and streaks show up here as they happen.',

  // Preferences
  deliveryPreferences: 'Delivery preferences',
  receiptsTitle: 'Auto-deposit receipts',
  receiptsHint: 'A card here each time a rule posts a deposit.',
  milestonesTitle: 'Milestones & streaks',
  milestonesHint:
    'Each time a goal passes a round amount or reaches its target, and on 7, 30, 100 and 365-day streaks.',
  dailyReminder: 'Daily reminder',
  dailyReminderHint: 'A system notification every evening.',
  remindMeAt: 'Remind me at',
  remindHint: 'Pick an hour you are usually free to put something aside.',
  monthlyReport: 'Monthly report',
  monthlyReportHint: 'On the 1st at 9:00 AM, opening last month’s Report.',
  exDates: 'Ex-dividend days',
  exDatesHint:
    'Two days before a counter you hold goes ex-dividend — the day that decides whether the payment is yours.',
  footer:
    'Reminders are set on this phone and fire even when the app is closed. Auto deposits themselves are only posted when you open the app — there is no server behind SavvyPiggy — so a rule that is due gets a 9:00 AM nudge to open it.',

  /** System notifications, written when the plan is built. */
  notify: {
    channelName: 'Reminders',
    channelDescription: 'Savings reminders, auto-deposit nudges and ex-dividend dates.',
    reminderTitle: 'Time to save',
    reminderBody: 'Put a little aside today and keep your streak alive.',
    digestTitle: 'Your monthly report is ready',
    digestBody: 'See where last month’s deposits went and how fast you saved.',
    dueTitle: (amount: string) => `Auto deposit of ${amount} due today`,
    dueBody: 'Open SavvyPiggy to post it to your goals.',
    exTitle: (symbol: string) => `${symbol} goes ex-dividend in 2 days`,
    exBodyHeld: (rate: string, units: string) => `${rate} a unit. You hold ${units}.`,
    exBodyNone: (rate: string) => `${rate} a unit. Buy before the ex-date to qualify.`,
  },
};
