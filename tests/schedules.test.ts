import { dueOccurrences, describe, localDate, nextOccurrence, runStamp, scheduleDay } from '../services/schedules';
import type { Schedule } from '../types';
import { eq, report } from './harness';

const s = (o: Partial<Schedule>): Schedule => ({
  id: 't',
  amount: 10,
  frequency: 'daily',
  weekday: 1,
  dayOfMonth: 1,
  month: 1,
  targetBankId: null,
  enabled: true,
  lastRunAt: '',
  createdAt: 0,
  ...o,
});

/** Mid-afternoon in Malaysia on that day, as an instant. */
const my = (day: string, time = '15:00') => new Date(`${day}T${time}:00+08:00`);

/*
  Days are decided in Malaysia, so every case below has to give the same
  answer whatever zone the phone is set to. Each one runs under several.
*/
const ZONES = ['Asia/Kuala_Lumpur', 'Asia/Bangkok', 'Europe/London', 'America/New_York', 'Australia/Sydney'];

for (const zone of ZONES) {
  process.env.TZ = zone;
  const at = ` (${zone})`;

  eq(
    'daily: three days elapsed' + at,
    dueOccurrences(s({ frequency: 'daily', lastRunAt: '2026-03-01T10:00:00Z' }), my('2026-03-04')),
    ['2026-03-02', '2026-03-03', '2026-03-04']
  );

  eq(
    'daily: same day yields nothing' + at,
    dueOccurrences(s({ frequency: 'daily', lastRunAt: '2026-03-04T01:00:00Z' }), my('2026-03-04')),
    []
  );

  // The double post: a day already run, read back on a phone behind Malaysia.
  eq(
    'daily: a day already posted is not posted again' + at,
    dueOccurrences(s({ frequency: 'daily', lastRunAt: runStamp('2026-03-04') }), my('2026-03-04', '23:59')),
    []
  );

  eq(
    'daily: what the old code stored in Malaysia still reads as that day' + at,
    dueOccurrences(s({ frequency: 'daily', lastRunAt: '2026-03-03T16:00:00.000Z' }), my('2026-03-05')),
    ['2026-03-05']
  );

  eq(
    'daily: just after Malaysian midnight is already the next day' + at,
    dueOccurrences(s({ frequency: 'daily', lastRunAt: runStamp('2026-03-04') }), my('2026-03-05', '00:01')),
    ['2026-03-05']
  );

  eq(
    'weekly: only Mondays' + at,
    dueOccurrences(s({ frequency: 'weekly', weekday: 1, lastRunAt: '2026-03-01T00:00:00Z' }), my('2026-03-20')),
    ['2026-03-02', '2026-03-09', '2026-03-16']
  );

  eq(
    'weekly: a posted Monday is not repeated' + at,
    dueOccurrences(s({ frequency: 'weekly', weekday: 1, lastRunAt: runStamp('2026-03-09') }), my('2026-03-15', '23:30')),
    []
  );

  eq(
    'monthly on the 15th' + at,
    dueOccurrences(s({ frequency: 'monthly', dayOfMonth: 15, lastRunAt: '2026-01-20T00:00:00Z' }), my('2026-04-01')),
    ['2026-02-15', '2026-03-15']
  );

  eq(
    'monthly on the 31st falls back to each month end' + at,
    dueOccurrences(s({ frequency: 'monthly', dayOfMonth: 31, lastRunAt: runStamp('2026-01-31') }), my('2026-05-01')),
    ['2026-02-28', '2026-03-31', '2026-04-30']
  );

  eq(
    'monthly on the 31st: February end posted once' + at,
    dueOccurrences(s({ frequency: 'monthly', dayOfMonth: 31, lastRunAt: runStamp('2026-02-28') }), my('2026-03-30')),
    []
  );

  eq(
    'monthly on the 29th hits a leap February' + at,
    dueOccurrences(s({ frequency: 'monthly', dayOfMonth: 29, lastRunAt: '2028-01-30T00:00:00Z' }), my('2028-03-01')),
    ['2028-02-29']
  );

  eq(
    'yearly: December 25th' + at,
    dueOccurrences(s({ frequency: 'yearly', month: 12, dayOfMonth: 25, lastRunAt: '2025-12-26T00:00:00Z' }), my('2026-12-31')),
    ['2026-12-25']
  );

  eq(
    'yearly: not due yet this year' + at,
    dueOccurrences(s({ frequency: 'yearly', month: 12, dayOfMonth: 25, lastRunAt: '2026-01-01T00:00:00Z' }), my('2026-06-01')),
    []
  );

  eq(
    'catch-up is capped so a long-dormant rule cannot run away' + at,
    dueOccurrences(s({ frequency: 'daily', lastRunAt: '2020-01-01T00:00:00Z' }), my('2026-03-04')).length,
    60
  );

  eq('an unreadable lastRunAt posts nothing' + at, dueOccurrences(s({ lastRunAt: '' }), my('2026-03-04')), []);

  eq('the stamp reads back as its own day' + at, scheduleDay(runStamp('2026-02-28')), '2026-02-28');

  eq(
    "next occurrence is the phone's midnight on the Malaysian day" + at,
    nextOccurrence(s({ frequency: 'monthly', dayOfMonth: 31, lastRunAt: runStamp('2026-01-31') }), my('2026-02-10'))?.getTime(),
    localDate('2026-02-28').getTime()
  );
}
process.env.TZ = 'Asia/Kuala_Lumpur';

eq('describe daily', describe({ frequency: 'daily', weekday: 0, dayOfMonth: 1, month: 1 }), 'Every day');
eq('describe weekly', describe({ frequency: 'weekly', weekday: 3, dayOfMonth: 1, month: 1 }), 'Every Wednesday');
eq('describe monthly 1st', describe({ frequency: 'monthly', weekday: 0, dayOfMonth: 1, month: 1 }), 'The 1st of each month');
eq('describe monthly 22nd', describe({ frequency: 'monthly', weekday: 0, dayOfMonth: 22, month: 1 }), 'The 22nd of each month');
eq('describe monthly 11th', describe({ frequency: 'monthly', weekday: 0, dayOfMonth: 11, month: 1 }), 'The 11th of each month');
eq('describe yearly', describe({ frequency: 'yearly', weekday: 0, dayOfMonth: 3, month: 8 }), 'August 3rd each year');

report();
