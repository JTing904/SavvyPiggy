/**
 * All money arithmetic happens in whole cents. Shares are always rounded DOWN,
 * so a split can never mint a cent that was not deposited, and whatever is left
 * over after flooring goes to the largest share rather than evaporating.
 */

/** Floats cannot hold 4.35 exactly, so nudge before flooring: 434.999… -> 435. */
export const toCents = (amount: number) => Math.floor(amount * 100 + 1e-6);

export const fromCents = (cents: number) => cents / 100;

/* --------------------------------------------------------------- display */

/** Malaysian ringgit, written the local way: no space between symbol and digits. */
export const CURRENCY = 'RM';

export interface MoneyFormat {
  /** 2 by default; 0 drops the cents for headline figures. */
  decimals?: 0 | 2;
  /** Always show + or -, for ledger entries that read as movements. */
  signed?: boolean;
  /** Off where the surrounding text already says which currency it is. */
  symbol?: boolean;
}

/**
 * The one place money becomes text: RM1,240.50, -RM10.00, +RM45.00.
 * The sign always leads, so a negative never reads as "RM-10.00".
 *
 * Worked out in whole cents. Balances move by float increments, so
 * 50.30 - 20.10 - 30.20 leaves -0.0000000000000036 behind, and judging the
 * sign on that showed "-RM0.00". Whole-ringgit figures drop the cents rather
 * than rounding them: RM1,240.50 is not yet RM1,241.
 */
export const formatMoney = (amount: number, format: MoneyFormat = {}) => {
  const { decimals = 2, signed = false, symbol = true } = format;
  const cents = toCents(Math.abs(amount));
  const digits = (decimals === 0 ? Math.floor(cents / 100) : cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const sign = amount < 0 && cents > 0 ? '-' : signed ? '+' : '';
  return `${sign}${symbol ? CURRENCY : ''}${digits}`;
};

/**
 * How far a balance is towards its target, as a whole percentage for labels.
 * Floored in cents, so 100% means reached: rounding showed RM999.50 of
 * RM1,000 as 100% while the goal still said what was left to go.
 */
export const percentReached = (current: number, target: number) => {
  const targetCents = toCents(target);
  if (targetCents <= 0) return 0;
  return Math.min(100, Math.max(0, Math.floor((toCents(current) * 100) / targetCents)));
};

export interface Share<T> {
  item: T;
  weight: number;
  cents: number;
}

/**
 * Settles the odd cent on the heaviest share; ties go to the first one.
 *
 * It works in both directions. Flooring every part usually leaves a cent
 * over, but percentages that add to a hair past 100 — which is what shares
 * handed on from a full goal produce — place one too many, and the parts have
 * to come back to the total either way. Whoever takes the biggest share
 * carries the difference.
 */
const distributeRemainder = <T>(shares: Share<T>[], remainder: number) => {
  if (remainder === 0 || shares.length === 0) return shares;

  let best = 0;
  for (let i = 1; i < shares.length; i++) {
    if (shares[i].weight > shares[best].weight) best = i;
  }
  shares[best].cents = Math.max(0, shares[best].cents + remainder);
  return shares;
};

/**
 * Splits by percentages that are meant to add up to 100. A strategy adding up
 * to less than 100 deliberately leaves the rest undistributed — the deposit
 * screen warns about that — but every cent of the allocated part is placed.
 */
export const splitByPercentage = <T>(
  totalCents: number,
  items: { item: T; percentage: number }[]
): Share<T>[] => {
  const live = items.filter((i) => i.percentage > 0);
  if (totalCents <= 0 || live.length === 0) return [];

  /*
    Percentages are meant to total 100, and the intent is what counts.

    When a full goal's share is handed on, the division that shares it out
    does not terminate — 5% and 10% splitting a freed 85% become 33.33…% and
    66.66…%, which sum to 99.99999999999999. Taken literally that shaved a cent
    off the amount to be placed, so every deposit under overflow put RM9.99 of
    an RM10.00 into the goals while the ledger recorded RM10.00. Rounding the
    total to the precision a percentage is actually stored at reads the intent
    instead of the floating-point residue.
  */
  const totalPercentage = Math.round(live.reduce((sum, i) => sum + i.percentage, 0) * 100) / 100;
  const allocatable = Math.floor((totalCents * Math.min(100, totalPercentage)) / 100);

  const shares = live.map((i) => ({
    item: i.item,
    weight: i.percentage,
    cents: Math.floor((totalCents * i.percentage) / 100),
  }));

  const placed = shares.reduce((sum, s) => sum + s.cents, 0);
  return distributeRemainder(shares, allocatable - placed);
};

/**
 * Splits in proportion to arbitrary weights — current balances, say — placing
 * the whole amount. Used when taking money out, where the only sensible ratio
 * is how much each goal actually holds.
 */
export const splitProportionally = <T>(
  totalCents: number,
  items: { item: T; weight: number }[]
): Share<T>[] => {
  const live = items.filter((i) => i.weight > 0);
  if (totalCents <= 0 || live.length === 0) return [];

  const totalWeight = live.reduce((sum, i) => sum + i.weight, 0);
  const shares = live.map((i) => ({
    item: i.item,
    weight: i.weight,
    cents: Math.floor((totalCents * i.weight) / totalWeight),
  }));

  const placed = shares.reduce((sum, s) => sum + s.cents, 0);
  return distributeRemainder(shares, totalCents - placed);
};

/**
 * The cents each part of a corrected deposit gets, in the order given.
 *
 * It is re-split by the percentages the deposit was split by, never by the
 * cents each goal happened to get: a RM0.10 deposit at 33/33/34 placed
 * 3/3/4 sen, and scaling those made RM1,000 into 300/300/400 instead of
 * 330/330/340. A deposit that placed all of its amount places all of the new
 * one too, reading its percentages as shares of the whole — they are stored
 * to two places, so 33.33% × 3 must not shed a sen as a deliberate 0.01%
 * left out. The odd cent goes to the largest percentage either way.
 */
export const resplitDeposit = (
  newCents: number,
  originalCents: number,
  distributions: { amount: number; percentage: number }[]
): number[] => {
  const placedCents = distributions.reduce((sum, d) => sum + toCents(d.amount), 0);
  // Entries without a usable percentage on every part only have their cents to go by.
  const byCents = distributions.some((d) => toCents(d.amount) > 0 && !(d.percentage > 0));
  const shares = byCents
    ? splitProportionally(
        originalCents > 0 ? Math.floor((newCents * Math.min(placedCents, originalCents)) / originalCents) : 0,
        distributions.map((d, i) => ({ item: i, weight: toCents(d.amount) }))
      )
    : placedCents === originalCents
      ? splitProportionally(
          newCents,
          distributions.map((d, i) => ({ item: i, weight: d.percentage }))
        )
      : splitByPercentage(
          newCents,
          distributions.map((d, i) => ({ item: i, percentage: d.percentage }))
        );
  return distributions.map((_, i) => shares.find((s) => s.item === i)?.cents ?? 0);
};
