/** Trades, the trade sheet, Dividends and Growth. */
export const invest = {
  /** How a trade of each kind is named in a sentence or a title. */
  kind: {
    buy: 'Buy',
    sell: 'Sell',
    dividend: 'Dividend',
  },
  /** The chip on a trade row. */
  tag: {
    buy: 'BUY',
    sell: 'SELL',
    dividend: 'DIVIDEND',
  },
  /** "TODAY, SEP 8": the lead and the date arrive already uppercased. */
  dayHeading: (lead: string, date: string) => `${lead}, ${date}`,
  unitsOnExDate: 'Units on the ex-date',
  perUnit: 'Per unit',

  // Trades
  tradesTitle: 'Trades',
  noTrades: 'No trades yet',
  noTradesBody:
    'Record a buy with the button below. Every trade keeps the day it was done, which is what decides who a dividend belongs to.',
  tradesFooter:
    'Tap any trade to change its date, units or price — or to delete it. Units and cost are worked out again from the whole list.',

  // Trade sheet
  tradeCorrected: (name: string) => `${name} trade corrected.`,
  tradeRecorded: (kind: string, units: number, name: string) => `${kind} recorded · ${units} units of ${name}.`,
  couldNotSave: 'Could not save that.',
  couldNotDelete: 'Could not delete that.',
  deleteTitle: 'Delete this trade?',
  deleteBody:
    'The position is worked out again from the remaining trades, so your units and average cost will move.',
  tradeDeleted: 'Trade deleted.',
  editTitle: (kind: string) => `Edit · ${kind}`,
  dividendIntro:
    'This is the record of a payment the app made into your goals. The money itself lives in your history — if the amount that reached your account was different, correct it there.',
  editIntro:
    'Fixing one trade leaves every other one alone, so how many units you held on a past ex-date is worked out again from scratch — correctly.',
  buyIntro:
    'Recording the day it was done, not the day you typed it in. That date is what a dividend is decided on.',
  sellIntro:
    'Selling after an ex-date still leaves that dividend yours, which is why the date matters here too.',
  paidOn: 'Paid on',
  paidIntoGoals: 'Paid into your goals',
  dividendReceiptNote:
    'Companies deduct tax and fees, so what reaches your account is often less than what was announced. The money is an ordinary deposit in your history — correct the amount there and every figure follows.',
  whichCounter: 'Which counter',
  nothingToSell: 'Nothing is held right now, so there is nothing to sell.',
  counter: 'Counter',
  searchPlaceholder: 'Name or code, e.g. maybank',
  searching: 'Searching…',
  noMatch: 'Nothing on Bursa matched. Try the four-digit code.',
  tradeDate: 'Trade date',
  whenWasTrade: 'When was this trade?',
  whenWasTradeHint: 'The day you dealt decides which dividends are yours.',
  units: 'Units',
  pricePerUnit: 'Price per unit',
  thisTrade: 'This trade',
  afterThis: (name: string) => `${name} after this`,
  unitsChange: (before: string, after: string) => `${before} → ${after} units`,
  averageCost: 'Average cost',
  saleChangesNothing: 'Nothing was held on that date, so this sale changes nothing. Check the date.',
  record: {
    buy: 'Record this buy',
    sell: 'Record this sell',
    dividend: 'Record this dividend',
  },
  deleteTrade: 'Delete this trade',

  // Dividends
  dividendsTitle: 'Dividends',
  notConnected: 'Not connected yet',
  notConnectedBody:
    'Ex-dates and pay dates come from a small service of your own, because no free API carries them for Bursa. Until its address is set, nothing is fetched and nothing is credited — your trades are still recorded with the dates a dividend would be worked out from.',
  yieldHeading: 'YIELD ON WHAT YOU PAID',
  yieldLine: (paid: string, cost: string) => `${paid} paid on ${cost} of cost, last 12 months`,
  yieldNote:
    'This is what the holding returns against what you actually paid for it — not the yield a quote screen shows, which moves with the share price and says nothing about your cost.',
  receivedSoFar: 'Received so far',
  acrossPayments: (n: number) => `across ${n} payment${n === 1 ? '' : 's'}`,
  declaredNext12: 'Declared, next 12 months',
  alreadyYours: 'Already yours — ex-date has passed',
  ifStillHeld: 'If you still hold on the ex-date',
  declaredNote:
    'Only what has actually been announced. A counter that has declared nothing for a quarter adds nothing here — this is not a forecast.',
  comingUp: 'COMING UP',
  nothingAnnounced:
    'Nothing announced for the counters you hold. A dividend appears here as soon as the company declares it, and is paid into your goals on its pay date.',
  couldNotFetch:
    'Announcements could not be fetched, so this is not a list of nothing — it is no answer at all. Pull the refresh above once you are back online.',
  exDate: 'Ex-date',
  payDate: 'Pay date',
  comesTo: 'Comes to',
  owedToYou: 'Owed to you',
  notYours:
    'Nothing was held before this ex-date, so this one is not yours. Buying now does not qualify — the shares had to be held the day before.',
  paidIn: 'PAID IN',
  dividendsFooter:
    'A dividend belongs to whoever held the shares the day before the ex-date, so these are worked out from your trade log rather than from what you hold today. Companies deduct tax and fees — if the amount that reaches your account differs, correct that payment in Trades.',

  // Growth
  growthTitle: 'Growth',
  nothingToMeasure: 'Nothing to measure yet',
  nothingToMeasureBody: 'Record a buy and this will show what the investing has come to.',
  totalReturn: 'Total return',
  returnOn: (percent: string, invested: string) => `${percent}% on ${invested} put in`,
  onHeld: 'On what you still hold',
  onHeldNote: 'Paper gain, moves with the market',
  onSold: 'On what you have sold',
  onSoldNote: 'Banked, cannot change',
  dividendsPaidIn: 'Dividends paid in',
  dividendsPaidInNote: 'Already split into your goals',
  heldNow: 'Held now',
  cost: (amount: string) => `cost ${amount}`,
  income: 'Income',
  ofCost: (percent: number) => `${percent}% of cost`,
  noPositions: 'no positions',
  overTime: 'OVER TIME',
  chartLabel: 'Cost and value by month',
  whatItCost: 'What it cost',
  whatItWasWorth: 'What it was worth',
  chartNote: (recorded: string) =>
    `Cost is replayed from your trades, so it goes back as far as they do. Value is different: the app can only record what a month ended at once that month has ended, so ${recorded}. Nothing before that is drawn, because nothing before that is known.`,
  noMonthRecorded: 'no month has been recorded yet',
  oneMonthRecorded: (month: string) => `only ${month} has been recorded — the line starts once a second month has`,
  lineStartsAt: (month: string) => `the line starts at ${month}`,
  byCounter: 'BY COUNTER',
  shareOfPortfolio: (percent: number, units: string) => `${percent}% of the portfolio · ${units}`,
  growthFooter:
    'Dividends are counted here as income, and they have already been split into your goals — so they show in your savings as well. This screen is about the investing; it is not added to your total savings anywhere.',
};
