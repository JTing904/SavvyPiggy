/** The monthly review, the savings rate and the budgets; the wording the new Report page adds. */
export const review = {
  /* ------------------------------------------------------------ report page */

  period: 'Period',
  reportHint: 'Where your money went',
  reviewCard: (month: string) => `${month} review`,
  reviewSoFar: (month: string) => `${month} so far`,
  rate: 'Savings rate',
  view: 'View',
  savedIncome: (saved: string, income: string) => `Saved ${saved} · Income ${income}`,
  noIncomeYet: 'No income recorded',
  /** A rate against the month before: whole points. */
  vsMonth: (points: number, month: string) =>
    points === 0 ? `Same as ${month}` : points > 0 ? `↑ ${points} pts above ${month}` : `↓ ${-points} pts below ${month}`,

  intoGoals: 'Into goals',
  intoGoalsTile: 'Put in your goals',
  walletNow: 'Wallet now',
  income: 'Income',
  fromWallet: 'From the wallet',
  fromGoals: 'From the goals',
  walletMoved: 'Wallet change',

  /* ---------------------------------------------------- where it went + budgets */

  budgetLeft: (amount: string) => `${amount} left`,
  budgetOver: (amount: string) => `${amount} over`,
  budgetOf: (amount: string) => `Budget ${amount}`,
  noBudget: 'No budget',
  allBudgets: 'All budgets',
  setBudgets: 'Set a budget',
  usedPct: (n: number) => `${n}%`,
  overTag: 'Over',
  shareTimes: (share: number, times: string) => `${share}% · ${times}`,

  /* ---------------------------------------------------------- month review */

  title: (month: string) => `${month} review`,
  monthSoFar: 'The month so far',
  heroLead: 'You put',
  heroTail: 'of your income into your goals',
  heroDownLead: 'You took out more than you put in',
  heroDownTail: 'of your income',
  noIncomeNote: 'No income was recorded this month, so there is no savings rate to work out.',
  howItWorks: 'How is it worked out?',
  lastMonth: (value: string) => `Last month ${value}`,
  moneyIn: 'Income',
  moneyOut: 'Spent',
  putAside: 'Put in goals',
  trendTitle: 'Savings rate, last 6 months',
  trendNote: 'A month with nothing recorded is left blank.',
  budgetTitle: 'Budget',
  billsTitle: 'Bills',
  billsTotal: 'Your bills this month',
  billsCount: (n: number) => `${n} recorded`,
  biggestTitle: 'Biggest spends',
  nothingInMonth: 'Nothing was recorded in this month.',
  noSpends: 'No spending in this month.',
  auto: 'Auto',

  explainTitle: 'How the savings rate works',
  explainIncome: 'Income',
  explainPutIn: 'Into your goals (straight in, or moved from the wallet)',
  explainTakenOut: 'Out of your goals (spent, or moved back to the wallet)',
  explainSaved: 'Saved',
  explainRate: (saved: string, income: string) => `Savings rate = ${saved} ÷ ${income}`,
  explainWallet: 'Money left in the wallet does not count as saved; moving it into a goal does. Taking money out of a goal to spend it comes off what you saved.',
  explainNoIncome: 'A month with no income shows a dash, not 0%.',
  explainRepaid: 'Paying back money you spent ahead is not income and is not saved.',
  explainInvest: 'Moving money to or from investing changes nothing here.',
  close: 'Got it',

  /* --------------------------------------------------------------- budgets */

  budgetsPageTitle: 'Budgets',
  budgetsIntro: 'Set what you want to spend in a month, in total or on the things you spend on most. You only hear about it when you are close.',
  monthBudget: (month: string) => `${month} budget`,
  totalBudget: 'Total budget',
  totalNotSet: 'No total budget',
  totalNotSetHint: 'Set one limit for the whole month.',
  setIt: 'Set',
  changeIt: 'Change',
  usedOf: (spent: string, limit: string) => `${spent} of ${limit}`,
  spentWithoutLimit: (amount: string) => `${amount} spent`,
  categoriesTitle: 'By what it was for',
  noCategoryYet: 'Nothing spent yet this month.',
  addCategoryBudget: 'Add a budget for',
  budgetEmpty: 'No budgets yet.',

  sheetTitle: 'Set a budget',
  sheetFor: 'For',
  sheetTotal: 'Total',
  sheetAmount: 'Limit for each month',
  sheetFrom: 'From which month',
  fromThis: (month: string) => `${month} onwards`,
  fromNext: (month: string) => `${month} onwards`,
  sheetNote: 'Earlier months keep the budget they had. Every month from then on follows this one until you change it.',
  sheetSave: 'Save',
  sheetRemove: 'Remove this budget',
  sheetRemoveNote: 'Removing it only takes effect from the month above.',
  saved: 'Budget saved',
  removed: 'Budget removed',

  /* ------------------------------------------------------------------ Home */

  homeLine: (parts: string) => `Budget: ${parts}`,
  nearPart: (name: string) => `${name} nearly used`,
  overPart: (name: string) => `${name} over`,
  morePart: (n: number) => `${n} more`,
  totalName: 'Total',

  /* ---------------------------------------------------------------- export */

  sheetName: 'MONTHLY REVIEW',
  colMonth: 'Month',
  colIncome: 'Income',
  colSpent: 'Spent',
  colPutIn: 'Put in goals',
  colTakenOut: 'Taken out of goals',
  colSaved: 'Saved',
  colRate: 'Savings rate (%)',
  colWallet: 'Wallet change',
  colBills: 'Bills',
};
