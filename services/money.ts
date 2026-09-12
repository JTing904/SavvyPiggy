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
 */
export const formatMoney = (amount: number, format: MoneyFormat = {}) => {
  const { decimals = 2, signed = false, symbol = true } = format;
  const digits = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const sign = amount < 0 ? '-' : signed ? '+' : '';
  return `${sign}${symbol ? CURRENCY : ''}${digits}`;
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
