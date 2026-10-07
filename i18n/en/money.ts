/** The deposit / spend sheet opened from Home and the nav's round button. */
export const money = {
  title: 'Record money',
  tabs: 'What happened',
  deposit: 'Income',
  spend: 'Spend',

  /** The amount shortcuts. */
  quickAmounts: 'Quick amounts',

  goesTo: 'Goes to',
  keepInWallet: 'Keep in wallet',
  keepInWalletSmall: 'Move it later',
  allToGoals: 'Split into goals',
  allToGoalsSmall: 'By their shares',
  wallet: 'Wallet',
  coversEarlier: (amount: string) => `${amount} covers earlier spending first`,
  clearsOverdraft: (amount: string) => `${amount} clears your overdraft first`,
  landsHeading: 'Where it lands',

  comesFrom: 'Spend from',
  pickSource: 'Pick where this comes out of.',
  overdrawnFrom: (held: string, over: string) =>
    `Your wallet holds ${held}. This puts it ${over} overdrawn. Your next income clears that first.`,
  overdrawnMore: (over: string) => `This takes your wallet to ${over} overdrawn. Your next income clears that first.`,
  overBalance: (amount: string) => `Only ${amount} in this goal. Spending more takes it below zero.`,

  whatFor: 'What for',
  note: 'Note',
  notePlaceholder: 'Optional',
  spendPlaceholder: 'e.g. Groceries',

  date: 'Date',
  dateToday: 'Today',
  backDated: 'Not today',
  pickDayTitle: 'Which day?',
  pickDayHint: 'Record something you forgot. Only days inside your history can be chosen.',

  confirmDeposit: (amount: string) => `Add ${amount}`,
  confirmSpend: (amount: string) => `Record spending ${amount}`,
  recordSpending: 'Record spending',
};
