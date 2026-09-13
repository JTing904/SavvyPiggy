import { common } from './common';
import { report } from './report';

/** Profile (settings), auto deposits, statements, and the schedule wording. */

const ordinal = (n: number) => {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix}`;
};

export const profile = {
  avatarLabel: 'Profile',
  /* ------------------------------------------------------------- schedules */

  frequencies: {
    daily: 'Daily',
    weekly: 'Weekly',
    monthly: 'Monthly',
    yearly: 'Yearly',
  },
  describe: {
    daily: 'Every day',
    /** Weekday is 0 for Sunday. */
    weekly: (weekday: number) => `Every ${common.weekdaysLong[weekday]}`,
    monthly: (day: number) => `The ${ordinal(day)} of each month`,
    /** Month is 1-based. */
    yearly: (month: number, day: number) => `${report.monthsLong[month - 1]} ${ordinal(day)} each year`,
  },

  /* --------------------------------------------------------------- Profile */

  defaultName: 'Savvy Saver',
  seedFailed: 'Could not add them. Try again.',
  saved: 'Saved',
  thisMonth: 'This month',
  /** `signed` already carries its "+" when positive. */
  vsMonth: (signed: string, month: string) => `${signed}% vs ${month}`,
  noTargets: 'No targets',
  reachedRatio: (reached: number, total: number) => `${reached}/${total} reached`,
  streak: 'Streak',
  streakValue: (n: number) => `${n}d`,
  startToday: 'Start today',
  inARow: 'In a row',

  memberProfile: 'Member profile',
  settings: 'Settings',
  savingSince: (date: string) => `Saving since ${date}`,

  automatedSavings: 'Automated savings',
  noAutoDeposits: 'No auto deposits yet',
  rulesRunning: (n: number) => `${n} rules running`,
  setAside: 'Set money aside on a schedule',
  nextOn: (date: string) => `Next on ${date} · posts when you open the app`,
  postsOnOpen: 'Posts when you open the app',
  overflowTitle: 'Smart goal overflow',
  overflowHint: 'A goal that hits its target stops taking a cut; its share goes to the goals still short of theirs.',
  distributionSplit: 'Distribution split',
  fullyAllocated: 'Fully allocated',
  allocatedUnassigned: (allocated: number, unassigned: number) => `${allocated}% allocated · ${unassigned}% unassigned`,

  manageAll: (n: number) => `Manage all (${n})`,
  activeDistribution: 'Active distribution',
  activeAmount: (amount: string) => `${amount} active`,
  noSplit: 'No goal is taking a share of deposits yet. Set the split on the Strategy tab.',
  archivedGoals: (n: number) => `Archived goals (${n})`,
  putAway: (amount: string) => `${amount} put away`,
  archivedOn: (date: string) => ` · archived ${date}`,
  restore: 'Restore',
  archiveNote:
    'Archived goals keep their money and their history. Restoring one brings it back at 0% — give it a share on the Strategy tab.',

  app: 'App',
  notificationCenter: 'Notification center',
  notificationHint: 'Milestones, receipts and reminders',
  investments: 'Investments',
  investmentsEmpty: 'Track Bursa counters, kept apart from savings',
  investmentsCount: (n: number) => `${n} counter${n === 1 ? '' : 's'} · separate from your savings`,
  statementsExports: 'Statements & exports',
  statementsHint: 'A statement every month, as a PDF or a spreadsheet',
  amountsInRM: 'Amounts shown in RM',
  amountsHint: 'Ringgit formatting and 12-hour times, everywhere in the app',
  synced: 'Synced with Firebase',
  syncedHint: 'Changes save instantly across your devices',
  adding: 'Adding…',
  addSamples: 'Add three sample goals',
  signOut: 'Sign Out',

  /* ---------------------------------------------------------- Auto deposits */

  deletedGoal: 'Deleted goal',
  splitByStrategy: 'Split by strategy',
  autoDeposits: 'Auto Deposits',
  recurring: 'Recurring',
  recurringIntro: 'Money is added on the days you pick. Missed days are filled in the next time you open the app.',
  noRecurring: 'No recurring deposits',
  noRecurringHint: 'Add one to save on autopilot',
  editRule: 'Edit this rule',
  deleteRule: 'Delete this rule',
  amount: 'Amount',
  repeat: 'Repeat',
  on: 'On',
  month: 'Month',
  day: 'Day',
  shortMonths: 'Shorter months fall back to their last day.',
  goesTo: 'Goes to',
  saving: 'Saving…',
  add: 'Add',
  newRecurring: 'New recurring deposit',

  /* ------------------------------------------------------------ Statements */

  statements: 'Statements',
  statementsSubtitle: 'One a month, savings and investments together',
  fileSaved: (label: string) => `${label} saved.`,
  saveFailed: 'Could not save that.',
  downloadLabel: (kind: 'pdf' | 'sheet', month: string) => `${kind.toUpperCase()} for ${month}`,
  nothingToReport: 'Nothing to report yet',
  nothingToReportHint: 'A month appears here as soon as it has a deposit or a trade in it.',
  soFar: 'so far',
  clearing: 'clearing',
  records: (n: number) => `${n} record${n === 1 ? '' : 's'}`,
  trades: (n: number) => `${n} trade${n === 1 ? '' : 's'}`,
  pdfStatement: 'PDF statement',
  excelRecords: 'Excel records',
  keepingQuick: 'Keeping the app quick',
  keepingQuickHint:
    'Every time the app opens it reads the whole ledger, and a free Firebase project allows 50,000 reads a day. Space is not the problem — a few thousand records is. Old months are cleared automatically so that day never arrives, which is why there is no “keep everything” here.',
  nextToClear: 'Next to be cleared',
  /** Follows the month's name. */
  nextToClearDetail: (records: number, date: string) =>
    ` — ${records} record${records === 1 ? '' : 's'}, on ${date}. Save it with the buttons above first if you want to keep it.`,
  /** A month already outside the window, listed so it can be saved before it goes. */
  dueBadge: 'will be cleared',
  dueDetail: (date: string) => `Outside your window since ${date} · cleared the next time the app opens`,
  /** Follows the month's name, when that month is already outside the window. */
  dueToClearDetail: (records: number) =>
    ` — ${records} record${records === 1 ? '' : 's'}, already outside the window you keep. It is cleared the next time the app opens, so save it with the buttons above now if you want to keep it.`,
  olderLoading: 'Checking for older months waiting to be cleared…',
  olderFailed:
    'Could not check for older months waiting to be cleared. Nothing is cleared until they have been listed here, so try again when you are online.',
  olderPartial:
    'There are more old months than fit on one visit. The rest are listed here after these have been cleared, and nothing is cleared before it has been listed.',
  nothingDue: 'Nothing due to be cleared',
  nothingDueHint: 'Every month on record is inside the window you keep.',
  moneyUntouched: 'Your money is never touched.',
  moneyUntouchedHint:
    ' Balances live on the goals themselves and the trade log is what your positions are worked out from — clearing history removes only the record of what happened, never a ringgit or a share.',
};
