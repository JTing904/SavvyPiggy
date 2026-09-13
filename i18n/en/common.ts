/**
 * Words used on more than one screen. Anything that only one screen says
 * belongs in that screen's own file.
 */
export const common = {
  cancel: 'Cancel',
  confirm: 'Confirm',
  save: 'Save',
  saveChanges: 'Save changes',
  delete: 'Delete',
  close: 'Close',
  back: 'Back',
  done: 'Done',
  edit: 'Edit',
  next: 'Next',
  today: 'Today',
  yesterday: 'Yesterday',
  viewAll: 'View All',
  somethingWentWrong: 'Something went wrong.',

  /** What each kind of ledger entry is called wherever it is listed. */
  activity: {
    autoSave: 'Scheduled deposit',
    manual: 'Deposit',
    withdraw: 'Spent',
    borrow: 'Spent ahead',
    invest: 'Invested',
    divest: 'Sale proceeds',
  },

  /** Spending categories, by their stored key. */
  categories: {
    food: 'Food & drink',
    groceries: 'Groceries',
    transport: 'Transport',
    bills: 'Bills',
    shopping: 'Shopping',
    health: 'Health',
    family: 'Family',
    fun: 'Fun',
    travel: 'Travel',
    learning: 'Learning',
    gifts: 'Gifts',
    other: 'Other',
  } as Record<string, string>,

  dividendNote: (name: string) => `${name} dividend`,
  units: (n: string) => `${n} units`,
  goal: 'goal',
  goals: 'Goals',
  autoSplit: 'Auto split',
  notFromGoal: 'Not from a goal',
  spentAhead: 'Spent ahead',

  /** Sunday first, matching the calendar the phone draws. */
  weekdaysNarrow: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
  weekdaysShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  weekdaysLong: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};
