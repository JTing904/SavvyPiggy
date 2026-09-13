/**
 * The two things asked before a first buy: what someone wants from shares
 * (the style questions and the mix they come to), and where they buy (so the
 * fees can be filled in).
 */
export const setup = {
  styleTitle: 'Your style',
  notNow: 'Not now',
  gate: 'Answer six questions before your first buy. Picks are matched to what you want from shares.',
  questionOf: (n: number, total: number) => `Question ${n} of ${total}`,
  seeMyStyle: 'See my style',

  /** In the order of QUESTION_POINTS in services/advisor/model.ts — the answers are stored by position. */
  questions: [
    {
      text: 'What do you mainly want from shares?',
      options: ['As much dividend as possible each year', 'Money coming in steadily, on schedule', 'The share price going up'],
    },
    {
      text: 'What do you usually do with dividends?',
      options: ['Buy more shares', 'Spend it or cover living costs', "Haven't thought about it"],
    },
    {
      text: 'The price drops 20%, but dividends keep coming. You…',
      options: ["Don't mind — the dividends still come", 'Feel a bit worried', 'Want to sell'],
    },
    {
      text: 'How often would you like to be paid?',
      options: ['As often as possible, like every quarter', 'Once or twice a year is fine', "Doesn't matter"],
    },
    {
      text: 'Pick one:',
      options: ['6% dividend yield, price barely moves for years', '2% dividend yield, price rises 8% a year'],
    },
    {
      text: 'How long do you plan to hold?',
      options: ['Under a year', '1 to 5 years', 'More than 5 years'],
    },
  ] as { text: string; options: string[] }[],

  fromAnswers: 'From your answers',
  mixHint: 'Drag to adjust. The three always add up to 100%.',
  styles: {
    income: { name: 'Steady dividends', blurb: 'Dividends that keep coming and are not cut.' },
    cash: { name: 'Big payouts', blurb: 'The highest dividend yield for your money.' },
    price: { name: 'Share price', blurb: 'Total return, mostly from the price going up.' },
  },
  record: (hit: string, random: string) => `Past record on your list: right ${hit} · random ${random}`,
  noBetter: ' — no better than chance',
  noRecord: 'Not enough history on your list to test this yet',
  redoQuestions: 'Redo the questions',
  continueToBuy: 'Continue to buy',
  redoNote: 'You can redo this any time from Profile or the monthly buy page.',

  brokerTitle: 'Your broker',
  brokerFirstTitle: 'Where do you buy?',
  brokerHint: "Fees are worked out from your broker's published rates. You can change this later.",
  brokerFirstHint: "We'll fill in the fees for every trade from your broker's published rates. You can change this later.",
  percentMin: (pct: string, min: string) => `${pct}, minimum ${min}`,
  percentPlusFlat: (pct: string, flat: string) => `${pct} + ${flat} platform fee per order`,
  tierUnder: (fee: string, upTo: string) => `${fee} under ${upTo}`,
  tierFrom: (fee: string, from: string) => `${fee} from ${from}`,
  notListed: "Mine isn't listed",
  notListedHint: "Enter your broker's rates yourself",
  customName: 'My own rates',
  percentLabel: 'Brokerage (%)',
  minimumLabel: 'Minimum per trade (RM)',
  flatLabel: 'Flat fee per order (RM)',
  optional: 'Optional',
  useTheseRates: 'Use these rates',
  customError: {
    percent: 'Enter a percentage from 0 to 2.',
    minimum: 'Enter a minimum from RM0 to RM100.',
    flat: 'Enter a flat fee from RM0 to RM100.',
    both: 'Enter a minimum or a flat fee, not both.',
  },
  brokerNote:
    "Rates read from each broker's own pricing page on 13 Sep 2026, for ordinary Bursa shares. REITs also pay 8% SST on brokerage and clearing. Your contract note is always the final word.",
};
