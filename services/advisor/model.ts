/**
 * The monthly pick, as arithmetic.
 *
 * Three logistic regressions, one for each thing a person might want from a
 * share, each trained on Bursa history the phone downloads itself:
 *
 *   income — 股息派: will the next year's dividends be at least 95% of the last
 *   cash   — 现金流派: will its dividend yield beat the rest of the list
 *   price  — 股价派: will its total return beat the rest of the list
 *
 * Everything is walked forward: a model scoring a month only ever saw months
 * whose outcome was already known by then. The same walk is what produces the
 * record shown beside every pick, so the record is not a claim — it is what
 * this exact code did, month by month, on the person's own list.
 *
 * Dividends are counted by payment, not by calendar window. A company that
 * pays in March and September looks like it halved its dividend every
 * September if the window is "the last twelve months" and this year's payment
 * is a week late. Comparing the latest year's worth of payments with the year's
 * worth before them does not have that problem.
 *
 * Nothing in here touches the network, React, or the clock.
 */

export interface MonthlySeries {
  /** "YYYY-MM" of the first row; rows are consecutive months. */
  start: string;
  /** Month-end close in ringgit, split-adjusted. */
  closes: number[];
  /** Dividend paid in each month, per share, in ringgit (0 when none). */
  divs: number[];
}

export type Style = 'income' | 'cash' | 'price';
export const STYLES: Style[] = ['income', 'cash', 'price'];

export const BASE_FEATURES = ['yield12', 'dist52', 'vsMA6', 'mom3', 'mom12', 'vol12'] as const;
export const DIVIDEND_FEATURES = ['yield12', 'divGrowth', 'payCount12', 'cuts3y', 'dist52', 'mom12', 'vol12'] as const;
export type Feature = (typeof BASE_FEATURES)[number] | (typeof DIVIDEND_FEATURES)[number];

const FEATURES_FOR: Record<Style, readonly Feature[]> = {
  income: DIVIDEND_FEATURES,
  cash: DIVIDEND_FEATURES,
  price: BASE_FEATURES,
};

/** How far ahead the outcome is judged: a year, plus a quarter's grace for late payments. */
export const HORIZON = 15;
export const MIN_TRAIN_MONTHS = 60;
/** Where the training starts; Yahoo's dividend records before this are patchy. */
export const TRAIN_FROM = '2008-01';

export const monthKey = (start: string, offset: number) => {
  const [y, m] = start.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + offset, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

export const monthIndex = (start: string, key: string) => {
  const [y0, m0] = start.split('-').map(Number);
  const [y1, m1] = key.split('-').map(Number);
  return (y1 - y0) * 12 + (m1 - m0);
};

/* --------------------------------------------------------------- features */

export type Features = Record<Feature, number> & { dividendsLastYear: number; paysPerYear: number };

const sumDiv = (s: MonthlySeries, from: number, to: number) => {
  let d = 0;
  for (let x = Math.max(0, from); x <= to; x++) d += s.divs[x] ?? 0;
  return d;
};

const totalReturn = (s: MonthlySeries, i: number, j: number) => (s.closes[j] + sumDiv(s, i + 1, j)) / s.closes[i] - 1;

/** Payments (amounts) made in months `from`..`to`. */
const payments = (s: MonthlySeries, from: number, to: number) => {
  const out: number[] = [];
  for (let x = Math.max(0, from); x <= to; x++) if ((s.divs[x] ?? 0) > 0) out.push(s.divs[x]);
  return out;
};

/** A monthly close that jumps 80% or halves overnight is a data error, not a market. */
const jumpAt = (s: MonthlySeries, x: number) => {
  if (x <= 0 || x >= s.closes.length) return false;
  const r = s.closes[x] / s.closes[x - 1];
  return r > 1.8 || r < 0.45;
};

/** Payments per year, from the last three years. */
export const paysPerYear = (s: MonthlySeries, i: number) => Math.max(1, Math.round(payments(s, i - 35, i).length / 3));

/** The sum of a year's worth of payments, `skip` payments back from month i. Null if there were not that many. */
const yearOfPayments = (s: MonthlySeries, i: number, perYear: number, skip: number) => {
  const all = payments(s, 0, i);
  const end = all.length - skip;
  return end - perYear < 0 ? null : all.slice(end - perYear, end).reduce((a, b) => a + b, 0);
};

export const featuresAt = (s: MonthlySeries, i: number, lookahead = 0): Features | null => {
  if (i < 36 || i >= s.closes.length) return null;
  for (let x = i - 36; x <= Math.min(s.closes.length - 1, i + lookahead); x++) if (jumpAt(s, x)) return null;

  const closes = s.closes.slice(i - 11, i + 1);
  const rets = closes.slice(1).map((c, x) => (c + (s.divs[i - 10 + x] ?? 0)) / closes[x] - 1);
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;

  const perYear = paysPerYear(s, i);
  // A counter that has paid nothing for over a year has no current dividend,
  // however much it used to pay.
  const paidRecently = payments(s, i - 14, i).length > 0;
  const d0 = paidRecently ? yearOfPayments(s, i, perYear, 0) ?? 0 : 0;
  const d1 = yearOfPayments(s, i, perYear, perYear) ?? 0;
  const d2 = yearOfPayments(s, i, perYear, 2 * perYear) ?? 0;
  const d3 = yearOfPayments(s, i, perYear, 3 * perYear) ?? 0;
  const cut = (now: number, before: number) => (before > 0 && now < 0.95 * before ? 1 : 0);

  return {
    yield12: d0 / s.closes[i],
    dist52: s.closes[i] / Math.max(...closes) - 1,
    vsMA6: s.closes[i] / (closes.slice(6).reduce((a, b) => a + b, 0) / 6) - 1,
    mom3: totalReturn(s, i - 3, i),
    mom12: totalReturn(s, i - 12, i),
    vol12: Math.sqrt(rets.reduce((a, r) => a + (r - mean) ** 2, 0) / rets.length),
    divGrowth: d1 > 0 ? Math.max(-1, Math.min(3, d0 / d1 - 1)) : 0,
    payCount12: payments(s, i - 35, i).length / 3,
    cuts3y: cut(d0, d1) + cut(d1, d2) + cut(d2, d3),
    dividendsLastYear: d0,
    paysPerYear: perYear,
  };
};

/* ------------------------------------------------------------------ panel */

export interface PanelRow {
  symbol: string;
  x: Features;
  /** Cross-sectional z-scores, per feature set. */
  zBase: number[];
  zDiv: number[];
  /** Outcomes, known only for months at least HORIZON old. */
  fwdYield: number;
  fwdReturn: number;
  kept: 0 | 1;
  payer: boolean;
}

export interface PanelMonth {
  key: string;
  rows: PanelRow[];
}

const zScore = (rows: { x: Features }[], features: readonly Feature[]) =>
  rows.map((row) =>
    features.map((f) => {
      const values = rows.map((r) => r.x[f]);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length) || 1;
      return Math.max(-4, Math.min(4, (row.x[f] - mean) / sd));
    })
  );

/**
 * Every month in which enough counters have both a known past and a known
 * future. Used for training and for the walk-forward record.
 */
export const buildPanel = (universe: Record<string, MonthlySeries>, from = TRAIN_FROM): PanelMonth[] => {
  const keys = new Set<string>();
  for (const s of Object.values(universe)) for (let i = 0; i < s.closes.length; i++) keys.add(monthKey(s.start, i));

  const panel: PanelMonth[] = [];
  for (const key of [...keys].sort()) {
    if (key < from) continue;
    const rows: Omit<PanelRow, 'zBase' | 'zDiv'>[] = [];
    for (const [symbol, s] of Object.entries(universe)) {
      const i = monthIndex(s.start, key);
      if (i < 0 || i + HORIZON >= s.closes.length) continue;
      const x = featuresAt(s, i, HORIZON);
      if (!x) continue;
      const nextYear = payments(s, i + 1, i + HORIZON).slice(0, x.paysPerYear).reduce((a, b) => a + b, 0);
      rows.push({
        symbol,
        x,
        fwdYield: nextYear / s.closes[i],
        fwdReturn: totalReturn(s, i, i + 12),
        kept: x.dividendsLastYear > 0 && nextYear >= 0.95 * x.dividendsLastYear ? 1 : 0,
        payer: x.dividendsLastYear > 0,
      });
    }
    if (rows.length < 4) continue;
    const zb = zScore(rows, BASE_FEATURES);
    const zd = zScore(rows, DIVIDEND_FEATURES);
    panel.push({ key, rows: rows.map((r, j) => ({ ...r, zBase: zb[j], zDiv: zd[j] })) });
  }
  return panel;
};

/* --------------------------------------------------------------- labelling */

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);

/** The rows a style can judge, and each one's outcome: 1 if it did what that style wants. */
export const labelled = (style: Style, rows: PanelRow[]) => {
  if (style === 'income') {
    const payers = rows.filter((r) => r.payer);
    return payers.map((r) => ({ row: r, y: r.kept }));
  }
  if (style === 'cash') {
    const avg = mean(rows.map((r) => r.fwdYield));
    return rows.map((r) => ({ row: r, y: r.fwdYield > avg ? 1 : 0 }));
  }
  const avg = mean(rows.map((r) => r.fwdReturn));
  return rows.map((r) => ({ row: r, y: r.fwdReturn > avg ? 1 : 0 }));
};

export const zFor = (style: Style, row: Pick<PanelRow, 'zBase' | 'zDiv'>) => (style === 'price' ? row.zBase : row.zDiv);

/* -------------------------------------------------------- the regression */

const solve = (A: number[][], b: number[]) => {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) continue;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => (Math.abs(row[i]) < 1e-12 ? 0 : row[n] / row[i]));
};

/**
 * L2-regularised logistic regression by Newton's method: the exact optimum in
 * a handful of steps. Returns [intercept, ...weights].
 */
export const fitLogistic = (X: number[][], Y: number[], lambda = 1): number[] => {
  const p = (X[0]?.length ?? 0) + 1;
  let w = new Array(p).fill(0);
  if (X.length === 0) return w;
  for (let it = 0; it < 25; it++) {
    const g = new Array(p).fill(0);
    const H = Array.from({ length: p }, () => new Array(p).fill(0));
    for (let i = 0; i < X.length; i++) {
      const x = [1, ...X[i]];
      let z = 0;
      for (let j = 0; j < p; j++) z += x[j] * w[j];
      const mu = 1 / (1 + Math.exp(-z));
      const s = mu * (1 - mu);
      for (let a = 0; a < p; a++) {
        g[a] += (mu - Y[i]) * x[a];
        for (let b = a; b < p; b++) H[a][b] += s * x[a] * x[b];
      }
    }
    for (let a = 1; a < p; a++) {
      g[a] += lambda * w[a];
      H[a][a] += lambda;
    }
    for (let a = 0; a < p; a++) for (let b = 0; b < a; b++) H[a][b] = H[b][a];
    const step = solve(H, g);
    w = w.map((v, j) => v - step[j]);
    if (Math.max(...step.map(Math.abs)) < 1e-8) break;
  }
  return w;
};

export const probability = (w: number[], z: number[]) => {
  let s = w[0];
  for (let j = 0; j < z.length; j++) s += z[j] * w[j + 1];
  return 1 / (1 + Math.exp(-s));
};

const trainOn = (style: Style, months: PanelMonth[]) => {
  const X: number[][] = [];
  const Y: number[] = [];
  for (const month of months) {
    for (const { row, y } of labelled(style, month.rows)) {
      X.push(zFor(style, row));
      Y.push(y);
    }
  }
  return fitLogistic(X, Y);
};

/* ------------------------------------------------------- walk-forward fits */

/**
 * For every month that has enough history before it, the weights a model
 * would have had then — trained only on months whose outcome was known.
 * This is the slow part; it depends only on the universe, so it is computed
 * once a month and reused for any watchlist.
 */
export const walkForwardWeights = (panel: PanelMonth[], style: Style) => {
  const out: { index: number; weights: number[] }[] = [];
  for (let t = 0; t < panel.length; t++) {
    const known = panel.slice(0, Math.max(0, t - HORIZON + 1));
    if (known.length < MIN_TRAIN_MONTHS) continue;
    out.push({ index: t, weights: trainOn(style, known) });
  }
  return out;
};

/** Today's weights: trained on every month whose outcome is known. */
export const trainFinal = (panel: PanelMonth[], style: Style) => trainOn(style, panel);

export interface StyleRecord {
  /** Months the model picked from the list. */
  months: number;
  /** How often its pick did what the style wants. */
  hitRate: number;
  /** How often a random pick from the same list did. */
  randomRate: number;
  from: string | null;
  to: string | null;
}

/**
 * How often this style's pick from *this* list was right, month by month,
 * using the weights it would have had at the time. Fewer than 24 months of
 * testable history is reported as no record at all rather than a number.
 */
export const recordFor = (
  panel: PanelMonth[],
  style: Style,
  fits: { index: number; weights: number[] }[],
  watchlist: string[]
): StyleRecord | null => {
  const watch = new Set(watchlist);
  let hits = 0;
  let random = 0;
  let months = 0;
  let from: string | null = null;
  let to: string | null = null;
  for (const { index, weights } of fits) {
    const month = panel[index];
    const mine = month.rows.filter((r) => watch.has(r.symbol));
    if (mine.length < 2) continue;
    const judged = labelled(style, mine);
    if (judged.length < 2) continue;
    const pick = judged.reduce((best, cur) =>
      probability(weights, zFor(style, cur.row)) > probability(weights, zFor(style, best.row)) ? cur : best
    );
    hits += pick.y;
    random += mean(judged.map((j) => j.y));
    months += 1;
    from = from ?? month.key;
    to = month.key;
  }
  if (months < 24) return null;
  return { months, hitRate: hits / months, randomRate: random / months, from, to };
};

/* ------------------------------------------------------------------- today */

export interface ScoredCounter {
  symbol: string;
  x: Features;
  /** Each style's probability that this counter does what that style wants. */
  chance: Record<Style, number>;
  /** Each feature's push on each style's score (weight × z), for the reasons. */
  push: Record<Style, Partial<Record<Feature, number>>>;
}

/**
 * Scores the list as it stands now. `livePrices` replaces the latest close
 * with the price on the screen, so the pick moves with the market rather than
 * waiting for the month to end. The comparison is against every counter in
 * the universe that has a price this month, the same way training compared.
 */
export const scoreNow = (
  universe: Record<string, MonthlySeries>,
  watchlist: string[],
  weights: Record<Style, number[]>,
  livePrices: Record<string, number> = {}
): ScoredCounter[] => {
  const latest = Object.values(universe).reduce((k, s) => {
    const last = monthKey(s.start, s.closes.length - 1);
    return last > k ? last : k;
  }, '');

  const now = Object.entries(universe)
    .map(([symbol, s]) => {
      if (monthKey(s.start, s.closes.length - 1) !== latest) return null;
      const live = livePrices[symbol];
      const series = live && live > 0 ? { ...s, closes: [...s.closes.slice(0, -1), live] } : s;
      const x = featuresAt(series, series.closes.length - 1);
      return x ? { symbol, x } : null;
    })
    .filter((r): r is { symbol: string; x: Features } => r !== null);
  if (now.length < 4) return [];

  const zb = zScore(now, BASE_FEATURES);
  const zd = zScore(now, DIVIDEND_FEATURES);
  const watch = new Set(watchlist);

  return now
    .map((row, j) => ({ ...row, zBase: zb[j], zDiv: zd[j] }))
    .filter((row) => watch.has(row.symbol))
    .map((row) => {
      const chance = {} as Record<Style, number>;
      const push = {} as Record<Style, Partial<Record<Feature, number>>>;
      for (const style of STYLES) {
        const z = zFor(style, row);
        chance[style] = probability(weights[style], z);
        push[style] = Object.fromEntries(FEATURES_FOR[style].map((f, k) => [f, z[k] * weights[style][k + 1]]));
      }
      return { symbol: row.symbol, x: row.x, chance, push };
    });
};

/* ------------------------------------------------------------------ blend */

export interface BlendedCounter extends ScoredCounter {
  /** How far above the list's average this counter sits, weighted by the mix. */
  score: number;
  /** The same, stretched to 0–100 across the list, for display only. */
  match: number;
}

/**
 * Combines the three models by the mix. Each model contributes how far a
 * counter sits above or below the list's average chance — not stretched to a
 * common scale, so a model that can barely tell the counters apart moves the
 * pick very little.
 */
export const blend = (scored: ScoredCounter[], mix: Record<Style, number>): BlendedCounter[] => {
  const averages = Object.fromEntries(STYLES.map((s) => [s, mean(scored.map((c) => c.chance[s]))])) as Record<Style, number>;
  const withScore = scored.map((c) => ({
    ...c,
    score: STYLES.reduce((sum, s) => sum + (mix[s] / 100) * (c.chance[s] - averages[s]), 0),
  }));
  const lo = Math.min(...withScore.map((c) => c.score));
  const hi = Math.max(...withScore.map((c) => c.score));
  return withScore
    .map((c) => ({ ...c, match: hi > lo ? Math.round(((c.score - lo) / (hi - lo)) * 100) : 50 }))
    .sort((a, b) => b.score - a.score);
};

/**
 * The reasons shown under a pick: for each style with real weight in the mix,
 * the feature that pushed that style's score up the most; and the single
 * biggest push down overall. Tiny pushes are not reasons.
 */
export const reasonsFor = (counter: ScoredCounter, mix: Record<Style, number>) => {
  const forIt: { style: Style; feature: Feature }[] = [];
  const against: { style: Style; feature: Feature; weight: number }[] = [];
  for (const style of STYLES) {
    if (mix[style] < 15) continue;
    const pushes = Object.entries(counter.push[style]).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)) as [Feature, number][];
    if (pushes.length === 0) continue;
    if (pushes[0][1] > 0.02) forIt.push({ style, feature: pushes[0][0] });
    const worst = pushes[pushes.length - 1];
    if (worst[1] < -0.02) against.push({ style, feature: worst[0], weight: worst[1] * mix[style] });
  }
  against.sort((a, b) => a.weight - b.weight);
  return { forIt, against: against.slice(0, 1) };
};

/* ------------------------------------------------------------ the questions */

/** Points each answer gives each style, question by question, in the order they are asked. */
export const QUESTION_POINTS: Partial<Record<Style, number>>[][] = [
  [{ cash: 3 }, { income: 3 }, { price: 3 }],
  [{ price: 1, cash: 1 }, { income: 2, cash: 1 }, { income: 1, cash: 1, price: 1 }],
  [{ income: 2 }, { income: 1, cash: 1 }, { price: 2 }],
  [{ income: 2 }, { cash: 1 }, { price: 1 }],
  [{ cash: 3 }, { price: 3 }],
  [{ price: 1 }, { income: 1, cash: 1 }, { income: 2 }],
];

/**
 * The mix the answers come to, in whole 5% steps that add up to exactly 100.
 * Rounding leaves a few percent over; they go to the style with the most
 * points, the same way a split's leftover sen goes to the biggest share.
 */
export const mixFromAnswers = (answers: number[]): Record<Style, number> => {
  const points: Record<Style, number> = { income: 0, cash: 0, price: 0 };
  answers.forEach((a, q) => {
    const given = QUESTION_POINTS[q]?.[a];
    if (given) for (const s of STYLES) points[s] += given[s] ?? 0;
  });
  const total = points.income + points.cash + points.price;
  if (total === 0) return { income: 34, cash: 33, price: 33 };
  const mix = Object.fromEntries(STYLES.map((s) => [s, Math.floor((points[s] / total) * 20) * 5])) as Record<Style, number>;
  const top = STYLES.reduce((best, s) => (points[s] > points[best] ? s : best), STYLES[0]);
  mix[top] += 100 - mix.income - mix.cash - mix.price;
  return mix;
};

/**
 * Moving one slider moves the other two in proportion, so the three always add
 * to 100 in 5% steps.
 */
export const adjustMix = (mix: Record<Style, number>, style: Style, value: number): Record<Style, number> => {
  const v = Math.max(0, Math.min(100, Math.round(value / 5) * 5));
  const others = STYLES.filter((s) => s !== style);
  const rest = mix[others[0]] + mix[others[1]];
  const left = 100 - v;
  const first = rest > 0 ? Math.round(((mix[others[0]] / rest) * left) / 5) * 5 : Math.round(left / 10) * 5;
  return { ...mix, [style]: v, [others[0]]: first, [others[1]]: left - first } as Record<Style, number>;
};
