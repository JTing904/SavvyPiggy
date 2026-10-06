/** The deposit / spend sheet opened from Home and the nav's round button. */
export const money = {
  title: 'Record money',
  tabs: 'What happened',
  deposit: 'Deposit',
  spend: 'Spend',

  /** The amount shortcuts. */
  quickAmounts: 'Quick amounts',

  goesTo: 'Goes to',
  splitByPercent: 'Split by %',
  splitGoals: (n: number) => `${n} goal${n === 1 ? '' : 's'}`,
  noSplit: 'No goal has a split yet. Pick a goal above, or set percentages on Strategy.',
  coversEarlier: (amount: string) => `${amount} covers earlier spending first`,
  partlyAllocated: (percent: number) => `Only ${percent}% is allocated, so the rest stays unassigned.`,
  landsHeading: 'Where it lands',

  comesFrom: 'Spend from',
  spendAhead: 'Spend ahead',
  spendAheadSmall: 'no goal',
  pickSource: 'Pick a goal to spend from, or spend ahead.',
  spendAheadHint: 'Money you had not set aside yet. No goal is touched; your next deposits cover it first.',
  overBalance: (amount: string) => `Only ${amount} in this goal. Spending more takes it below zero.`,

  whatFor: 'What for',
  note: 'Note',
  notePlaceholder: 'Optional',
  spendAheadPlaceholder: 'e.g. Lunch',
  spendPlaceholder: 'e.g. Groceries',

  date: 'Date',
  dateToday: 'Today',
  backDated: 'Not today',
  pickDayTitle: 'Which day?',
  pickDayHint: 'Record something you forgot. Only days inside your history can be chosen.',

  confirmDeposit: (amount: string) => `Deposit ${amount}`,
  confirmSpend: (amount: string) => `Record spending ${amount}`,
  recordSpending: 'Record spending',
};
