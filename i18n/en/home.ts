/** Home (Dashboard) and the holdings card stack on it. */
export const home = {
  greeting: {
    morning: 'Good Morning',
    afternoon: 'Good Afternoon',
    evening: 'Good Evening',
  },
  /** Shown in place of a name when the account has neither a name nor an email. */
  defaultName: 'Savvy Saver',
  alerts: 'Alerts',

  /** How stale the worst price on screen is: "2 min ago". */
  ago: {
    justNow: 'just now',
    minutes: (n: number) => `${n} min ago`,
    hours: (n: number) => `${n} h ago`,
    days: (n: number) => `${n} d ago`,
  },

  /** Ledger labels that differ from the shared ones in capitalisation. */
  scheduledDeposit: 'Scheduled Deposit',

  totalSavings: 'Total Savings',
  savedToday: 'Saved today',
  deposit: 'Deposit',
  investments: 'Investments',
  trackHoldings: 'Track your Bursa holdings',
  trackHoldingsHint: 'Priced for you, kept apart from your savings.',
  getStarted: 'Get started',
  today: 'today',
  sharesAndPot: (shares: string, pot: string) => `Shares ${shares} · Pot ${pot}`,
  counters: (n: number) => `${n} counter${n === 1 ? '' : 's'}`,
  view: 'View',

  debtHint: 'Deposits clear this before anything reaches your goals.',
  spentAmountAhead: (amount: string) => `spent ${amount} ahead`,
  netAfterDebt: 'Net after debt',

  yourPiggyBanks: 'Your Piggy Banks',
  noPiggyBanks: 'No piggy banks created yet.',
  saved: 'saved',
  overspent: 'overspent',
  /** "RM100.00 saved" — Chinese puts the word first. */
  amountState: (amount: string, state: string) => `${amount} ${state}`,

  recentActivity: 'Recent Activity',
  noRecentActivity: 'No recent activity.',
  /** A row money moved on for a trade: "Invested · MAYBANK". */
  tradeRow: (label: string, counter: string) => `${label} · ${counter}`,

  noCounters: 'No counters yet',
  noCountersHint: 'Record a buy with the button below and it will be priced and tracked here.',
  yourCounters: 'Your counters',
  noPrices: 'No prices yet — they arrive when you are online.',
  priced: (ago: string) => `Priced ${ago}`,
  heldAtCost: (n: number) => `${n} held at cost`,
  allTrades: (n: number) => `All trades (${n})`,

  sheet: {
    spend: 'Spend',
    goesTo: 'Goes to',
    comesFrom: 'Comes from',
    borrowHint: 'Money you had not set aside yet. No goal is touched — your next deposits cover it first.',
    inThisGoal: (amount: string) => `${amount} in this goal. Spending more takes it negative.`,
    whatFor: 'What for',
    borrowPlaceholder: 'e.g. Lunch',
    spendPlaceholder: 'e.g. Groceries',
    coversEarlier: (amount: string) => `${amount} covers earlier spending first`,
    partlyAllocated: (percent: number) => `Only ${percent}% is allocated, so the rest stays unassigned.`,
    noSplit: 'No goal has a split yet — pick one above, or set percentages on Strategy.',
    confirmDeposit: 'Confirm Deposit',
    recordSpending: 'Record Spending',
    withdraw: 'Withdraw',
  },

  /** The expanded holding card. */
  stack: {
    marketValue: 'Market value',
    today: (amount: string) => `${amount} today`,
    units: 'UNITS',
    avgCost: 'AVG COST',
    invested: 'INVESTED',
    gain: 'GAIN',
    noPrice: 'No price for this counter right now — it is being held at what you paid.',
    buyMore: 'Buy more',
    sell: 'Sell',
  },
};
