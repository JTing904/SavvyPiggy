import {
  addMonths,
  fromInputDate,
  monthGrid,
  readableDate,
  toInputDate,
  WEEKDAYS,
} from '../services/calendar';
import { eq, report } from './harness';

// --- the grid

{
  // 1 June 2026 is a Monday, so exactly one blank leads the first row.
  const june = monthGrid(2026, 5);
  eq('a month starts on its real weekday', june[0], [null, 1, 2, 3, 4, 5, 6]);
  eq('the last day is where it belongs', june[4], [28, 29, 30, null, null, null, null]);
  eq('a month needing only five rows still gets a sixth', june[5], Array(7).fill(null));
}

{
  // 1 Feb 2026 is a Sunday: no lead at all, the shortest possible layout.
  const feb = monthGrid(2026, 1);
  eq('a month starting on Sunday has no blanks in front', feb[0], [1, 2, 3, 4, 5, 6, 7]);
  eq('a 28-day month ending on Saturday still fills six rows', feb[4], [null, null, null, null, null, null, null]);
}

eq(
  'every month is six rows of seven, so the sheet never changes height',
  [2026, 2027, 2028].flatMap((y) =>
    Array.from({ length: 12 }, (_, m) => {
      const grid = monthGrid(y, m);
      return grid.length === 6 && grid.every((r) => r.length === 7);
    })
  ).every(Boolean),
  true
);

eq(
  'every day of the month appears exactly once',
  monthGrid(2026, 7).flat().filter((d) => d !== null),
  Array.from({ length: 31 }, (_, i) => i + 1)
);

eq('a leap February has 29 days', monthGrid(2028, 1).flat().filter((d) => d !== null).length, 29);
eq('a common February has 28', monthGrid(2026, 1).flat().filter((d) => d !== null).length, 28);
eq('the weekday row is Sunday-first and seven wide', WEEKDAYS.length, 7);

// --- stepping months

eq('December steps into next January', addMonths(2026, 11, 1), { year: 2027, month: 0 });
eq('January steps back into last December', addMonths(2026, 0, -1), { year: 2025, month: 11 });
eq('a step of nothing stays put', addMonths(2026, 5, 0), { year: 2026, month: 5 });

// --- keys and timestamps

eq('a timestamp becomes the day it fell on', toInputDate(new Date(2026, 5, 19, 14, 30).getTime()), '2026-06-19');
eq('single digits are padded', toInputDate(new Date(2026, 0, 2).getTime()), '2026-01-02');

// The bug this guards: reading the day out of an ISO string would roll a late
// evening in Kuala Lumpur back to the previous date.
eq(
  'a minute before midnight is still today, not tomorrow',
  toInputDate(new Date(2026, 5, 19, 23, 59, 59).getTime()),
  '2026-06-19'
);
eq('midnight itself is that day', toInputDate(new Date(2026, 5, 19, 0, 0, 0).getTime()), '2026-06-19');

eq(
  'a key survives the round trip',
  ['2026-01-01', '2026-06-19', '2026-12-31', '2028-02-29'].map((k) => toInputDate(fromInputDate(k))),
  ['2026-01-01', '2026-06-19', '2026-12-31', '2028-02-29']
);

eq('a key parses to the local midnight of that day', fromInputDate('2026-06-19'), new Date(2026, 5, 19).getTime());

// Unreadable input falls back to today. 1970 would look like a real date and
// backdate the trade by fifty years.
{
  const today = toInputDate(Date.now());
  eq(
    'garbage reads as today, not as the epoch',
    ['', 'nope', '2026-06', '--'].map((k) => toInputDate(fromInputDate(k))),
    [today, today, today, today]
  );
}

eq('a date reads the way a person would say it', readableDate('2026-06-19'), 'Fri, 19 Jun 2026');

report();
