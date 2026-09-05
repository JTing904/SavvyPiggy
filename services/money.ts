/**
 * All money arithmetic happens in whole cents. Shares are always rounded DOWN,
 * so a split can never mint a cent that was not deposited, and whatever is left
 * over after flooring goes to the largest share rather than evaporating.
 */

/** Floats cannot hold 4.35 exactly, so nudge before flooring: 434.999… -> 435. */
export const toCents = (amount: number) => Math.floor(amount * 100 + 1e-6);

export const fromCents = (cents: number) => cents / 100;

export interface Share<T> {
  item: T;
  weight: number;
  cents: number;
}

/** Hands each leftover cent to the heaviest share; ties go to the first one. */
const distributeRemainder = <T>(shares: Share<T>[], remainder: number) => {
  if (remainder <= 0 || shares.length === 0) return shares;

  let best = 0;
  for (let i = 1; i < shares.length; i++) {
    if (shares[i].weight > shares[best].weight) best = i;
  }
  shares[best].cents += remainder;
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

  const totalPercentage = live.reduce((sum, i) => sum + i.percentage, 0);
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
