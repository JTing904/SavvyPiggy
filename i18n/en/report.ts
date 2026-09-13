/** The Report tab, the donut chart, and the labels services/analytics.ts builds. */

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

export const report = {
  /* ------------------------------------------------ analytics (dates, bars) */

  periods: {
    week: 'Week',
    month: 'Month',
    quarter: 'Quarter',
    year: 'Year',
    all: 'All Time',
  },
  monthsShort: MONTHS_SHORT,
  monthsLong: MONTHS_LONG,
  /** Month is 0-based: "Sep 1". */
  dayMonth: (month: number, day: number) => `${MONTHS_SHORT[month]} ${day}`,
  /** "Sep 1 – Sep 30, 2026". */
  rangeSameYear: (start: string, end: string, year: number) => `${start} – ${end}, ${year}`,
  /** "Dec 20, 2025 – Jan 2, 2026". */
  rangeCrossYear: (start: string, startYear: number, end: string, endYear: number) =>
    `${start}, ${startYear} – ${end}, ${endYear}`,
  since: (date: string, year: number) => `Since ${date}, ${year}`,
  /** Month is 0-based: "September 2026". */
  monthYear: (month: number, year: number) => `${MONTHS_LONG[month]} ${year}`,
  /** A week bar in the month view: "W1". */
  weekBucket: (n: number) => `W${n}`,
  retentionChoice: (months: number) => `${months} months`,

  /* ------------------------------------------------------------ Report tab */

  title: 'Report',
  subtitle: 'Where your deposits went, and how fast.',
  days: (n: number) => `${n} day${n === 1 ? '' : 's'}`,

  saved: 'Saved',
  nothingPrevious: 'Nothing in the previous period',
  everythingOnRecord: 'Everything on record',
  /** `signed` already carries its "+" when positive. */
  vsPrevious: (signed: string) => `${signed}% vs previous`,
  perDay: 'Per day',
  transactions: (n: number) => `${n} transaction${n === 1 ? '' : 's'}`,
  topGoal: 'Top goal',
  noDepositsYet: 'No deposits yet',
  allGoals: 'All goals',
  noTargetSet: 'No target set',
  reachedOf: (reached: number, goals: number) => `${reached} of ${goals} reached`,

  inAndOut: 'In and out',
  inAndOutHint: 'Everything that moved this period, and what was left.',
  putIn: 'Put in',
  coveredEarlier: 'Covered earlier spending',
  reachedGoals: 'Reached your goals',
  spent: 'Spent',
  outOfGoal: 'Out of a goal',
  goalsGrewBy: 'Your goals grew by',
  borrowNote:
    'Spending ahead never touches a goal. Your next deposits cover it before anything reaches them, which is why what you put in and what your goals grew by are different numbers.',

  allocation: 'Piggy Allocation',
  allocationHint: "How this period's deposits were split.",
  slicesOf: (shown: number, total: number) => `${shown} of ${total}`,
  deposited: 'Deposited',
  goalsCount: (n: number) => `${n} goal${n === 1 ? '' : 's'}`,
  noGoalsYet: 'No goals yet.',
  credited: (amount: string) => `${amount} credited`,
  nothingCredited: 'Nothing credited',
  ofTarget: (amount: string) => `of ${amount}`,

  whereItWent: 'Where it went',
  spentInPeriod: (amount: string) => `${amount} spent in this period.`,
  times: (n: number) => `${n} ${n === 1 ? 'time' : 'times'}`,

  pacing: 'Pacing & Cadence',
  pacingHint: 'How regularly money is reaching your goals.',
  streakValue: (n: number) => `${n}d`,
  streak: 'Streak',
  daysSaved: 'Days saved',
  bestDay: 'Best day',
  bestAndTotal: (best: string, total: string) => `Best ${best} · Total ${total}`,
  pickedBar: (label: string, amount: string) => `${label}: ${amount} · tap again to clear`,

  forecast: 'Forecast',
  /** The forecast sentence, in pieces around the highlighted parts. */
  pace: {
    lead: 'At your pace of ',
    rate: (amount: string) => `${amount}/day`,
    into: ' into ',
    reach: ", you'll reach it in ",
    days: (n: number) => `${n} day${n === 1 ? '' : 's'}`,
    tail: (date: string) => ` (${date}).`,
  },
  stillToGo: (amount: string, period: string) => `${amount} still to go, based on the ${period.toLowerCase()} view.`,
  noPace: 'No pace to go on yet — once deposits reach a goal with a target in this period, the forecast appears here.',

  adjustSplit: 'Adjust Distribution Split',
  statements: 'Statements',
  statementsHint: 'One a month, savings and investments together — and how long records are kept',
  periodNote: 'The period above only changes the charts on this page. Exports are always a whole month.',

  /* ----------------------------------------------------------- donut chart */

  donutOver: 'Over',
  donutAllocated: 'Allocated',
};
