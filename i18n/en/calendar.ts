/** History's calendar: the week strip, the month grid, the month picker, and what an unread month says. */
export const calendar = {
  previousWeek: 'Previous week',
  nextWeek: 'Next week',
  previousMonth: 'Previous month',
  nextMonth: 'Next month',
  showMonth: 'Show the whole month',
  showWeek: 'Show only this week',
  pickMonth: 'Pick a month',

  /** A day's cell, spoken: the dots are backed by words. */
  dayNone: (date: string) => `${date}, no entries`,
  dayEntries: (date: string, count: number, kinds: string) => `${date}, ${count === 1 ? '1 entry' : `${count} entries`}: ${kinds}`,
  kindIn: 'in',
  kindOut: 'out',
  kindMoved: 'moved to investing',
  kindJoin: ', ',

  /** The month's line under the grid. Moving to investing is never part of "out". */
  summaryIn: (amount: string) => `In ${amount}`,
  summaryOut: (amount: string) => `Out ${amount}`,
  summaryMoved: (amount: string) => `Moved ${amount}`,
  summaryBack: (amount: string) => `Back ${amount}`,

  /** One day picked. */
  clearDay: (date: string) => `Show everything again (clear ${date})`,
  previousDay: 'Previous day',
  nextDay: 'Next day',
  entryCount: (n: number) => (n === 1 ? '1 entry' : `${n} entries`),

  /** A day's heading, right side. */
  dayMoved: (amount: string) => `${amount} moved`,

  /** Nothing to show. */
  emptyAllTitle: 'No activity yet',
  emptyAllBody: 'Deposits, spending and moves to investing show up here, newest first.',
  emptyAllAction: 'Make a deposit',
  emptyMonthTitle: (month: string) => `Nothing in ${month}`,
  emptyMonthBody: 'Pick another month, or go back to today.',
  emptyDayTitle: 'Nothing on this day',
  emptyDayBody: 'No deposits, spending or moves were recorded.',
  showWholeMonth: 'Show the whole month',

  /** An older month that has to be read first. */
  readingMonth: (month: string) => `Reading ${month}…`,
  needsConnection: (month: string) => `Reading ${month} needs a connection. Nothing is shown rather than a month that looks empty.`,
  retry: 'Try again',

  /** The month picker. */
  pickerTitle: 'Jump to a month',
  previousYear: 'Previous year',
  nextYear: 'Next year',
  stateCleared: 'cleared',
  stateLoad: 'tap to load',
  stateThisMonth: 'this month',
  monthAria: (label: string, state: string) => (state ? `${label}, ${state}` : label),
  onceNote:
    'The last three months are instant. An older month is read once, the first time you tap it (a little of the free quota), and then kept until you close the app.',
  clearedNote: 'Greyed “cleared” months are past your retention period. The statements you exported remain.',
};
