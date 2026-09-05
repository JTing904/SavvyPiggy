import { dueOccurrences, describe } from '../services/schedules';
import type { Schedule } from '../types';
import { eq, report } from './harness';

const iso = (dates: Date[]) =>
  dates.map(
    (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  );

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

eq(
  'daily: three days elapsed',
  iso(dueOccurrences(s({ frequency: 'daily', lastRunAt: '2026-03-01T10:00:00Z' }), new Date(2026, 2, 4))),
  ['2026-03-02', '2026-03-03', '2026-03-04']
);

eq(
  'daily: same day yields nothing',
  iso(dueOccurrences(s({ frequency: 'daily', lastRunAt: '2026-03-04T01:00:00Z' }), new Date(2026, 2, 4))),
  []
);

eq(
  'weekly: only Mondays',
  iso(
    dueOccurrences(
      s({ frequency: 'weekly', weekday: 1, lastRunAt: '2026-03-01T00:00:00Z' }),
      new Date(2026, 2, 20)
    )
  ),
  ['2026-03-02', '2026-03-09', '2026-03-16']
);

eq(
  'monthly on the 15th',
  iso(
    dueOccurrences(
      s({ frequency: 'monthly', dayOfMonth: 15, lastRunAt: '2026-01-20T00:00:00Z' }),
      new Date(2026, 3, 1)
    )
  ),
  ['2026-02-15', '2026-03-15']
);

eq(
  'monthly on the 31st falls back to each month end',
  iso(
    dueOccurrences(
      s({ frequency: 'monthly', dayOfMonth: 31, lastRunAt: '2026-01-31T00:00:00Z' }),
      new Date(2026, 4, 1)
    )
  ),
  ['2026-02-28', '2026-03-31', '2026-04-30']
);

eq(
  'monthly on the 29th hits a leap February',
  iso(
    dueOccurrences(
      s({ frequency: 'monthly', dayOfMonth: 29, lastRunAt: '2028-01-30T00:00:00Z' }),
      new Date(2028, 2, 1)
    )
  ),
  ['2028-02-29']
);

eq(
  'yearly: December 25th',
  iso(
    dueOccurrences(
      s({ frequency: 'yearly', month: 12, dayOfMonth: 25, lastRunAt: '2025-12-26T00:00:00Z' }),
      new Date(2026, 11, 31)
    )
  ),
  ['2026-12-25']
);

eq(
  'yearly: not due yet this year',
  iso(
    dueOccurrences(
      s({ frequency: 'yearly', month: 12, dayOfMonth: 25, lastRunAt: '2026-01-01T00:00:00Z' }),
      new Date(2026, 5, 1)
    )
  ),
  []
);

eq(
  'catch-up is capped so a long-dormant rule cannot run away',
  dueOccurrences(s({ frequency: 'daily', lastRunAt: '2020-01-01T00:00:00Z' }), new Date(2026, 2, 4)).length,
  60
);

eq('describe daily', describe({ frequency: 'daily', weekday: 0, dayOfMonth: 1, month: 1 }), 'Every day');
eq('describe weekly', describe({ frequency: 'weekly', weekday: 3, dayOfMonth: 1, month: 1 }), 'Every Wednesday');
eq('describe monthly 1st', describe({ frequency: 'monthly', weekday: 0, dayOfMonth: 1, month: 1 }), 'The 1st of each month');
eq('describe monthly 22nd', describe({ frequency: 'monthly', weekday: 0, dayOfMonth: 22, month: 1 }), 'The 22nd of each month');
eq('describe monthly 11th', describe({ frequency: 'monthly', weekday: 0, dayOfMonth: 11, month: 1 }), 'The 11th of each month');
eq('describe yearly', describe({ frequency: 'yearly', weekday: 0, dayOfMonth: 3, month: 8 }), 'August 3rd each year');

report();
