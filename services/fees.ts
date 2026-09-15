/**
 * What buying or selling on Bursa actually costs, broker by broker.
 *
 * Everything here is in whole sen, and it rounds the way a contract note does
 * — to the nearest sen — rather than the app's own round-down rule for
 * splitting money. These are charges someone else computes; the only useful
 * answer is the one that matches the paper. Checked against a real M+ note:
 * MAYBANK 100 @ RM10.60 → brokerage RM8.00, clearing RM0.32, stamp RM2.00,
 * total RM1,070.32.
 *
 * The rates are data, not code, because brokers change them and people change
 * brokers. Each one was read from the broker's own pricing page on
 * 13 Sep 2026; any broker whose rate could not be found there is not listed,
 * rather than listed with a guess.
 */

export type SecurityType = 'EQUITY' | 'REIT';

export interface TradeFees {
  brokerageCents: number;
  clearingCents: number;
  stampCents: number;
  /** 8% service tax. Only REITs (and ETFs, warrants) carry it; shares do not. */
  sstCents: number;
}

export const FEE_KEYS = ['brokerageCents', 'clearingCents', 'stampCents', 'sstCents'] as const;
export type FeeKey = (typeof FEE_KEYS)[number];

export const ZERO_FEES: TradeFees = { brokerageCents: 0, clearingCents: 0, stampCents: 0, sstCents: 0 };

export const totalFees = (fees: TradeFees | undefined | null) =>
  fees ? fees.brokerageCents + fees.clearingCents + fees.stampCents + fees.sstCents : 0;

/* ---------------------------------------------------------------- brokers */

/** Brokerage only; the exchange's own charges are the same everywhere. */
export type BrokerageRule =
  /** A percentage with a floor, e.g. 0.08%, minimum RM8. */
  | { kind: 'percent'; bp: number; minCents: number }
  /** A percentage plus a flat fee per order, e.g. 0.03% + RM3. */
  | { kind: 'percentPlusFlat'; bp: number; flatCents: number }
  /** Steps by trade value. `upToCents` is exclusive; the last step has none. */
  | { kind: 'tiers'; tiers: { upToCents: number | null; flatCents?: number; bp?: number }[] };

export interface Broker {
  id: string;
  name: string;
  /** Two letters for the badge. */
  short: string;
  color: string;
  rule: BrokerageRule;
}

export const BROKERS: Broker[] = [
  {
    id: 'rakuten',
    name: 'Rakuten Trade',
    short: 'RT',
    color: '#BF0000',
    rule: {
      kind: 'tiers',
      tiers: [
        { upToCents: 10_000, flatCents: 100 },
        { upToCents: 1_000_000, flatCents: 288 },
        { upToCents: 10_000_000, bp: 10 },
        { upToCents: null, flatCents: 10_000 },
      ],
    },
  },
  { id: 'moomoo', name: 'Moomoo', short: 'mo', color: '#FF6A00', rule: { kind: 'percentPlusFlat', bp: 3, flatCents: 300 } },
  { id: 'webull', name: 'Webull', short: 'WB', color: '#1B5FFF', rule: { kind: 'percent', bp: 5, minCents: 250 } },
  { id: 'mplus', name: 'M+ Online', short: 'M+', color: '#6B21A8', rule: { kind: 'percent', bp: 8, minCents: 800 } },
  { id: 'hleb', name: 'HLeBroking', short: 'HL', color: '#0A3D91', rule: { kind: 'percent', bp: 8, minCents: 800 } },
  { id: 'maybank', name: 'Maybank Trade', short: 'MB', color: '#E0A800', rule: { kind: 'percent', bp: 10, minCents: 800 } },
  { id: 'uobkh', name: 'UOB Kay Hian (UTRADE)', short: 'UO', color: '#123C8C', rule: { kind: 'percent', bp: 10, minCents: 800 } },
  {
    id: 'affin',
    name: 'Affin eInvest Go',
    short: 'AF',
    color: '#00857C',
    rule: {
      kind: 'tiers',
      tiers: [
        { upToCents: 1_000_000, flatCents: 500 },
        { upToCents: 10_000_000, bp: 8 },
        { upToCents: null, bp: 5 },
      ],
    },
  },
  { id: 'cgs', name: 'CGS International', short: 'CG', color: '#C8102E', rule: { kind: 'percent', bp: 6, minCents: 800 } },
];

export const CUSTOM_BROKER_ID = 'custom';

export const brokerById = (id: string | null | undefined, custom?: BrokerageRule | null): Broker | null => {
  if (id === CUSTOM_BROKER_ID && custom) {
    return { id: CUSTOM_BROKER_ID, name: '', short: '✎', color: '#334155', rule: custom };
  }
  return BROKERS.find((b) => b.id === id) ?? null;
};

/** Basis points of a value, to the nearest sen. */
const bpOf = (valueCents: number, bp: number) => Math.round((valueCents * bp) / 10_000);

export const brokerageCents = (valueCents: number, rule: BrokerageRule) => {
  if (valueCents <= 0) return 0;
  switch (rule.kind) {
    case 'percent':
      return Math.max(rule.minCents, bpOf(valueCents, rule.bp));
    case 'percentPlusFlat':
      return bpOf(valueCents, rule.bp) + rule.flatCents;
    case 'tiers': {
      const tier = rule.tiers.find((t) => t.upToCents === null || valueCents < t.upToCents) ?? rule.tiers[rule.tiers.length - 1];
      return (tier.flatCents ?? 0) + (tier.bp ? bpOf(valueCents, tier.bp) : 0);
    }
  }
};

/* --------------------------------------------------------- exchange + tax */

/** 0.03%, capped at RM1,000 a contract. */
export const clearingCents = (valueCents: number) => (valueCents > 0 ? Math.min(100_000, bpOf(valueCents, 3)) : 0);

/**
 * RM1 for every RM1,000 or any part of it — a RM1,500 trade pays RM2 — capped
 * at RM1,000 for shares and RM200 for REITs. The rate is a remission that runs
 * to 12 Jul 2028.
 */
export const stampCents = (valueCents: number, type: SecurityType) =>
  valueCents > 0 ? Math.min(type === 'REIT' ? 20_000 : 100_000, Math.ceil(valueCents / 100_000) * 100) : 0;

export const SST_RATE = 0.08;

export const feesFor = (valueCents: number, broker: Broker, type: SecurityType = 'EQUITY'): TradeFees => {
  if (valueCents <= 0) return { ...ZERO_FEES };
  const brokerage = brokerageCents(valueCents, broker.rule);
  const clearing = clearingCents(valueCents);
  return {
    brokerageCents: brokerage,
    clearingCents: clearing,
    stampCents: stampCents(valueCents, type),
    // Shares are exempt; REITs pay SST on what the broker and the exchange charge.
    sstCents: type === 'REIT' ? Math.round((brokerage + clearing) * SST_RATE) : 0,
  };
};

/* ------------------------------------------------------------------ sizing */

/**
 * Prices in ten-thousandths of a ringgit, because penny stocks trade in
 * half-sen: RM0.345 is 3450. The value of a trade is rounded to the sen, the
 * way the contract note shows it.
 */
export const valueCents = (units: number, pricePoints: number) => Math.round((units * pricePoints) / 100);

export const costCents = (units: number, pricePoints: number, broker: Broker, type: SecurityType = 'EQUITY') => {
  const value = valueCents(units, pricePoints);
  return value + totalFees(feesFor(value, broker, type));
};

export const BOARD_LOT = 100;

/* ------------------------------------------------------------------- REITs */

/**
 * Every REIT on Bursa's Main Market, by Yahoo symbol. Checked against KLSE
 * Screener's sector tags and Yahoo on 13 Sep 2026. KLCC is a stapled security
 * and only exists as 5235SS. Business trusts (PLINTAS) and closed-end funds
 * (ICAP) are deliberately absent.
 */
export const REIT_SYMBOLS = new Set([
  '5106.KL', '5109.KL', '5110.KL', '5111.KL', '5116.KL', '5120.KL', '5121.KL', '5123.KL', '5127.KL', '5130.KL',
  '5176.KL', '5180.KL', '5212.KL', '5227.KL', '5235SS.KL', '5269.KL', '5280.KL', '5299.KL', '5307.KL', '5338.KL',
]);

export const securityTypeOf = (symbol: string, overrides?: Record<string, SecurityType> | null): SecurityType =>
  overrides?.[symbol] ?? (REIT_SYMBOLS.has(symbol) ? 'REIT' : 'EQUITY');

/**
 * What a typed fee field may hold: digits and at most two decimals. A fee is
 * money, so a stray tap cannot turn 0.00 into 0.00100.
 */
export const cleanFeeInput = (text: string) => {
  const [whole, ...rest] = text.replace(/[^\d.]/g, '').split('.');
  return rest.length ? `${whole}.${rest.join('').slice(0, 2)}` : whole;
};
