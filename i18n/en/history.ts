/** The History tab, and the sort sheet used on the goal lists. */
export const history = {
  title: 'History',
  subtitle: 'Every deposit, and where it landed.',
  pickMonth: 'Pick a month',
  totalSaved: (month: string) => `Total saved · ${month}`,
  nothingSavedBefore: 'Nothing saved the month before.',
  comparedWithBefore: 'Compared with the month before.',
  activityFeed: 'Activity feed',
  nothingIn: (month: string) => `Nothing in ${month}`,
  pickAnotherMonth: 'Pick another month with the calendar above',

  /** Day headings: "TODAY, SEP 8", "SATURDAY, SEP 5". */
  dayToday: (date: string) => `TODAY, ${date}`,
  dayYesterday: (date: string) => `YESTERDAY, ${date}`,
  dayOther: (weekday: string, date: string) => `${weekday}, ${date}`,

  savedAmount: (amount: string) => `saved ${amount}`,
  spentAmount: (amount: string) => `spent ${amount}`,
  spentAheadAmount: (amount: string) => `spent ahead ${amount}`,
  toDebt: (amount: string) => `${amount} to debt`,

  /**
   * A trade's row. Buying shares is not spending and a sale is not saving, so
   * these read as money changing form: "Invested · MAYBANK", "100 units · from Stocks".
   */
  tradeTitle: (label: string, counter: string) => `${label} · ${counter}`,
  fromGoal: (goal: string) => `from ${goal}`,
  intoGoal: (goal: string) => `into ${goal}`,
  /** Only ever more than one goal. */
  splitAcross: (n: number) => `split across ${n} goals`,
  coveredSpentAhead: (amount: string) => `covered spent ahead ${amount}`,
  /** A day's money moved for shares, kept apart from saved and spent: "shares −RM799.24 / +RM1,070.00". */
  sharesMoved: (moves: string) => `investing ${moves}`,
  openTrade: 'Open the trade',

  noGoalTouched: 'No goal was touched — your next deposits cover this before anything reaches them.',
  deletedGoal: 'Deleted goal',

  removeTitle: 'Remove this entry?',
  remove: 'Remove',
  undoOutgoing: (amount: string) => `The ${amount} goes back into your goals.`,
  undoIncoming: (amount: string) => `The ${amount} is taken back out of your goals.`,

  whatWasThisFor: 'What was this for?',
  labelOnly: 'Changes the label only — the money stays exactly where it is.',

  jumpToMonth: 'Jump to a month',
  onlyMonthsWithRecords: 'Only months holding records are listed.',

  /** The sort sheet. */
  sortAria: (label: string) => `Sort: ${label}`,
  sortBy: 'Sort by',
  tapToFlip: 'Tap again to flip the order',
  sort: {
    created: 'Date added',
    name: 'Name',
    balance: 'Balance',
    progress: 'Progress',
    split: 'Split %',
    aToZ: 'A → Z',
    zToA: 'Z → A',
    oldestFirst: 'Oldest first',
    newestFirst: 'Newest first',
    lowToHigh: 'Low → High',
    highToLow: 'High → Low',
  },
};
