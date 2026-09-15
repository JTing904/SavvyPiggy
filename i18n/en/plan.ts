/** The recommendation page, the watchlist sheet and the pick card on the investing Home. */
export const plan = {
  title: 'Recommendation',
  buyThis: (name: string) => `Buy ${name}`,
  buyThisHint: 'Opens the Buy sheet: fill in units and price from your contract note. The money comes out of the investment pot.',

  /** The three styles, by their key in services/advisor/model.ts. */
  styles: {
    income: 'Steady dividends',
    cash: 'Big payouts',
    price: 'Share price',
  },

  // Style
  yourStyle: 'Your style',
  setStyleTitle: 'Set your style first',
  setStyleBody:
    'Six quick questions decide how much weight steady dividends, big payouts and the share price each get in the pick.',
  setStyle: 'Set my style',

  // Watchlist on the page
  emptyListTitle: 'No counters on your list',
  emptyListBody: 'The pick only ever comes from counters you would buy. Add a few to compare.',
  addCounters: 'Add counters',
  oneMore: 'Add at least one more counter — the pick is a comparison between them.',

  // Advisor status
  loading: 'Downloading price history',
  loadingProgress: (done: number, total: number) => `Downloading price history · ${done} / ${total}`,
  training: 'Testing the models on your list… this takes a few seconds the first time each month',
  unavailable: "Couldn't get price history right now — check your connection and try again",
  tryAgain: 'Try again',
  noScores: 'None of your counters has enough price history to be scored yet.',

  // The pick
  bestMatch: (month: string) => `Best match for your style · ${month}`,
  tag: { REIT: 'REIT', EQUITY: 'Share' },
  countsFor: 'Counts for it',
  countsAgainst: 'Counts against it',
  tie: (other: string) => `${other} is almost as good a match for your style — treat them as a tie.`,

  /** A reason is one plain sentence about the number that moved the score. */
  reason: {
    yield12: (p: string) => `Paid ${p} in dividends over the last year`,
    divUp: (p: string) => `Dividends up ${p} on the year before`,
    divDown: (p: string) => `Dividends down ${p} on the year before`,
    payCount: (n: number) => (n === 1 ? 'Pays about once a year' : `Pays about ${n} times a year`),
    payNone: 'Has not paid a dividend in the last 3 years',
    noCuts: 'No dividend cuts in the last 3 years',
    cuts: (n: number) => `Cut its dividend ${n} time${n === 1 ? '' : 's'} in the last 3 years`,
    belowHigh: (p: string) => `${p} below its 52-week high`,
    atHigh: 'At its 52-week high',
    aboveMa: 'Above its 6-month average price',
    belowMa: 'Below its 6-month average price',
    up3: (p: string) => `Up ${p} over 3 months`,
    down3: (p: string) => `Down ${p} over 3 months`,
    up12: (p: string) => `Up ${p} over 12 months`,
    down12: (p: string) => `Down ${p} over 12 months`,
    vol: (p: string) => `Price moves about ${p} a month`,
    modestYield: (p: string) => `A modest yield (${p}) — modest yields are cut less often`,
    highYield: (p: string) => `A high yield (${p}) — high yields are cut more often`,
    lowYield: (p: string) => `Only paid ${p} in dividends over the last year`,
    bigJump: (p: string) => `Dividends jumped ${p} — jumps that big often don't last`,
    steadier: 'Its price moves less than most',
    swingsMore: (p: string) => `Its price swings more than most (about ${p} a month)`,
  },

  // Ranked list
  ranked: 'Your list, ranked',
  facts: {
    yield: (p: string) => `yield ${p}`,
    noCuts: 'no cuts in 3 yrs',
    cuts: (n: number) => `${n} cut${n === 1 ? '' : 's'} in 3 yrs`,
    ret12: (p: string) => `12m ${p}`,
  },
  notScored: 'Not enough price history to score yet',

  // Record
  recordTitle: 'How often each part has been right',
  recordWhat: {
    income: 'pick kept its dividend',
    cash: 'pick out-paid the list',
    price: 'pick beat the list’s total return',
  },
  rightRandom: (right: string, random: string) => `right ${right} · random ${random}`,
  noRecord: 'Not enough history on your list to test this yet',
  recordTested: (from: string, to: string) =>
    `Tested month by month on your list, ${from} – ${to}, using only what was known at the time.`,
  recordBeat: (styles: string, n: number) =>
    `The ${styles} part${n === 1 ? ' has' : 's have'} beaten a random pick.`,
  recordNotBeat: (styles: string, n: number) =>
    `The ${styles} part${n === 1 ? ' has' : 's have'} not — the more weight you give ${n === 1 ? 'it' : 'them'}, the closer the pick is to a coin toss.`,
  /** Joins style names in a sentence: "Steady dividends and Big payouts". */
  and: ' and ',
  disclaimer: "A model's estimate from past prices and dividends — not a promise, and not financial advice.",

  // Watchlist sheet
  watch: {
    title: "Counters you'd buy",
    hint: 'The pick only ever comes from this list. No percentages to set.',
    search: 'Add a counter, e.g. maxis',
    searching: 'Searching…',
    noMatch: 'Nothing on Bursa matched. Try the four-digit code.',
    added: 'On your list',
    addHeld: 'Add what you already hold',
    addHeldHint: (n: number) => `${n} counter${n === 1 ? '' : 's'} from your trades`,
    lot: (price: string, lot: string) => `${price} · a lot is ${lot}`,
    remove: (name: string) => `Remove ${name}`,
    add: (name: string) => `Add ${name}`,
    empty: 'Nothing on your list yet.',
    needsHistory: 'Each counter needs a few years of prices before it can be scored.',
    couldNotSave: 'Could not save your list. Check your connection.',
  },

  // Home card
  card: {
    pick: (month: string) => `${month} pick`,
    bestMatchFor: (mix: string) => `Best match for ${mix}`,
    setUp: 'Set up recommendations',
    setUpHint: 'Answer six questions and pick the counters you would buy.',
    addCounters: "Add counters you'd buy",
    addCountersHint: 'The pick is a comparison, so it needs at least two.',
    noPick: 'No pick this month yet',
    working: "Working out this month's pick…",
    unavailable: 'Pick unavailable right now',
    unavailableHint: 'Price history could not be downloaded. Tap to try again.',
  },
};
