/** The places money can be moved between: the wallet, the investing cash, or a goal's id. */
export type Place = string;

export const WALLET_PLACE = 'wallet';
export const POT_PLACE = 'pot';
/** A destination only: by the goals' shares. */
export const SPLIT_PLACE = 'split';

/**
 * Where money can go from a place. Only the moves the ledger has a record for
 * are offered: wallet and goals both ways, a goal into the investing cash, and
 * the investing cash back to the goals. There is no goal-to-goal or
 * wallet-to-investing entry, so neither appears as a choice.
 */
export const moveTargets = (from: Place, goalIds: string[], canSplit: boolean): Place[] => {
  if (from === WALLET_PLACE) return [...(canSplit ? [SPLIT_PLACE] : []), ...goalIds];
  if (from === POT_PLACE) return [...(canSplit ? [SPLIT_PLACE] : []), ...goalIds];
  return [WALLET_PLACE, POT_PLACE];
};
