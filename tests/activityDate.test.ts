import { checkActivityDate, debtExistedOn, stampFor } from '../services/activityDate';
import { eq, report } from './harness';

const now = new Date(2026, 9, 6, 15, 30);
const bound = new Date(2026, 7, 1);

eq('a date a day ahead is refused', checkActivityDate(new Date(2026, 9, 7, 15, 30), now, bound), 'future');
eq('30 s ahead is inside the clock skew', checkActivityDate(new Date(now.getTime() + 30_000), now, bound), null);
eq('exactly 60 s ahead is allowed', checkActivityDate(new Date(now.getTime() + 60_000), now, bound), null);
eq('61 s ahead is refused', checkActivityDate(new Date(now.getTime() + 61_000), now, bound), 'future');
eq('before the bound is refused', checkActivityDate(new Date(bound.getTime() - 1), now, bound), 'beforeAllowed');
eq('exactly the bound is allowed', checkActivityDate(new Date(bound.getTime()), now, bound), null);

const past = stampFor(new Date(2026, 8, 20), now, bound);
eq('a past date-only day is stamped at local noon', 'stamp' in past && past.stamp, new Date(2026, 8, 20, 12).toISOString());
const today = stampFor(new Date(2026, 9, 6), now, bound);
eq('today date-only uses now', 'stamp' in today && today.stamp, now.toISOString());
const none = stampFor(undefined, now, bound);
eq('no date means now', 'stamp' in none && none.stamp, now.toISOString());
eq('a date-only future day is refused', stampFor(new Date(2026, 9, 7), now, bound), { problem: 'future' });
eq('a date-only day before the bound is refused', stampFor(new Date(2026, 6, 31), now, bound), { problem: 'beforeAllowed' });
const timed = stampFor(new Date(2026, 8, 20, 9, 15), now, bound);
eq('a day with a time keeps its time', 'stamp' in timed && timed.stamp, new Date(2026, 8, 20, 9, 15).toISOString());
eq('the bound day itself is allowed', 'stamp' in (stampFor(new Date(2026, 7, 1), now, bound)), true);

const a = stampFor(new Date(2026, 8, 19), now, bound);
const b = stampFor(new Date(2026, 8, 20), now, bound);
eq(
  'stamps are UTC ISO and sort like time',
  'stamp' in a && 'stamp' in b && /Z$/.test(a.stamp) && a.stamp < b.stamp && new Date(a.stamp).getTime() < new Date(b.stamp).getTime(),
  true
);

const loanMade = new Date(2026, 8, 25, 18, 0).toISOString();
eq('a back-dated deposit skips a debt created later', debtExistedOn(loanMade, new Date(2026, 8, 20, 12)), false);
eq('a debt made later the same day is still repaid', debtExistedOn(loanMade, new Date(2026, 8, 25, 0)), true);
eq('an earlier debt is repaid', debtExistedOn(loanMade, new Date(2026, 8, 26, 12)), true);

report();
