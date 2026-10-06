/** The sheet that opens from a History row: edit, preview, delete. */
export const entry = {
  editTitle: 'Edit this entry',
  editPotTitle: 'Edit this move',

  amount: 'Amount',
  amountDone: 'Done',
  date: 'Date',
  time: 'Time',
  takenFrom: 'Taken from',
  severalGoals: 'Several goals',
  goesTo: 'Goes to',
  asItWas: 'As it was',
  byYourSplit: 'By your split',
  category: 'Category',
  note: 'Note',
  notePlaceholder: 'Optional',

  /** The live preview. */
  previewTitle: 'What changes',
  debtOwed: 'Spent ahead still owed',
  beforeAfter: (before: string, after: string) => `${before} to ${after}`,
  investingCash: 'Investing cash',
  noMoneyMoves: 'Only the details change. No money moves.',
  nothingChanged: 'Change something to save it.',
  /** Stated above the buttons, not as a problem: the person can still try. */
  offline: 'Editing needs a connection, and you seem to be offline.',
  saveFailed: 'Could not save. Check your connection and try again.',
  save: 'Save',
  saved: 'Entry updated',

  delete: 'Delete',
  /** What deleting a move to or from investing does, one line per place the money goes. */
  potGoesBack: (amount: string, goal: string) => `${amount} goes back to ${goal}.`,
  potTakenFrom: (amount: string, goal: string) => `${amount} comes out of ${goal}.`,
  potLeaves: (amount: string) => `${amount} leaves investing cash.`,
  potReturns: (amount: string) => `${amount} goes back to investing cash.`,

  /** The goal a move named has been deleted: the money has to be sent somewhere. */
  chooseBackTitle: 'Which goal gets the money back?',
  chooseBackBody: (amount: string) => `The goal this ${amount} came from has been deleted. Pick where it goes back.`,
  chooseTakeTitle: 'Which goal gives the money back?',
  chooseTakeBody: (amount: string) => `Part of this ${amount} went into a goal that has been deleted. Pick the goal it comes out of.`,
  splitOption: 'Split by your plan',
  splitOptionSub: 'Shared out like a new deposit',
  takeSplitSub: 'Taken out in proportion to what each goal holds',
  chooseFirst: 'Choose a goal to continue.',

  /** Rows that cannot be changed. */
  transferTitle: 'Between goals',
  transferBody: (goal: string) =>
    `This money moved in when the goal “${goal}” was deleted. It records a move between goals, so it can’t be edited or deleted.`,
  transferBodyNoName: 'This money moved in when a goal was deleted. It records a move between goals, so it can’t be edited or deleted.',
  tradeBody: 'This entry belongs to a trade. Open the trade to change or delete it.',
};
