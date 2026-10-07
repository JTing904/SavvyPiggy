/** Saving the whole account as one file. */
export const backup = {
  rowTitle: 'Export everything',
  rowSub: 'Goals, wallet, debts, bills, investing — one file',
  title: 'Export everything',
  intro: 'Save all of what you have in SavvyPiggy as one file, to keep a copy of your own.',
  fileWord: 'data',
  contains:
    'Included: goals and balances, every record, wallet, debts and loans, bills, auto-deposits, investing and dividends. Not included: receipt photos (too big) and your password.',
  size: (kb: number, docs: number) => `About ${kb} KB · ${docs} items`,
  preparing: 'Reading your data…',
  save: 'Save or share the file',
  saving: 'Saving…',
  saved: 'File saved',
  failed: 'Could not read your data. Check your connection and try again.',
};
