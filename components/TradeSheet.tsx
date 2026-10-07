import { safeGoalIcon } from '../services/goalIcons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Activity, Dividend, InvestSettings, Loan, PiggyBank, SavingsSettings, Trade } from '../types';
import {
  averageCostCents,
  buildHoldings,
  dayStart,
  normalizeSymbol,
  pricePointsOf,
  replay,
  tradeCents,
  tradeTotalCents,
  type Quote,
  type Quotes,
} from '../services/holdings';
import { loadQuotes, searchSymbols, type SymbolHit } from '../services/quotes';
import { saveInvest, saveTrade, TradeMoneyError, type TradeWrite } from '../services/firestore';
import { formatMoney, fromCents, toCents } from '../services/money';
import {
  brokerById,
  cleanFeeInput,
  CUSTOM_BROKER_ID,
  FEE_KEYS,
  feesFor,
  securityTypeOf,
  totalFees,
  valueCents,
  ZERO_FEES,
  type FeeKey,
  type SecurityType,
  type TradeFees,
} from '../services/fees';
import { planTradeMoney, stampOf, type MoneyChoice, type TradeMoneyProblem } from '../services/tradeMoney';
import { dividendsAfterChange, type CreditedDividend } from '../services/dividends';
import { planDividendCorrection, planDividendRemoval } from '../services/dividendCorrection';
import { dividendProblemText } from '../services/problemText';
import { applyHint, needsQuoteFetch, priceText, showHint, typePrice, type AgoUnit } from '../services/quoteHint';
import { feeEditsOf, feeMismatch, type FeeMismatch } from '../services/feePrompt';
import { isInSplit, type GoneShareChoice } from '../services/ledger';
import { newShortSale, type ShortSale } from '../services/tradeCheck';
import { fromInputDate, toInputDate } from '../services/calendar';
import { useConfirm } from '../contexts/ConfirmContext';
import DateField from './DateField';
import RefundSheet, { ChoiceRow } from './invest/RefundSheet';
import FeeMismatchSheet from './invest/FeeMismatchSheet';
import GoneShareSheet from './GoneShareSheet';
import { useT } from '../contexts/LanguageContext';
import { dateLocale } from '../i18n';
import { Icon } from './ui/Icon';
import { NumberPad } from './ui/NumberPad';
import { Sheet } from './ui/Sheet';

/**
 * What the sheet has been opened to do. Recording a trade and correcting one
 * ask for the same things — a date, units, a price, the fees and where the
 * money comes from or goes — so they share a form; only what happens on Save
 * differs. A new trade can arrive filled in (from the monthly buy), and every
 * pre-filled value is still only a suggestion the person can change.
 */
export type TradeDraft =
  | {
      mode: 'new';
      kind: 'buy' | 'sell';
      symbol?: string;
      name?: string;
      units?: number;
      pricePoints?: number;
    }
  | { mode: 'edit'; trade: Trade };

interface TradeSheetProps {
  uid: string;
  /** The whole log, so the sheet can show what the position becomes. */
  trades: Trade[];
  /** To find the History row a trade wrote, which a correction rewrites. */
  activities: Activity[];
  banks: PiggyBank[];
  /** Every debt, settled ones included — undoing a sale can reopen one. */
  loans: Loan[];
  savings: SavingsSettings;
  invest: InvestSettings;
  /**
   * Dividends already paid in, and the announcements: correcting a trade can
   * move them. Null while still being read — nothing is saved until it is known.
   */
  credited?: CreditedDividend[] | null;
  dividends?: Dividend[];
  /** Alerts on the phone, so a corrected dividend's alert is only touched if it is still there. */
  alertIds?: string[];
  draft: TradeDraft;
  onClose: () => void;
  onDone: (message: string) => void;
  /** Opens broker settings (from the fee-mismatch prompt or a "Change" link next to the fees). */
  onEditBroker: () => void;
  /** Opens goal creation, for a sale that has nowhere to put its money yet. */
  onCreateGoal?: () => void;
  /** A save that was already shown as done but the server later refused. */
  onSyncError?: (e: unknown) => void;
  /** The investing cash in sen, for the dividend correction. Falls back to the settings' balance. */
  potCents?: number;
  /** The paid-in marker of the dividend being viewed; without it the dividend stays a read-only receipt. */
  dividendMarker?: CreditedDividend | null;
  /** Corrects what a dividend really paid. Resolves once the change is applied; throws to refuse. */
  onCorrectDividend?: (tradeId: string, newCents: number) => Promise<void>;
  /** Takes a dividend back out of the investing cash for good. */
  onRemoveDividend?: (tradeId: string) => Promise<void>;
  /** Last prices, for the hint under the price of a new trade. */
  quotes?: Quotes;
}

const money = (cents: number, opts?: { decimals?: 0 | 2; signed?: boolean }) =>
  formatMoney(fromCents(cents), opts);

const feeText = (cents: number) => (cents / 100).toFixed(2);

/** A fee as typed. Contract notes print to the sen, so that is what is kept. */
const parseFee = (text: string) => Math.max(0, Math.round((Number(text) || 0) * 100));

const NO_CREDITED: CreditedDividend[] = [];
const NO_DIVIDENDS: Dividend[] = [];

const sameChoice = (a: MoneyChoice, b: MoneyChoice) =>
  a.mode === b.mode && (a.mode !== 'goal' || (b.mode === 'goal' && a.goalId === b.goalId));

/** Which number the pad is typing into, or null when it is closed. */
type PadTarget = 'units' | 'price' | 'amount' | FeeKey | null;

/** A number shown in a box. Tapping it opens the app's pad below; the phone's keyboard never appears. */
const Field: React.FC<{
  label: string;
  value: string;
  onOpen: () => void;
  active: boolean;
  prefix?: string;
  placeholder?: string;
  compact?: boolean;
  /** Draws the box in the "typed over by hand" colour. */
  flagged?: boolean;
}> = ({ label, value, onOpen, active, prefix, placeholder = '0', compact, flagged }) => (
  <button type="button" onClick={onOpen} aria-pressed={active} className="block min-w-0 flex-1 text-left">
    <span className={`mb-1.5 block truncate px-1 font-bold text-mute ${compact ? 'text-[11.5px]' : 'text-[12.5px]'}`}>{label}</span>
    <span
      className={`flex items-center gap-2 bg-field ${compact ? 'min-h-12 rounded-2xl px-2.5' : 'min-h-14 rounded-[18px] px-4'} ${
        active ? 'outline outline-2 outline-ink' : flagged ? 'outline outline-2 outline-warn' : ''
      }`}
    >
      {prefix && <span className="shrink-0 font-bold text-mute">{prefix}</span>}
      <span className={`min-w-0 truncate font-extrabold tabular-nums ${compact ? 'text-[15px]' : 'text-[20px]'} ${value === '' ? 'text-mute' : 'text-ink'}`}>{value === '' ? placeholder : value}</span>
    </span>
  </button>
);

const Line: React.FC<{ label: string; value: string; strong?: boolean; tone?: string }> = ({ label, value, strong, tone }) => (
  <div className={`flex items-baseline gap-3 py-0.5 ${strong ? 'text-[15px]' : 'text-[13.5px]'}`}>
    <span className={`min-w-0 flex-1 ${strong ? 'font-extrabold' : 'font-medium text-mute'}`}>{label}</span>
    <span className={`shrink-0 text-right tabular-nums ${strong ? 'text-[18px] font-extrabold' : 'font-bold'} ${tone ?? ''}`}>{value}</span>
  </div>
);

const TradeSheet: React.FC<TradeSheetProps> = ({
  uid,
  trades,
  activities,
  banks,
  loans,
  savings,
  invest,
  credited: creditedIn = NO_CREDITED,
  dividends = NO_DIVIDENDS,
  alertIds,
  draft,
  onClose,
  onDone,
  onEditBroker,
  onCreateGoal,
  onSyncError,
  potCents: potCentsIn,
  dividendMarker,
  onCorrectDividend,
  onRemoveDividend,
  quotes,
}) => {
  // Saved before the paid-in dividends arrive, a correction would leave them uncorrected.
  const creditedLoaded = creditedIn !== null;
  const credited = creditedIn ?? NO_CREDITED;
  const confirm = useConfirm();
  const t = useT();
  // Looked up at render, so a trade's kind is named in the current language.
  const LABEL = t.invest.kind;
  const editing = draft.mode === 'edit' ? draft.trade : null;
  const kind: Trade['kind'] = draft.mode === 'edit' ? draft.trade.kind : draft.kind;
  const broker = useMemo(() => brokerById(invest.brokerId, invest.customRule), [invest.brokerId, invest.customRule]);

  const [symbol, setSymbol] = useState(editing?.symbol ?? (draft.mode === 'new' ? draft.symbol ?? '' : ''));
  const [name, setName] = useState(editing?.name ?? (draft.mode === 'new' ? draft.name ?? '' : ''));
  const [units, setUnits] = useState(() =>
    editing ? String(editing.units) : draft.mode === 'new' && draft.units ? String(draft.units) : ''
  );
  const [price, setPrice] = useState(() => {
    if (editing) return kind === 'dividend' ? fromCents(editing.priceCents).toFixed(4) : priceText(pricePointsOf(editing));
    return draft.mode === 'new' && draft.pricePoints ? priceText(draft.pricePoints) : '';
  });
  // A trade cannot have happened tomorrow, and a date that had drifted into
  // the future would count the shares as held on an ex-date that has not
  // arrived. An existing one is pulled back to today rather than silently kept.
  const today = toInputDate(Date.now());
  const [date, setDate] = useState(() => {
    const from = toInputDate(editing?.tradedAt ?? Date.now());
    return from > today ? today : from;
  });
  const [term, setTerm] = useState('');
  const [hits, setHits] = useState<SymbolHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  /** The number the app's pad is typing into. */
  const [pad, setPad] = useState<PadTarget>(null);
  /** The price came from the last-price hint rather than from the person; any typing clears it. */
  const [priceFromHint, setPriceFromHint] = useState(false);
  const typePriceText = (text: string) => {
    const next = typePrice(text);
    setPrice(next.text);
    setPriceFromHint(next.fromHint);
  };
  /** Prices fetched here for a counter picked from search, which the app had no price for. */
  const [fetchedQuotes, setFetchedQuotes] = useState<Quotes>({});
  const askedQuotes = useRef(new Set<string>());
  const mounted = useRef(true);
  /** A dividend's receipt, its correction form, or the question before taking it back. */
  const [dividendMode, setDividendMode] = useState<'view' | 'correct' | 'remove'>('view');
  const [amountText, setAmountText] = useState(() =>
    editing && editing.kind === 'dividend' ? fromCents(tradeCents(editing)).toFixed(2) : ''
  );
  // Orders a new trade after everything already entered today, in the preview.
  const [openedAt] = useState(() => Date.now());

  /** A tap on the Share / REIT tag, remembered per counter for this session. */
  const [typeChoice, setTypeChoice] = useState<{ symbol: string; type: SecurityType } | null>(null);

  /**
   * Fees as typed, and which of them were typed. A field someone has typed
   * into is theirs from then on: changing the units or the price, or even the
   * broker, never writes over it, because it most likely came off the
   * contract note. A correction starts from what was stored, and only the
   * fields that still agree with the rates follow the rates.
   */
  const [feeInput, setFeeInput] = useState<Record<FeeKey, string>>(() => {
    // Older trades recorded no fees; they are shown as the nothing they were,
    // not filled in with a guess.
    const stored = editing && editing.kind !== 'dividend' ? editing.fees ?? ZERO_FEES : null;
    if (!stored) return { brokerageCents: '', clearingCents: '', stampCents: '', sstCents: '' };
    return {
      brokerageCents: feeText(stored.brokerageCents),
      clearingCents: feeText(stored.clearingCents),
      stampCents: feeText(stored.stampCents),
      sstCents: feeText(stored.sstCents),
    };
  });
  const [edited, setEdited] = useState<Record<FeeKey, boolean>>(() => {
    const none = { brokerageCents: false, clearingCents: false, stampCents: false, sstCents: false };
    if (!editing || editing.kind === 'dividend') return none;
    const stored = editing.fees ?? ZERO_FEES;
    const type = editing.securityType ?? securityTypeOf(editing.symbol, invest.typeOverrides);
    const computed = broker ? feesFor(valueCents(editing.units, pricePointsOf(editing)), broker, type) : null;
    return {
      brokerageCents: !computed || stored.brokerageCents !== computed.brokerageCents,
      clearingCents: !computed || stored.clearingCents !== computed.clearingCents,
      stampCents: !computed || stored.stampCents !== computed.stampCents,
      sstCents: !computed || stored.sstCents !== computed.sstCents,
    };
  });

  /** Fee fields typed into in this sheet, as opposed to stored values carried over. */
  const [typed, setTyped] = useState<Record<FeeKey, boolean>>({ brokerageCents: false, clearingCents: false, stampCents: false, sstCents: false });

  /**
   * Where the money comes from or goes. A correction starts from what the
   * trade did; a goal that has since been deleted cannot be chosen again, so
   * that one starts from "no goal" and the save asks where its money goes.
   */
  /**
   * A buy being corrected whose paying goal has been deleted. It cannot stay
   * paid from a goal that is gone, and quietly showing "Not from a goal" read
   * as if the person had chosen that — so nothing is picked until they pick.
   */
  const paidFromGone =
    !!editing && editing.kind === 'buy' && editing.money?.mode === 'goal' && !banks.some((b) => b.id === (editing.money as { goalId: string }).goalId);
  const [picked, setPicked] = useState(!paidFromGone);
  const pick = (next: MoneyChoice) => {
    setChoice(next);
    setPicked(true);
  };

  const [choice, setChoice] = useState<MoneyChoice>(() => {
    if (editing) {
      const m = editing.money;
      if (m?.mode === 'goal') return banks.some((b) => b.id === m.goalId) ? { mode: 'goal', goalId: m.goalId } : { mode: 'none' };
      if (m?.mode === 'split') return { mode: 'split' };
      if (m?.mode === 'pot') return { mode: 'pot' };
      // A pot sale that came to exactly nothing used to be stored as "none";
      // it is a pot trade, so a correction to a real amount moves the pot.
      if (editing.kind === 'sell' && tradeTotalCents(editing) === 0) return { mode: 'pot' };
      return { mode: 'none' };
    }
    // Every new trade goes through the investment pot; savings goals are never touched.
    return { mode: 'pot' };
  });

  /**
   * A trade recorded before the investment pot moved money in savings goals.
   * It keeps those choices when corrected, so its money is undone where it
   * went; everything else offers only the pot.
   */
  const legacyGoalMoney = !!editing && (editing.money?.mode === 'goal' || editing.money?.mode === 'split');
  const potCents = potCentsIn ?? toCents(invest.potBalance ?? 0);

  /** Asked when a buy's paying goal is gone; `removing` says what to retry. */
  const [refundAsk, setRefundAsk] = useState<{ cents: number; removing: boolean } | null>(null);
  /** A sale being undone fed a goal deleted since: where its share comes back from. */
  const [takeBackAsk, setTakeBackAsk] = useState<{ removing: boolean } | null>(null);
  const [mismatch, setMismatch] = useState<FeeMismatch | null>(null);


  const needsCounter = !symbol;
  /** You can only sell what you hold, so a sale picks from the positions. */
  const held = useMemo(() => buildHoldings(trades), [trades]);

  // Searching runs a beat after typing stops, so a name costs one request.
  useEffect(() => {
    if (!needsCounter || kind !== 'buy') return;
    const text = term.trim();
    if (text.length < 2) {
      setHits([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      setHits(await searchSymbols(text));
      setSearching(false);
    }, 350);
    return () => clearTimeout(timer);
  }, [term, needsCounter, kind]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const isNewTrade = draft.mode === 'new';
  /** The freshest price known for this counter, from the app or from the fetch below. */
  const knownQuote: Quote | undefined = [quotes?.[symbol], fetchedQuotes[symbol]]
    .filter((q): q is Quote => !!q)
    .sort((a, b) => b.at - a.at)[0];

  // A counter picked from search has no price yet: ask once, never hold the form up for it.
  useEffect(() => {
    if (!needsQuoteFetch({ isNew: isNewTrade, symbol, priceField: price, have: knownQuote, asked: askedQuotes.current, now: Date.now() })) return;
    askedQuotes.current.add(symbol);
    const wanted = symbol;
    void loadQuotes([wanted], true)
      .then((found) => {
        if (mounted.current && found[wanted]) setFetchedQuotes((prev) => ({ ...prev, [wanted]: found[wanted] }));
      })
      .catch(() => undefined);
    // Asked once per counter; the price field and the quotes are read as they stand then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNewTrade, symbol]);

  const unitsIn = Math.max(0, Math.floor(Number(units) || 0));
  // Half-sen prices are real (RM0.345), so the price is kept in points; the
  // sen figure is only there for older readers of the trade.
  const priceNumber = Math.max(0, Number(price) || 0);
  const pricePointsIn = Math.round(priceNumber * 10_000);
  const priceCents = Math.round(priceNumber * 100);
  const tradedAt = fromInputDate(date);
  const tradeValue = valueCents(unitsIn, pricePointsIn);
  const priceHint = showHint({ isNew: isNewTrade, priceField: price, quote: knownQuote, now: Date.now() });
  const agoText = (ago: { unit: AgoUnit; n: number }) =>
    ago.unit === 'now'
      ? t.invest.priceAgo.justNow
      : ago.unit === 'minutes'
        ? t.invest.priceAgo.minutes(ago.n)
        : ago.unit === 'hours'
          ? t.invest.priceAgo.hours(ago.n)
          : t.invest.priceAgo.days(ago.n);

  const securityType: SecurityType = !symbol
    ? 'EQUITY'
    : typeChoice && typeChoice.symbol === symbol
      ? typeChoice.type
      : editing && editing.symbol === symbol && editing.securityType
        ? editing.securityType
        : securityTypeOf(symbol, invest.typeOverrides);
  const isReit = securityType === 'REIT';
  const feeKeys: FeeKey[] = isReit ? [...FEE_KEYS] : FEE_KEYS.filter((k) => k !== 'sstCents');

  const computed: TradeFees | null = broker ? feesFor(tradeValue, broker, securityType) : null;
  const shown = (key: FeeKey) => (computed && !edited[key] ? feeText(computed[key]) : feeInput[key]);
  const fees: TradeFees = {
    brokerageCents: 0,
    clearingCents: 0,
    stampCents: 0,
    sstCents: 0,
  };
  for (const key of feeKeys) fees[key] = computed && !edited[key] ? computed[key] : parseFee(feeInput[key]);
  // A trade from before fees were recorded holds zeros nobody typed. Those
  // zeros are not a correction of the broker's rates, so they must not count
  // towards the "your fees don't match" question — only fields typed now do.
  const editedByHand = editing && !editing.fees ? typed : edited;
  const feeEdits = feeEditsOf(fees, computed, isReit ? editedByHand : { ...editedByHand, sstCents: false });
  const anyEdited = !!computed && feeKeys.some((k) => edited[k]);
  const ratesName = broker ? (broker.id === CUSTOM_BROKER_ID ? t.invest.yourRates : t.invest.brokerRates(broker.name)) : '';

  const typeFee = (key: FeeKey, text: string) => {
    setTyped((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
    setFeeInput((prev) => ({ ...prev, [key]: cleanFeeInput(text) }));
    setEdited((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  };

  const toggleType = () => {
    if (!symbol) return;
    const next: SecurityType = isReit ? 'EQUITY' : 'REIT';
    setTypeChoice({ symbol, type: next });
    // Not awaited: offline it would wait for the server, and the tag has
    // already changed on screen.
    void saveInvest(uid, { typeOverrides: { ...invest.typeOverrides, [symbol]: next } }).catch(() => undefined);
  };

  /** The trade as it would be saved, for the preview and the save itself. */
  const candidate: Trade | null =
    symbol && kind !== 'dividend'
      ? {
          id: editing?.id ?? 'draft',
          symbol,
          name: name || symbol,
          kind,
          units: unitsIn,
          priceCents,
          pricePoints: pricePointsIn,
          tradedAt,
          createdAt: editing?.createdAt ?? openedAt,
          fees,
          securityType,
          feeEdits,
        }
      : null;
  const totalCents = candidate ? tradeTotalCents(candidate) : 0;
  const ready = !!candidate && unitsIn > 0 && pricePointsIn > 0;

  /**
   * What this change does to dividends already paid into the pot — the same
   * reckoning the save makes, so the preview and the pot agree.
   */
  const dividendAdjust = useMemo(() => {
    if (!ready || !candidate) return null;
    return dividendsAfterChange({
      trades,
      credited,
      dividends,
      previousId: editing?.id ?? null,
      next: { ...candidate, tradedAt: dayStart(candidate.tradedAt), money: stampOf(choice) },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, trades, credited, dividends, editing, symbol, kind, unitsIn, tradedAt, choice, openedAt]);

  const previous = useMemo(
    () =>
      editing
        ? {
            trade: editing,
            activity:
              activities.find(
                (a) => (!!editing.money && 'activityId' in editing.money && a.id === editing.money.activityId) || a.tradeId === editing.id
              ) ?? null,
          }
        : null,
    [editing, activities]
  );

  /**
   * What the position becomes once this trade is in the log — every other
   * trade left exactly as it is. Editing one line can only ever move the
   * numbers by that line's worth, and this is where you see it before saving.
   */
  const outcome = useMemo(() => {
    if (!candidate) return null;
    // "Before" is the position without this trade. Counting the trade being
    // edited in it made a sale read "0 → 0 units" and warn that nothing was
    // held that day — the sale had already taken the units it was selling.
    const others = trades.filter((tr) => tr.symbol === candidate.symbol && tr.id !== editing?.id);
    const before = replay(others);
    const after = replay([...others, candidate]);
    return { before, after };
    // `candidate` is rebuilt every render; its parts are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trades, symbol, kind, unitsIn, pricePointsIn, tradedAt, totalCents, editing]);

  /**
   * The money side, worked out with the same plan the save uses, so what the
   * sheet promises is exactly what gets written — including a correction
   * moving a goal only by the difference. If the paying goal is gone, the
   * preview assumes nothing goes back; the save stops and asks.
   */
  const preview = useMemo(() => {
    if (!ready || !candidate || candidate.kind === 'dividend') return null;
    const input = {
      previous,
      next: { kind: candidate.kind, totalCents, choice, counter: candidate.name, units: unitsIn },
      banks,
      loans,
      overflow: savings.overflow,
      potCents,
      dividendDeltaCents: dividendAdjust?.deltaCents ?? 0,
    };
    const first = planTradeMoney(input);
    if ('problem' in first && first.problem.kind === 'goalGone') {
      return { result: planTradeMoney({ ...input, refund: { mode: 'none' } }), refundPending: true, takeBackPending: false };
    }
    if ('problem' in first && first.problem.kind === 'saleGoalGone') {
      return { result: planTradeMoney({ ...input, takeBack: { mode: 'none' } }), refundPending: false, takeBackPending: true };
    }
    return { result: first, refundPending: false, takeBackPending: false };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, kind, totalCents, choice, name, symbol, unitsIn, previous, banks, loans, savings.overflow, potCents, dividendAdjust]);

  const bankName = (id: string) => banks.find((b) => b.id === id)?.name ?? t.invest.aGoal;

  const describe = (p: TradeMoneyProblem) => {
    switch (p.kind) {
      case 'insufficient':
        return t.invest.insufficient(bankName(p.goalId), money(p.availableCents), money(p.neededCents));
      case 'rowGone':
        return t.invest.rowGone;
      case 'nothingToSplit':
        return t.invest.nothingToSplit;
      case 'saleBelowFees':
        return t.invest.saleBelowFees(money(p.cents));
      case 'potShort':
        return t.invest.potShort(money(p.availableCents), money(p.neededCents));
      case 'goalGone':
        return t.errors.tradeMoney.goalGone;
      case 'saleGoalGone':
        return t.errors.tradeMoney.saleGoalGone;
    }
  };

  /**
   * A sale's money always has to land somewhere the app can see: a goal, or
   * split like a deposit. "Not into a goal" left it existing nowhere — the
   * holding shrank and no balance grew. It stays only for a sale recorded
   * before this rule, whose money may already have been deposited by hand;
   * forcing it into a goal now would count that money twice.
   */
  const legacyNone =
    !!editing && editing.kind === 'sell' && (!editing.money || editing.money.mode === 'none') && tradeTotalCents(editing) !== 0;
  const needsChoice = (legacyGoalMoney && kind === 'sell' && choice.mode === 'none' && !legacyNone) || !picked;
  const hasDestination = banks.some((b) => !b.archivedAt);

  /** Every trade in this counter as it stands, and as it would be with this change. */
  const symbolTrades = useMemo(() => trades.filter((tr) => tr.symbol === symbol), [trades, symbol]);
  const dayText = (ms: number) => new Date(ms).toLocaleDateString(dateLocale('en-GB'), { day: 'numeric', month: 'short', year: 'numeric' });
  const describeShort = (short: ShortSale, own: boolean) =>
    own
      ? t.invest.sellMoreThanHeld(short.heldUnits.toLocaleString('en-US'), short.trade.units.toLocaleString('en-US'), dayText(short.trade.tradedAt))
      : t.invest.laterSaleShort(dayText(short.trade.tradedAt));
  const short =
    candidate && ready
      ? newShortSale(symbolTrades, [...symbolTrades.filter((tr) => tr.id !== editing?.id), candidate])
      : null;

  const blocked = short
    ? describeShort(short, short.trade === candidate)
    : preview && 'problem' in preview.result
      ? describe(preview.result.problem)
      : null;
  const canSave = ready && creditedLoaded && !busy && !blocked && !needsChoice;

  const fail = (e: unknown, removing: boolean) => {
    setBusy(false);
    if (e instanceof TradeMoneyError) {
      if (e.problem.kind === 'goalGone') {
        setRefundAsk({ cents: e.problem.cents, removing });
        return;
      }
      if (e.problem.kind === 'saleGoalGone') {
        setTakeBackAsk({ removing });
        return;
      }
      setRefundAsk(null);
      setTakeBackAsk(null);
      setProblem(describe(e.problem));
      return;
    }
    setRefundAsk(null);
    setTakeBackAsk(null);
    setProblem(e instanceof Error ? e.message : removing ? t.invest.couldNotDelete : t.invest.couldNotSave);
  };

  const save = async (refund?: MoneyChoice, takeBack?: GoneShareChoice) => {
    if (!candidate || candidate.kind === 'dividend' || !ready || !creditedLoaded || busy) return;
    setBusy(true);
    setProblem(null);
    const body: NonNullable<TradeWrite['trade']> = {
      symbol,
      name: name || symbol,
      kind: candidate.kind,
      units: unitsIn,
      priceCents,
      pricePoints: pricePointsIn,
      tradedAt,
      fees,
      securityType,
      feeEdits,
    };
    try {
      const { id, committed } = saveTrade(uid, {
        previous,
        trade: body,
        choice,
        refund,
        takeBack,
        banks,
        loans,
        savings,
        potBalance: invest.potBalance,
        trades,
        credited,
        dividends,
        alertIds,
      });
      committed.catch((e) => onSyncError?.(e));
      setRefundAsk(null);
      setTakeBackAsk(null);
      onDone(editing ? t.invest.tradeCorrected(name || symbol) : t.invest.tradeRecorded(LABEL[candidate.kind], unitsIn, name || symbol));

      // The snapshot may not have this trade yet, so it is put in by hand.
      const saved: Trade = { ...body, id, createdAt: editing?.createdAt ?? Date.now() };
      const found = feeMismatch([...trades.filter((tr) => tr.id !== id), saved], invest.feePromptAt);
      if (found) {
        // Stays busy: the form is done, only the question is left.
        setMismatch(found);
        return;
      }
      onClose();
    } catch (e) {
      fail(e, false);
    }
  };

  const removeWith = async (refund?: MoneyChoice, takeBack?: GoneShareChoice) => {
    if (!editing || !creditedLoaded) return;
    setBusy(true);
    setProblem(null);
    try {
      const { committed } = saveTrade(uid, {
        previous,
        trade: null,
        choice: { mode: 'none' },
        refund,
        takeBack,
        banks,
        loans,
        savings,
        potBalance: invest.potBalance,
        trades,
        credited,
        dividends,
        alertIds,
      });
      committed.catch((e) => onSyncError?.(e));
      setRefundAsk(null);
      setTakeBackAsk(null);
      onDone(t.invest.tradeDeleted);
      onClose();
    } catch (e) {
      fail(e, true);
    }
  };

  const remove = async () => {
    if (!editing || busy || !creditedLoaded) return;
    // Deleting a buy can leave a later sale selling units that were never held.
    const leftShort = newShortSale(symbolTrades, symbolTrades.filter((tr) => tr.id !== editing.id));
    if (leftShort) {
      setProblem(t.invest.deleteLeavesSaleShort(dayText(leftShort.trade.tradedAt)));
      return;
    }
    const moved = !!editing.money && editing.money.mode !== 'none';
    // A trade from before the investing cash moved money in goals; a newer one moved the investing cash.
    const movedBack = editing.money?.mode === 'pot' ? t.invest.deleteMoneyBackPot : t.invest.deleteMoneyBack;
    const adjusted = dividendsAfterChange({ trades, credited, dividends, previousId: editing.id, next: null }).deltaCents;
    const body = moved ? `${t.invest.deleteBody} ${movedBack}` : t.invest.deleteBody;
    const ok = await confirm({
      title: t.invest.deleteTitle,
      body: adjusted !== 0 ? `${body} ${t.invest.dividendsAdjustedBody(money(adjusted, { signed: true }))}` : body,
      tone: 'danger',
      confirmLabel: t.common.delete,
      detail: {
        icon: editing.kind === 'sell' ? 'trending_down' : 'trending_up',
        tint: editing.kind === 'sell' ? 'bg-peach text-ink' : 'bg-lav text-ink',
        label: `${LABEL[editing.kind]} · ${editing.name || editing.symbol}`,
        meta: `${t.common.units(editing.units.toLocaleString('en-US'))} · ${new Date(editing.tradedAt).toLocaleDateString(dateLocale('en-GB'), { day: 'numeric', month: 'short', year: 'numeric' })}`,
        amount: money(tradeTotalCents(editing)),
      },
    });
    if (!ok) return;
    await removeWith();
  };

  /** What correcting or taking back this dividend would do, worked out as the save works it out. */
  const dividendRow = editing && editing.kind === 'dividend' && editing.money?.mode === 'pot' ? editing : null;
  const canCorrect = !!dividendRow && !!dividendMarker && !!onCorrectDividend;
  const canRemove = !!dividendRow && !!dividendMarker && !!onRemoveDividend;
  const dividendCorrected = !!editing && (dividendMarker?.corrected === true || editing.amountCents !== undefined);
  const newDividendCents = toCents(Number(amountText) || 0);
  const correction =
    dividendMode === 'correct' && dividendRow && dividendMarker
      ? planDividendCorrection({ trade: dividendRow, marker: dividendMarker, newCents: newDividendCents, potCents })
      : null;
  const removal =
    dividendMode === 'remove' && dividendRow && dividendMarker ? planDividendRemoval({ trade: dividendRow, marker: dividendMarker, potCents }) : null;
  const correctionPlan = correction && 'plan' in correction ? correction.plan : null;
  const dividendName = editing ? editing.name || editing.symbol : '';

  const dividendFail = (e: unknown) => {
    setBusy(false);
    setProblem(e instanceof Error ? e.message : t.invest.couldNotSave);
  };

  const saveCorrection = async () => {
    if (!editing || !correctionPlan || correctionPlan.deltaCents === 0 || !onCorrectDividend || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      await onCorrectDividend(editing.id, newDividendCents);
      onDone(t.invest.dividendCorrectedDone(dividendName));
      onClose();
    } catch (e) {
      dividendFail(e);
    }
  };

  const confirmRemoval = async () => {
    if (!editing || !removal || 'problem' in removal || !onRemoveDividend || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      await onRemoveDividend(editing.id);
      onDone(t.invest.dividendRemovedDone(dividendName));
      onClose();
    } catch (e) {
      dividendFail(e);
    }
  };

  const answerMismatch = (update: boolean) => {
    // Either answer starts the count again; only trades entered after this
    // moment can raise the question next time. Not awaited, for the same
    // offline reason as the type tag.
    void saveInvest(uid, { feePromptAt: Date.now() }).catch(() => undefined);
    setMismatch(null);
    if (update) onEditBroker();
    onClose();
  };

  // A dividend is not edited here, so it is not titled as if it were.
  const title =
    kind === 'dividend' ? LABEL.dividend : editing ? t.invest.editTitle(LABEL[kind]) : kind === 'buy' ? LABEL.buy : LABEL.sell;

  const prefilled = draft.mode === 'new' && !!draft.pricePoints;

  /** Goals offered: the active ones, plus an archived one this trade already uses. */
  const goalOptions = banks.filter((b) => !b.archivedAt || (choice.mode === 'goal' && choice.goalId === b.id));
  const canSplit = banks.some(isInSplit);

  const plan = preview && 'plan' in preview.result ? preview.result.plan : null;

  /** The lines under the totals that say what happens to the pot and the goals. */
  const moneyLines = () => {
    if (!plan) return null;
    const showsPot = choice.mode === 'pot' || (plan.potDelta !== 0 && Object.keys(plan.bankDeltas).length === 0);
    return (
      <>
        {plan.dividendCents !== 0 && (
          <Line label={t.invest.dividendsAdjusted} value={money(plan.dividendCents, { signed: true })} tone="text-warn" />
        )}
        {savingsLines()}
        {!showsPot && plan.potDelta !== 0 && (
          <Line label={t.invest.potAfter} value={`${money(potCents)} → ${money(potCents + plan.potDelta)}`} tone="text-info" />
        )}
      </>
    );
  };

  const savingsLines = () => {
    if (!plan) return null;
    if (choice.mode === 'pot' || (plan.potDelta !== 0 && Object.keys(plan.bankDeltas).length === 0)) {
      return <Line label={t.invest.potAfter} value={`${money(potCents)} → ${money(potCents + plan.potDelta)}`} tone="text-info" />;
    }
    const draftRow = plan.activity.write === 'create' || plan.activity.write === 'update' ? plan.activity.draft : null;
    if (choice.mode === 'split' && draftRow) {
      const repaid = toCents(draftRow.repaid);
      return (
        <div className="space-y-1 border-l-2 border-line/10 pl-3">
          {repaid > 0 && <Line label={t.invest.coversSpentAhead} value={money(repaid)} tone="text-warn" />}
          {draftRow.distributions.map((d) => (
            <Line
              key={d.bankId}
              label={t.invest.splitShare(bankName(d.bankId), String(d.percentage))}
              value={money(toCents(d.amount), { signed: true })}
            />
          ))}
        </div>
      );
    }
    const ids = Object.keys(plan.bankDeltas).filter((id) => banks.some((b) => b.id === id));
    if (choice.mode === 'goal' && !ids.includes(choice.goalId)) ids.unshift(choice.goalId);
    if (choice.mode === 'goal') ids.sort((a, b) => (a === choice.goalId ? -1 : b === choice.goalId ? 1 : 0));
    // A sale with no destination picked yet is not "unchanged" — it cannot be saved at all.
    if (ids.length === 0) return needsChoice ? null : <Line label={t.invest.yourGoals} value={t.invest.unchanged} />;
    return ids.map((id) => {
      const bank = banks.find((b) => b.id === id);
      const now = toCents(bank?.currentAmount ?? 0);
      return (
        <Line key={id} label={t.invest.goalAfter(bankName(id))} value={`${money(now)} → ${money(now + (plan.bankDeltas[id] ?? 0))}`} tone="text-info" />
      );
    });
  };

  return (
    <>
      <Sheet title={`${title}${name ? ` · ${name}` : ''}`} onClose={onClose} height="tall">
        <div className="mt-1 flex items-start gap-2">
          <p className="min-w-0 flex-1 px-1 text-[13px] font-medium leading-relaxed text-mute">
            {kind === 'dividend'
              ? editing?.money?.mode === 'pot' ? t.invest.dividendIntro : t.invest.dividendIntroLegacy
              : editing
              ? t.invest.editIntro
              : prefilled
                ? t.invest.prefilledIntro
                : kind === 'buy'
                  ? t.invest.buyIntro
                  : t.invest.sellIntro}
          </p>
          {symbol && kind !== 'dividend' && (
            <button
              type="button"
              onClick={toggleType}
              title={t.invest.securityTypeHint}
              aria-label={`${t.invest.securityType[securityType]} · ${t.invest.securityTypeHint}`}
              className={`flex min-h-9 shrink-0 items-center gap-1 rounded-full px-3 text-[11.5px] font-extrabold active:opacity-70 ${isReit ? 'bg-lav' : 'bg-line/10'}`}
            >
              {t.invest.securityType[securityType]}
              <Icon name="swap" size={13} />
            </button>
          )}
        </div>

        {/* A dividend was not typed in by anyone, so there is nothing here to
            re-type. It is shown as the receipt it is. */}
        {kind === 'dividend' ? (
          <div className="mt-5">
            <div className="space-y-1.5 rounded-3xl bg-card p-4">
              <div className="flex text-[13px]">
                <span className="flex-1 font-medium text-mute">{t.invest.paidOn}</span>
                <span className="font-extrabold">
                  {new Date(tradedAt).toLocaleDateString(dateLocale('en-GB'), {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
              </div>
              <div className="flex text-[13px]">
                <span className="flex-1 font-medium text-mute">{t.invest.unitsOnExDate}</span>
                <span className="font-extrabold">{unitsIn.toLocaleString('en-US')}</span>
              </div>
              <div className="flex text-[13px]">
                <span className="flex-1 font-medium text-mute">{t.invest.perUnit}</span>
                <span className="font-extrabold">
                  RM{((editing?.perUnitPoints ?? 0) / 10_000).toFixed(4)}
                </span>
              </div>
              <div className="my-2 h-px bg-line/10" />
              <div className="flex items-center">
                <span className="flex-1 text-[14px] font-extrabold text-pos">
                  {editing?.money?.mode === 'pot' ? t.invest.paidIntoPot : t.invest.paidIntoGoals}
                  {dividendCorrected && (
                    <span className="ml-2 rounded-full bg-sun px-2 py-0.5 align-middle text-[10.5px] font-extrabold text-ink">
                      {t.invest.dividendCorrected}
                    </span>
                  )}
                </span>
                <span className="text-[18px] font-extrabold text-pos">
                  {money(editing ? tradeCents(editing) : 0)}
                </span>
              </div>
            </div>
            {dividendMode === 'view' && (
              <>
                <p className="text-[12px] font-medium text-mute mt-4 leading-relaxed">
                  {editing?.money?.mode !== 'pot'
                    ? t.invest.dividendReceiptNoteLegacy
                    : dividendCorrected
                      ? t.invest.dividendCorrectedNote
                      : t.invest.dividendReceiptNote}
                </p>
                {(canCorrect || canRemove) && (
                  <div className="mt-5 space-y-3">
                    {canCorrect && (
                      <button
                        onClick={() => {
                          setProblem(null);
                          setDividendMode('correct');
                        }}
                        className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-cta px-6 text-[15px] font-extrabold text-cta-fg active:opacity-80"
                      >
                        {t.invest.correctAmount}
                      </button>
                    )}
                    {canRemove && (
                      <button
                        onClick={() => {
                          setProblem(null);
                          setDividendMode('remove');
                        }}
                        className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-peach px-6 text-[15px] font-extrabold text-neg active:opacity-80"
                      >
                        {t.invest.removeDividend}
                      </button>
                    )}
                  </div>
                )}
                <button
                  onClick={onClose}
                  className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-card px-6 text-[15.5px] font-extrabold text-ink active:opacity-80"
                >
                  {t.common.close}
                </button>
              </>
            )}

            {dividendMode === 'correct' && (
              <div className="mt-5">
                <p className="text-[12.5px] font-medium leading-relaxed text-mute">{t.invest.correctAmountHint}</p>
                <div className="mt-4 flex">
                  <Field label={t.invest.amountReceived} value={amountText} onOpen={() => setPad('amount')} active={pad === 'amount'} prefix="RM" placeholder="0.00" />
                </div>
                {pad === 'amount' && <NumberPad className="mt-3" fieldKey="amount" value={amountText} decimals={2} onChange={setAmountText} onDone={() => setPad(null)} />}
                {correctionPlan && correctionPlan.deltaCents !== 0 && (
                  <div className="mt-4 rounded-3xl bg-lav p-4">
                    <Line
                      label={t.invest.potMoves(
                        money(potCents),
                        money(potCents + correctionPlan.potDelta),
                        money(correctionPlan.deltaCents, { signed: true })
                      )}
                      value=""
                      tone="text-info"
                    />
                  </div>
                )}
                {correction && 'problem' in correction && amountText.trim() !== '' && (
                  <p className="text-[12.5px] font-bold text-neg mt-4 leading-relaxed">{dividendProblemText(correction, t)}</p>
                )}
                {problem && <p className="text-[12.5px] font-bold text-neg mt-4 leading-relaxed">{problem}</p>}
                <button
                  onClick={() => void saveCorrection()}
                  disabled={!correctionPlan || correctionPlan.deltaCents === 0 || busy}
                  className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-cta px-6 text-[15.5px] font-extrabold text-cta-fg disabled:opacity-40 active:opacity-80"
                >
                  {t.invest.saveCorrection}
                </button>
                <button
                  onClick={() => {
                    setProblem(null);
                    setAmountText(editing ? fromCents(tradeCents(editing)).toFixed(2) : '');
                    setDividendMode('view');
                  }}
                  disabled={busy}
                  className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-card px-6 text-[15px] font-extrabold text-ink disabled:opacity-40 active:opacity-80"
                >
                  {t.common.back}
                </button>
              </div>
            )}

            {dividendMode === 'remove' && (
              <div className="mt-5">
                <p className="text-[13px] font-medium leading-relaxed">
                  {t.invest.removeDividendBody(money(editing ? tradeCents(editing) : 0))}
                </p>
                {removal && 'problem' in removal && (
                  <p className="text-[12.5px] font-bold text-neg mt-4 leading-relaxed">{dividendProblemText(removal, t)}</p>
                )}
                {problem && <p className="text-[12.5px] font-bold text-neg mt-4 leading-relaxed">{problem}</p>}
                <button
                  onClick={() => void confirmRemoval()}
                  disabled={!removal || 'problem' in removal || busy}
                  className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-peach px-6 text-[15.5px] font-extrabold text-neg disabled:opacity-40 active:opacity-80"
                >
                  {t.invest.removeDividendConfirm}
                </button>
                <button
                  onClick={() => {
                    setProblem(null);
                    setDividendMode('view');
                  }}
                  disabled={busy}
                  className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-card px-6 text-[15px] font-extrabold text-ink disabled:opacity-40 active:opacity-80"
                >
                  {t.common.back}
                </button>
              </div>
            )}
          </div>
        ) : needsCounter && kind === 'sell' ? (
          <div className="mt-5">
            <p className="mb-2 px-1 text-[12.5px] font-bold text-mute">
              {t.invest.whichCounter}
            </p>
            {held.length === 0 ? (
              <p className="text-[13px] font-medium leading-relaxed text-mute">
                {t.invest.nothingToSell}
              </p>
            ) : (
              <div className="divide-y divide-line/10 rounded-3xl bg-card px-4 py-1">
                {held.map((holding) => (
                  <button
                    key={holding.id}
                    onClick={() => {
                      setSymbol(holding.symbol);
                      setName(holding.name);
                    }}
                    className="flex min-h-14 w-full items-center gap-3 py-2.5 text-left active:opacity-70"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-[15px] font-bold">{holding.name}</p>
                      <p className="text-[12px] font-medium text-mute">
                        {t.common.units(holding.units.toLocaleString('en-US'))} · {holding.symbol}
                      </p>
                    </div>
                    <Icon name="chev" size={18} className="text-mute" />
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : needsCounter ? (
          <div className="mt-5">
            <p className="mb-2 px-1 text-[12.5px] font-bold text-mute">{t.invest.counter}</p>
            <div className="flex min-h-14 items-center gap-3 rounded-[18px] bg-field px-4 focus-within:outline focus-within:outline-2 focus-within:outline-ink">
              <Icon name="ser" size={18} className="text-mute" />
              <input
                autoFocus
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder={t.invest.searchPlaceholder}
                className="min-h-6 w-full border-0 bg-transparent p-0 text-[16px] font-bold text-ink placeholder:text-mute focus:ring-0"
              />
            </div>
            {searching && <p className="mt-3 px-1 text-[12.5px] font-semibold text-mute">{t.invest.searching}</p>}
            {!searching && term.trim().length >= 2 && hits.length === 0 && (
              <p className="mt-3 px-1 text-[12.5px] font-semibold text-mute leading-relaxed">
                {t.invest.noMatch}
              </p>
            )}
            <div className="mt-3 divide-y divide-line/10 rounded-3xl bg-card px-4 py-1">
              {hits.map((hit) => (
                <button
                  key={hit.symbol}
                  onClick={() => {
                    setSymbol(normalizeSymbol(hit.symbol));
                    setName(hit.name);
                  }}
                  className="flex min-h-14 w-full items-center gap-3 py-2.5 text-left active:opacity-70"
                >
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-[15px] font-bold">{hit.name}</p>
                    <p className="text-[12px] font-medium text-mute">{hit.symbol}</p>
                  </div>
                  <Icon name="plus" size={18} className="text-mute" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="mt-5">
              <DateField
                label={t.invest.tradeDate}
                value={date}
                onChange={setDate}
                max={today}
                title={t.invest.whenWasTrade}
                hint={t.invest.whenWasTradeHint}
              />
            </div>
            <div className="flex gap-3 mt-4">
              <Field label={t.invest.units} value={units} onOpen={() => setPad('units')} active={pad === 'units'} />
              <Field label={t.invest.pricePerUnit} value={price} onOpen={() => setPad('price')} active={pad === 'price'} prefix="RM" />
            </div>
            {(pad === 'units' || pad === 'price') && (
              <NumberPad
                className="mt-3"
                fieldKey={pad}
                value={pad === 'units' ? units : price}
                decimals={pad === 'units' ? 0 : 4}
                onChange={(text) => (pad === 'units' ? setUnits(text) : typePriceText(text))}
                onDone={() => setPad(null)}
              />
            )}
            {/* A suggestion to tap, never a silent fill: a last price is not what the order filled at. */}
            {priceHint && (
              <div className="mt-2.5 flex items-center gap-3 rounded-3xl bg-card px-4 py-3">
                <p className="flex-1 min-w-0 text-[12.5px] font-medium leading-relaxed text-mute">
                  {t.invest.lastPrice(`RM${priceHint.text}`, agoText(priceHint.ago))}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const next = applyHint(priceHint);
                    setPrice(next.text);
                    setPriceFromHint(next.fromHint);
                  }}
                  className="min-h-11 shrink-0 rounded-full bg-cta px-4 text-[12px] font-extrabold text-cta-fg active:opacity-80"
                >
                  {t.invest.useLastPrice(`RM${priceHint.text}`)}
                </button>
              </div>
            )}
            {priceFromHint && price.trim() !== '' && (
              <p className="text-[12.5px] font-bold text-warn mt-2.5 leading-relaxed">{t.invest.priceFromLast}</p>
            )}

            {/* Fees, filled in from the broker's rates until someone types over one. */}
            <div className="mt-5">
              <div className="flex items-center gap-2 mb-2">
                <p className="shrink-0 px-1 text-[12.5px] font-bold text-mute">{t.invest.fees}</p>
                {broker && (
                  <p className={`flex-1 min-w-0 truncate text-[11px] font-bold ${anyEdited ? 'text-warn' : 'text-mute'}`}>
                    {anyEdited ? t.invest.feesEdited : ratesName}
                  </p>
                )}
                {!broker && <span className="flex-1" />}
                {broker && (
                  <button
                    type="button"
                    onClick={onEditBroker}
                    className="shrink-0 min-h-11 shrink-0 px-1 text-[12.5px] font-extrabold active:opacity-60"
                  >
                    {t.invest.changeBroker}
                  </button>
                )}
              </div>
              <div className={`grid gap-2 ${isReit ? 'grid-cols-4' : 'grid-cols-3'}`}>
                {feeKeys.map((key) => (
                  <Field key={key} compact label={t.invest.feeBox[key]} value={shown(key)} onOpen={() => setPad(key)} active={pad === key} flagged={!!broker && edited[key]} placeholder="0.00" />
                ))}
              </div>
              {pad && pad !== 'units' && pad !== 'price' && pad !== 'amount' && (
                <NumberPad className="mt-3" fieldKey={pad} value={shown(pad)} decimals={2} onChange={(text) => typeFee(pad, text)} onDone={() => setPad(null)} />
              )}
              {!broker && (
                <div className="mt-2.5 rounded-3xl bg-sun px-4 py-3">
                  <p className="text-[12.5px] font-semibold leading-relaxed">{t.invest.noBroker}</p>
                  <button
                    type="button"
                    onClick={onEditBroker}
                    className="mt-1.5 min-h-11 text-[13px] font-extrabold underline active:opacity-60"
                  >
                    {t.invest.chooseBroker}
                  </button>
                </div>
              )}
            </div>

            {/* Where the money comes from, or where it goes. */}
            <div className="mt-5">
              <p className="mb-2 px-1 text-[12.5px] font-bold text-mute">
                {kind === 'buy' ? t.invest.paidFrom : t.invest.depositTo}
              </p>
              <div className="space-y-2">
                {!legacyGoalMoney && (
                  <ChoiceRow
                    icon="account_balance_wallet"
                    label={t.invest.pot}
                    sub={kind === 'buy' ? t.invest.potBuySub : t.invest.potSellSub}
                    value={money(potCents)}
                    on={picked && choice.mode === 'pot'}
                    onClick={() => pick({ mode: 'pot' })}
                  />
                )}
                {legacyGoalMoney && goalOptions.map((b) => (
                  <ChoiceRow
                    key={b.id}
                    icon={safeGoalIcon(b.icon)}
                    label={b.name}
                    sub={b.archivedAt ? t.invest.archived : undefined}
                    value={money(toCents(b.currentAmount))}
                    on={picked && sameChoice(choice, { mode: 'goal', goalId: b.id })}
                    onClick={() => pick({ mode: 'goal', goalId: b.id })}
                  />
                ))}
                {legacyGoalMoney && kind === 'sell' && (canSplit || choice.mode === 'split') && (
                  <ChoiceRow
                    icon="call_split"
                    tone="split"
                    label={t.common.autoSplit}
                    sub={t.invest.autoSplitSub}
                    on={picked && choice.mode === 'split'}
                    onClick={() => pick({ mode: 'split' })}
                  />
                )}
                {(kind === 'buy' || legacyNone) && (
                  <ChoiceRow
                    icon="block"
                    tone="none"
                    label={kind === 'buy' ? t.common.notFromGoal : t.invest.notIntoGoal}
                    sub={kind === 'buy' ? t.invest.notFromPotSub : t.invest.notIntoGoalLegacySub}
                    on={picked && choice.mode === 'none'}
                    onClick={() => pick({ mode: 'none' })}
                  />
                )}
              </div>
              {!picked && (
                <p className="text-[12.5px] font-bold text-warn mt-2.5 leading-relaxed">{t.invest.chooseWherePaidFrom}</p>
              )}
              {picked && needsChoice && hasDestination && (
                <p className="text-[12.5px] font-bold text-warn mt-2.5 leading-relaxed">{t.invest.chooseWhereSaleGoes}</p>
              )}
              {picked && needsChoice && !hasDestination && (
                <div className="mt-2.5 rounded-3xl bg-sun px-4 py-3">
                  <p className="text-[12.5px] font-semibold leading-relaxed">{t.invest.noGoalForSale}</p>
                  {onCreateGoal && (
                    <button
                      type="button"
                      onClick={onCreateGoal}
                      className="mt-1.5 min-h-11 text-[13px] font-extrabold underline active:opacity-60"
                    >
                      {t.invest.createGoal}
                    </button>
                  )}
                </div>
              )}
            </div>

            {outcome && ready && (
              <div className="mt-5 space-y-1 rounded-3xl bg-card p-4">
                <Line label={kind === 'buy' ? t.invest.thisTrade : t.invest.sale} value={money(tradeValue)} />
                <Line label={t.invest.fees} value={money(totalFees(fees))} />
                <div className="my-2 h-px bg-line/10" />
                <Line label={kind === 'buy' ? t.invest.totalPaid : t.invest.totalReceived} value={money(totalCents)} strong />
                {moneyLines()}
                <div className="my-2 h-px bg-line/10" />
                <Line
                  label={t.invest.afterThis(name || symbol)}
                  value={t.invest.unitsChange(
                    outcome.before.units.toLocaleString('en-US'),
                    outcome.after.units.toLocaleString('en-US')
                  )}
                />
                <Line
                  label={t.invest.averageCostWithFees}
                  value={outcome.after.units > 0 ? `RM${(averageCostCents(outcome.after) / 100).toFixed(4)}` : '—'}
                />
                {kind === 'sell' && outcome.after.units === outcome.before.units && unitsIn > 0 && (
                  <p className="text-[12.5px] font-bold text-warn leading-relaxed">
                    {t.invest.saleChangesNothing}
                  </p>
                )}
                {/* Until a source is picked, the hint above already says this. */}
                {preview?.refundPending && picked && (
                  <p className="text-[12.5px] font-bold text-warn leading-relaxed">{t.invest.refundLater}</p>
                )}
                {preview?.takeBackPending && (
                  <p className="text-[12.5px] font-bold text-warn leading-relaxed">{t.invest.takeBackLater}</p>
                )}
              </div>
            )}

            {blocked && <p className="text-[12.5px] font-bold text-neg mt-4 leading-relaxed">{blocked}</p>}
            {problem && problem !== blocked && (
              <p className="text-[12.5px] font-bold text-neg mt-4 leading-relaxed">{problem}</p>
            )}

            {!creditedLoaded && <p className="mt-4 px-1 text-[12.5px] font-medium leading-relaxed text-mute">{t.invest.dividendsLoading}</p>}

            <button
              onClick={() => void save()}
              disabled={!canSave}
              className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-cta px-6 text-[15.5px] font-extrabold text-cta-fg disabled:opacity-40 active:opacity-80"
            >
              {editing ? t.common.saveChanges : t.invest.record[kind]}
            </button>

            {editing && (
              <button
                onClick={() => void remove()}
                disabled={busy || !creditedLoaded}
                className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-peach px-6 text-[15px] font-extrabold text-neg disabled:opacity-40 active:opacity-80"
              >
                {t.invest.deleteTrade}
              </button>
            )}
          </>
        )}
      </Sheet>

      {refundAsk && (
        <>
          <RefundSheet
            amountCents={refundAsk.cents}
            banks={banks}
            busy={busy}
            goneGoalId={editing?.money?.mode === 'goal' ? editing.money.goalId : undefined}
            activities={activities}
            confirmLabel={refundAsk.removing ? t.invest.deleteTrade : editing ? t.common.saveChanges : t.invest.record[kind]}
            onChoose={(refund) => void (refundAsk.removing ? removeWith(refund) : save(refund))}
            onClose={() => setRefundAsk(null)}
          />
        </>
      )}

      {takeBackAsk && previous && (
        <>
          <GoneShareSheet
            distributions={
              previous.activity?.distributions ??
              // A sale into one goal whose row is no longer loaded: all of it went there.
              (previous.trade.money?.mode === 'goal'
                ? [{ bankId: previous.trade.money.goalId, amount: fromCents(tradeTotalCents(previous.trade)), percentage: 100 }]
                : [])
            }
            banks={banks}
            activities={activities}
            busy={busy}
            confirmLabel={takeBackAsk.removing ? t.invest.deleteTrade : t.common.saveChanges}
            onChoose={(takeBack) => void (takeBackAsk.removing ? removeWith(undefined, takeBack) : save(undefined, takeBack))}
            onClose={() => setTakeBackAsk(null)}
          />
        </>
      )}

      {mismatch && (
        <>
          <FeeMismatchSheet
            mismatch={mismatch}
            invest={invest}
            onUpdate={() => answerMismatch(true)}
            onNotNow={() => answerMismatch(false)}
          />
        </>
      )}
    </>
  );
};

export default TradeSheet;
