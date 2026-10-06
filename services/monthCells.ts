/**
 * The 3 x 4 month picker in History: what each month of a year offers.
 *
 * Pure, so which months are instant, which need a one-time read and which are
 * gone is tested rather than eyeballed. `month` is 0-based like Date's own.
 *
 * - `future`  : after the current month; nothing can be there.
 * - `cleared` : the whole month is before the retention cutoff (`keptFrom`);
 *               the records were pruned, only an exported statement remains.
 * - `load`    : kept, but older than what is on the phone: the first tap reads it.
 * - `live`    : already on the phone (the live window, or read earlier this session).
 */
export type MonthCellState = 'future' | 'cleared' | 'load' | 'live';

export const monthCellState = (
  year: number,
  month: number,
  keptFrom: Date,
  liveFrom: Date,
  now: Date,
  /** Where the loaded ledger starts, if older rows have been read already. */
  loadedFrom?: Date
): MonthCellState => {
  const start = new Date(year, month, 1).getTime();
  const end = new Date(year, month + 1, 1).getTime();
  if (start > new Date(now.getFullYear(), now.getMonth(), 1).getTime()) return 'future';
  if (end <= keptFrom.getTime()) return 'cleared';
  const covered = Math.min(liveFrom.getTime(), loadedFrom ? loadedFrom.getTime() : Infinity);
  // A month that starts before the kept window but is partly kept counts from the window's start.
  return Math.max(start, keptFrom.getTime()) < covered ? 'load' : 'live';
};

/** The earliest and latest year the picker can step to: the retention cutoff's year to this year. */
export const yearRange = (keptFrom: Date, now: Date) => ({
  min: Math.min(keptFrom.getFullYear(), now.getFullYear()),
  max: now.getFullYear(),
});

/**
 * Where the History cursor lands when a month is chosen: today when it is the
 * current month (so "Today" stays one tap away), otherwise the month's first day.
 */
export const cursorForMonth = (year: number, month: number, now: Date): Date =>
  year === now.getFullYear() && month === now.getMonth() ? new Date(now.getFullYear(), now.getMonth(), now.getDate()) : new Date(year, month, 1);

/** The day `delta` days from `date`, at local midnight, through the calendar so a clock change cannot slip a day. */
export const shiftDay = (date: Date, delta: number): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate() + delta);

/** The same day-of-month `delta` months on, clamped to the month's length (31 Mar - 1 month = 28 Feb). */
export const shiftMonth = (date: Date, delta: number): Date => {
  const first = new Date(date.getFullYear(), date.getMonth() + delta, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return new Date(first.getFullYear(), first.getMonth(), Math.min(date.getDate(), last));
};
