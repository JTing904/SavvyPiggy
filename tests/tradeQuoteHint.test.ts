import { agoOf, applyHint, hintFor, isFreshQuote, needsQuoteFetch, priceText, showHint, typePrice } from '../services/quoteHint';
import type { Quote } from '../services/holdings';
import { eq, report } from './harness';

const MIN = 60_000;
const HOUR = 60 * MIN;
/** Kuala Lumpur wall-clock time, as epoch ms. 2026-10-05 is a Monday. */
const kl = (iso: string) => Date.parse(`${iso}+08:00`);

const quote = (cents: number, at: number, points?: number): Quote => ({ priceCents: cents, pricePoints: points, previousCloseCents: cents, at });

// Freshness
const tueNoon = kl('2026-10-06T12:00:00');
eq('a quote two minutes old is fresh', isFreshQuote(tueNoon - 2 * MIN, tueNoon), true);
eq('a quote 20 hours old is fresh', isFreshQuote(tueNoon - 20 * HOUR, tueNoon), true);
eq('a quote from before a session that has since happened is stale', isFreshQuote(kl('2026-10-05T10:00:00'), kl('2026-10-06T19:00:00')), false);
eq('Friday close is still fresh on Saturday', isFreshQuote(kl('2026-10-09T17:00:00'), kl('2026-10-10T11:00:00')), true);
eq('Friday close is still fresh on Sunday night', isFreshQuote(kl('2026-10-09T17:00:00'), kl('2026-10-11T22:00:00')), true);
eq('Friday close is fresh on Monday before the market opens', isFreshQuote(kl('2026-10-09T17:00:00'), kl('2026-10-12T07:00:00')), true);
eq('Friday close is stale on Monday evening', isFreshQuote(kl('2026-10-09T17:00:00'), kl('2026-10-12T19:00:00')), false);
eq('Friday close is stale on Tuesday', isFreshQuote(kl('2026-10-09T17:00:00'), kl('2026-10-13T09:00:00')), false);
eq('a week-old quote is stale', isFreshQuote(tueNoon - 7 * 24 * HOUR, tueNoon), false);
eq('a quote from the future is not trusted', isFreshQuote(tueNoon + HOUR, tueNoon), false);
eq('a tiny clock skew is tolerated', isFreshQuote(tueNoon + MIN, tueNoon), true);
eq('NaN is not fresh', isFreshQuote(NaN, tueNoon), false);

// Chip text inputs
eq('priceText keeps two places', priceText(98_200), '9.82');
eq('priceText keeps a half sen', priceText(3_450), '0.345');
eq('ago: under a minute', agoOf(tueNoon - 20_000, tueNoon), { unit: 'now', n: 0 });
eq('ago: minutes', agoOf(tueNoon - 2 * MIN - 5_000, tueNoon), { unit: 'minutes', n: 2 });
eq('ago: hours', agoOf(tueNoon - 5 * HOUR - 10 * MIN, tueNoon), { unit: 'hours', n: 5 });
eq('ago: days', agoOf(tueNoon - 50 * HOUR, tueNoon), { unit: 'days', n: 2 });

const fresh = quote(982, tueNoon - 2 * MIN, 98_200);
eq('hint carries the price text, points and age', hintFor(fresh, tueNoon), { text: '9.82', points: 98_200, ago: { unit: 'minutes', n: 2 } });
eq('a quote cached without points still gives a hint', hintFor(quote(982, tueNoon - MIN), tueNoon)?.text, '9.82');
eq('a half-sen quote gives its exact price', hintFor(quote(34, tueNoon - MIN, 3_450), tueNoon)?.text, '0.345');
eq('no quote gives no hint', hintFor(undefined, tueNoon), null);
eq('a stale quote gives no hint', hintFor(quote(982, tueNoon - 9 * 24 * HOUR), tueNoon), null);
eq('a zero price gives no hint', hintFor(quote(0, tueNoon - MIN), tueNoon), null);

// When it shows
eq('shown on a new trade with an empty price', showHint({ isNew: true, priceField: '', quote: fresh, now: tueNoon })?.text, '9.82');
eq('whitespace counts as empty', showHint({ isNew: true, priceField: '  ', quote: fresh, now: tueNoon })?.text, '9.82');
eq('never shown when editing', showHint({ isNew: false, priceField: '', quote: fresh, now: tueNoon }), null);
eq('hidden once a price is typed', showHint({ isNew: true, priceField: '9', quote: fresh, now: tueNoon }), null);
eq('hidden with no fresh quote', showHint({ isNew: true, priceField: '', quote: undefined, now: tueNoon }), null);

// Applying and editing
const hint = hintFor(fresh, tueNoon)!;
eq('using the hint fills the field and flags it', applyHint(hint), { text: '9.82', fromHint: true });
eq('typing afterwards clears the flag', typePrice('9.83'), { text: '9.83', fromHint: false });
eq('clearing the field clears the flag too', typePrice(''), { text: '', fromHint: false });

// Fetching for a counter without a price
const none = new Set<string>();
eq('fetch for a searched counter with no quote', needsQuoteFetch({ isNew: true, symbol: '1155.KL', priceField: '', have: undefined, asked: none, now: tueNoon }), true);
eq('no fetch when a fresh quote is in hand', needsQuoteFetch({ isNew: true, symbol: '1155.KL', priceField: '', have: fresh, asked: none, now: tueNoon }), false);
eq('fetch when the cached quote is stale', needsQuoteFetch({ isNew: true, symbol: '1155.KL', priceField: '', have: quote(982, tueNoon - 9 * 24 * HOUR), asked: none, now: tueNoon }), true);
eq('only asked once per counter', needsQuoteFetch({ isNew: true, symbol: '1155.KL', priceField: '', have: undefined, asked: new Set(['1155.KL']), now: tueNoon }), false);
eq('no fetch when editing', needsQuoteFetch({ isNew: false, symbol: '1155.KL', priceField: '', have: undefined, asked: none, now: tueNoon }), false);
eq('no fetch before a counter is chosen', needsQuoteFetch({ isNew: true, symbol: '', priceField: '', have: undefined, asked: none, now: tueNoon }), false);
eq('no fetch once a price is typed', needsQuoteFetch({ isNew: true, symbol: '1155.KL', priceField: '9', have: undefined, asked: none, now: tueNoon }), false);

report();
