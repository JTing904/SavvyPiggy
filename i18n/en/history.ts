/** The History tab, and the sort sheet used on the goal lists. */
export const history = {
  title: 'History',

  /** Day headings: "Today · 15 Sep", "Yesterday · 14 Sep", "Sun 13 Sep". */
  dayToday: (date: string) => `Today · ${date}`,
  dayYesterday: (date: string) => `Yesterday · ${date}`,
  dayOther: (weekday: string, date: string) => `${weekday} ${date}`,

  toDebt: (amount: string) => `${amount} to debt`,

  /** Money moving to or from investing is not spending, and not saving. */
  notSpending: 'not spending',
  toWalletPart: (amount: string) => `Wallet ${amount}`,
  fromWallet: 'From wallet',
  walletToGoals: (goal: string) => `Wallet → ${goal}`,
  goalToWallet: (goal: string) => `${goal} → wallet`,
  justMoved: 'not saving or spending',
  notSaving: 'not saving',

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
  openTrade: 'Open the trade',

  deletedGoal: 'Deleted goal',

  /** What deleting an entry does, said before it is done. */
  undoOutgoing: (amount: string) => `If you delete it, the ${amount} goes back into your goals.`,
  undoIncoming: (amount: string) => `If you delete it, the ${amount} is taken back out of your goals.`,
  undoBorrow: 'If you delete it, this spend-ahead is cancelled. Any part your deposits already covered goes back into your goals.',
  remove: 'Remove',

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
