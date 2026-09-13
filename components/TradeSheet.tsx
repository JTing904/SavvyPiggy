import React, { useEffect, useMemo, useState } from 'react';
import type { Activity, InvestSettings, Loan, PiggyBank, SavingsSettings, Trade } from '../types';
import {
  averageCostCents,
  buildHoldings,
  normalizeSymbol,
  pricePointsOf,
  replay,
  tradeCents,
  tradeTotalCents,
} from '../services/holdings';
import { searchSymbols, type SymbolHit } from '../services/quotes';
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
import { planTradeMoney, type MoneyChoice, type TradeMoneyProblem } from '../services/tradeMoney';
import { feeEditsOf, feeMismatch, type FeeMismatch } from '../services/feePrompt';
import { isInSplit, type GoneShareChoice } from '../services/ledger';
import { fromInputDate, toInputDate } from '../services/calendar';
import { useBackHandler } from '../hooks/useBackHandler';
import { useConfirm } from '../contexts/ConfirmContext';
import DateField from './DateField';
import RefundSheet, { ChoiceRow } from './invest/RefundSheet';
import FeeMismatchSheet from './invest/FeeMismatchSheet';
import GoneShareSheet from './GoneShareSheet';
import { useT } from '../contexts/LanguageContext';
import { dateLocale } from '../i18n';

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
      choice?: MoneyChoice;
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
  draft: TradeDraft;
  onClose: () => void;
  onDone: (message: string) => void;
  /** Opens broker settings (from the fee-mismatch prompt or a "Change" link next to the fees). */
  onEditBroker: () => void;
  /** Opens goal creation, for a sale that has nowhere to put its money yet. */
  onCreateGoal?: () => void;
}

const money = (cents: number, opts?: { decimals?: 0 | 2; signed?: boolean }) =>
  formatMoney(fromCents(cents), opts);

/** 10.60 stays 10.60 and 0.345 stays 0.345: two places at least, four at most. */
const priceText = (points: number) => (points / 10_000).toFixed(4).replace(/(\.\d{2}\d*?)0+$/, '$1');

const feeText = (cents: number) => (cents / 100).toFixed(2);

/** A fee as typed. Contract notes print to the sen, so that is what is kept. */
const parseFee = (text: string) => Math.max(0, Math.round((Number(text) || 0) * 100));

const sameChoice = (a: MoneyChoice, b: MoneyChoice) =>
  a.mode === b.mode && (a.mode !== 'goal' || (b.mode === 'goal' && a.goalId === b.goalId));

const Field: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  prefix?: string;
  autoFocus?: boolean;
}> = ({ label, value, onChange, type = 'number', prefix, autoFocus }) => (
  <div className="flex-1 min-w-0">
    <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-2 truncate">{label}</p>
    <div className="flex items-center gap-2 h-14 px-4 rounded-2xl bg-white/5 border border-white/10 focus-within:border-primary/50 transition-colors">
      {prefix && <span className="text-slate-500 font-black shrink-0">{prefix}</span>}
      <input
        autoFocus={autoFocus}
        type={type}
        inputMode={type === 'number' ? 'decimal' : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={type === 'number' ? '0' : undefined}
        className="w-full min-w-0 border-0 bg-transparent text-white text-lg font-black focus:outline-none placeholder:text-slate-700"
      />
    </div>
  </div>
);

const Line: React.FC<{ label: string; value: string; strong?: boolean; tone?: string }> = ({ label, value, strong, tone }) => (
  <div className={`flex items-baseline gap-3 ${strong ? 'text-sm' : 'text-[13px]'}`}>
    <span className={`flex-1 min-w-0 font-bold ${strong ? 'text-white' : tone ?? 'text-slate-400'}`}>{label}</span>
    <span className={`font-black shrink-0 text-right ${tone ?? 'text-white'}`}>{value}</span>
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
  draft,
  onClose,
  onDone,
  onEditBroker,
  onCreateGoal,
}) => {
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
      return { mode: 'none' };
    }
    if (draft.mode === 'new' && draft.kind === 'buy') {
      if (draft.choice) return draft.choice;
      const budget = invest.budgetGoalId;
      if (budget && banks.some((b) => b.id === budget && !b.archivedAt)) return { mode: 'goal', goalId: budget };
    }
    return { mode: 'none' };
  });

  /** Asked when a buy's paying goal is gone; `removing` says what to retry. */
  const [refundAsk, setRefundAsk] = useState<{ cents: number; removing: boolean } | null>(null);
  /** A sale being undone fed a goal deleted since: where its share comes back from. */
  const [takeBackAsk, setTakeBackAsk] = useState<{ removing: boolean } | null>(null);
  const [mismatch, setMismatch] = useState<FeeMismatch | null>(null);

  useBackHandler(true, onClose);

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

  const unitsIn = Math.max(0, Math.floor(Number(units) || 0));
  // Half-sen prices are real (RM0.345), so the price is kept in points; the
  // sen figure is only there for older readers of the trade.
  const priceNumber = Math.max(0, Number(price) || 0);
  const pricePointsIn = Math.round(priceNumber * 10_000);
  const priceCents = Math.round(priceNumber * 100);
  const tradedAt = fromInputDate(date);
  const tradeValue = valueCents(unitsIn, pricePointsIn);

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
  const feeEdits = feeEditsOf(fees, computed, isReit ? edited : { ...edited, sstCents: false });
  const anyEdited = !!computed && feeKeys.some((k) => edited[k]);
  const ratesName = broker ? (broker.id === CUSTOM_BROKER_ID ? t.invest.yourRates : t.invest.brokerRates(broker.name)) : '';

  const typeFee = (key: FeeKey, text: string) => {
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

  const previous = useMemo(
    () =>
      editing
        ? {
            trade: editing,
            activity:
              activities.find(
                (a) => (editing.money?.mode !== 'none' && a.id === editing.money?.activityId) || a.tradeId === editing.id
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
  }, [ready, kind, totalCents, choice, name, symbol, unitsIn, previous, banks, loans, savings.overflow]);

  const bankName = (id: string) => banks.find((b) => b.id === id)?.name ?? t.invest.aGoal;

  const describe = (p: TradeMoneyProblem) => {
    switch (p.kind) {
      case 'insufficient':
        return t.invest.insufficient(bankName(p.goalId), money(p.availableCents), money(p.neededCents));
      case 'rowGone':
        return t.invest.rowGone;
      case 'nothingToSplit':
        return t.invest.nothingToSplit;
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
  const legacyNone = !!editing && editing.kind === 'sell' && (!editing.money || editing.money.mode === 'none');
  const needsChoice = (kind === 'sell' && choice.mode === 'none' && !legacyNone) || !picked;
  const hasDestination = banks.some((b) => !b.archivedAt);

  const blocked = preview && 'problem' in preview.result ? describe(preview.result.problem) : null;
  const canSave = ready && !busy && !blocked && !needsChoice;

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
    if (!candidate || candidate.kind === 'dividend' || !ready || busy) return;
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
      const { id } = await saveTrade(uid, { previous, trade: body, choice, refund, takeBack, banks, loans, savings });
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
    if (!editing) return;
    setBusy(true);
    setProblem(null);
    try {
      await saveTrade(uid, { previous, trade: null, choice: { mode: 'none' }, refund, takeBack, banks, loans, savings });
      setRefundAsk(null);
      setTakeBackAsk(null);
      onDone(t.invest.tradeDeleted);
      onClose();
    } catch (e) {
      fail(e, true);
    }
  };

  const remove = async () => {
    if (!editing || busy) return;
    const moved = !!editing.money && editing.money.mode !== 'none';
    const ok = await confirm({
      title: t.invest.deleteTitle,
      body: moved ? `${t.invest.deleteBody} ${t.invest.deleteMoneyBack}` : t.invest.deleteBody,
      tone: 'danger',
      confirmLabel: t.common.delete,
      detail: {
        icon: editing.kind === 'sell' ? 'trending_down' : 'trending_up',
        tint: editing.kind === 'sell' ? 'bg-slate-500/10 text-slate-400' : 'bg-accent/10 text-accent',
        label: `${LABEL[editing.kind]} · ${editing.name || editing.symbol}`,
        meta: `${t.common.units(editing.units.toLocaleString('en-US'))} · ${new Date(editing.tradedAt).toLocaleDateString(dateLocale('en-GB'), { day: 'numeric', month: 'short', year: 'numeric' })}`,
        amount: money(tradeTotalCents(editing)),
      },
    });
    if (!ok) return;
    await removeWith();
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

  /** The lines under the totals that say what happens to the goals. */
  const moneyLines = () => {
    if (!plan) return null;
    const draftRow = plan.activity.write === 'create' || plan.activity.write === 'update' ? plan.activity.draft : null;
    if (choice.mode === 'split' && draftRow) {
      const repaid = toCents(draftRow.repaid);
      return (
        <div className="pl-3 border-l border-white/10 space-y-2">
          {repaid > 0 && <Line label={t.invest.coversSpentAhead} value={money(repaid)} tone="text-amber-400" />}
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
        <Line key={id} label={t.invest.goalAfter(bankName(id))} value={`${money(now)} → ${money(now + (plan.bankDeltas[id] ?? 0))}`} tone="text-accent" />
      );
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/85 veil-in" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md mx-auto bg-surface sheet-rise rounded-t-[2rem] border-t border-white/10 px-6 pt-4 pb-8 max-h-[90%] overflow-y-auto no-scrollbar safe-pb"
      >
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-5" />

        <div className="flex items-start gap-2">
          <h3 className="flex-1 min-w-0 text-white text-xl font-black break-words">
            {title}
            {name && ` · ${name}`}
          </h3>
          {symbol && kind !== 'dividend' && (
            <button
              type="button"
              onClick={toggleType}
              title={t.invest.securityTypeHint}
              aria-label={`${t.invest.securityType[securityType]} · ${t.invest.securityTypeHint}`}
              className={`shrink-0 mt-1 flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-full border tracking-wider active:scale-95 transition-all ${
                isReit ? 'bg-accent/15 border-accent/40 text-accent' : 'bg-white/5 border-white/15 text-slate-300'
              }`}
            >
              {t.invest.securityType[securityType]}
              <span className="material-symbols-rounded text-[13px]">swap_horiz</span>
            </button>
          )}
        </div>
        <p className="text-slate-500 text-[11px] font-bold mt-1 leading-relaxed">
          {kind === 'dividend'
            ? t.invest.dividendIntro
            : editing
            ? t.invest.editIntro
            : prefilled
              ? t.invest.prefilledIntro
              : kind === 'buy'
                ? t.invest.buyIntro
                : t.invest.sellIntro}
        </p>

        {/* A dividend was not typed in by anyone, so there is nothing here to
            re-type. It is shown as the receipt it is. */}
        {kind === 'dividend' ? (
          <div className="mt-5">
            <div className="rounded-2xl bg-white/5 p-4 space-y-2.5">
              <div className="flex text-[13px]">
                <span className="flex-1 text-slate-400 font-bold">{t.invest.paidOn}</span>
                <span className="text-white font-black">
                  {new Date(tradedAt).toLocaleDateString(dateLocale('en-GB'), {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
              </div>
              <div className="flex text-[13px]">
                <span className="flex-1 text-slate-400 font-bold">{t.invest.unitsOnExDate}</span>
                <span className="text-white font-black">{unitsIn.toLocaleString('en-US')}</span>
              </div>
              <div className="flex text-[13px]">
                <span className="flex-1 text-slate-400 font-bold">{t.invest.perUnit}</span>
                <span className="text-white font-black">
                  RM{((editing?.perUnitPoints ?? 0) / 10_000).toFixed(4)}
                </span>
              </div>
              <div className="h-px bg-white/10" />
              <div className="flex items-center">
                <span className="flex-1 text-accent font-black text-sm">{t.invest.paidIntoGoals}</span>
                <span className="text-accent font-black text-lg">
                  {money(editing ? tradeCents(editing) : 0)}
                </span>
              </div>
            </div>
            <p className="text-slate-500 text-[11px] font-bold mt-4 leading-relaxed">
              {t.invest.dividendReceiptNote}
            </p>
            <button
              onClick={onClose}
              className="w-full h-14 mt-5 rounded-full glass border border-white/10 text-white font-black active:scale-95 transition-transform"
            >
              {t.common.close}
            </button>
          </div>
        ) : needsCounter && kind === 'sell' ? (
          <div className="mt-5">
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-3">
              {t.invest.whichCounter}
            </p>
            {held.length === 0 ? (
              <p className="text-slate-500 text-xs font-bold leading-relaxed">
                {t.invest.nothingToSell}
              </p>
            ) : (
              <div className="space-y-2">
                {held.map((holding) => (
                  <button
                    key={holding.id}
                    onClick={() => {
                      setSymbol(holding.symbol);
                      setName(holding.name);
                    }}
                    className="w-full flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/10 text-left active:scale-95 transition-transform"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-black text-sm truncate">{holding.name}</p>
                      <p className="text-slate-500 text-[11px] font-bold">
                        {t.common.units(holding.units.toLocaleString('en-US'))} · {holding.symbol}
                      </p>
                    </div>
                    <span className="material-symbols-rounded text-slate-600">chevron_right</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : needsCounter ? (
          <div className="mt-5">
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-2">{t.invest.counter}</p>
            <div className="flex items-center gap-3 h-14 px-4 rounded-2xl bg-white/5 border border-white/10 focus-within:border-primary/50 transition-colors">
              <span className="material-symbols-rounded text-slate-500">search</span>
              <input
                autoFocus
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder={t.invest.searchPlaceholder}
                className="w-full border-0 bg-transparent text-white font-bold focus:outline-none placeholder:text-slate-700"
              />
            </div>
            {searching && <p className="text-slate-500 text-xs font-bold mt-3">{t.invest.searching}</p>}
            {!searching && term.trim().length >= 2 && hits.length === 0 && (
              <p className="text-slate-500 text-xs font-bold mt-3 leading-relaxed">
                {t.invest.noMatch}
              </p>
            )}
            <div className="mt-3 space-y-2">
              {hits.map((hit) => (
                <button
                  key={hit.symbol}
                  onClick={() => {
                    setSymbol(normalizeSymbol(hit.symbol));
                    setName(hit.name);
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/10 text-left active:scale-95 transition-transform"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-black text-sm truncate">{hit.name}</p>
                    <p className="text-slate-500 text-[11px] font-bold">{hit.symbol}</p>
                  </div>
                  <span className="material-symbols-rounded text-slate-600">add</span>
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
              <Field label={t.invest.units} value={units} onChange={setUnits} autoFocus={!editing && !prefilled} />
              <Field label={t.invest.pricePerUnit} value={price} onChange={setPrice} prefix="RM" />
            </div>

            {/* Fees, filled in from the broker's rates until someone types over one. */}
            <div className="mt-5">
              <div className="flex items-center gap-2 mb-2">
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest shrink-0">{t.invest.fees}</p>
                {broker && (
                  <p className={`flex-1 min-w-0 truncate text-[11px] font-bold ${anyEdited ? 'text-amber-400' : 'text-slate-500'}`}>
                    {anyEdited ? t.invest.feesEdited : ratesName}
                  </p>
                )}
                {!broker && <span className="flex-1" />}
                {broker && (
                  <button
                    type="button"
                    onClick={onEditBroker}
                    className="shrink-0 text-accent text-[11px] font-black active:scale-95 transition-transform"
                  >
                    {t.invest.changeBroker}
                  </button>
                )}
              </div>
              <div className={`grid gap-2 ${isReit ? 'grid-cols-4' : 'grid-cols-3'}`}>
                {feeKeys.map((key) => (
                  <label key={key} className="min-w-0 block">
                    <span className="block text-slate-500 text-[9px] font-black uppercase tracking-wider mb-1 truncate">
                      {t.invest.feeBox[key]}
                    </span>
                    <span
                      className={`flex items-center h-11 px-2.5 rounded-xl bg-white/5 border transition-colors ${
                        broker && edited[key] ? 'border-amber-400/60' : 'border-white/10 focus-within:border-primary/50'
                      }`}
                    >
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        value={shown(key)}
                        onChange={(e) => typeFee(key, e.target.value)}
                        onFocus={(e) => e.target.select()}
                        placeholder="0.00"
                        className="w-full min-w-0 border-0 bg-transparent text-white text-sm font-black focus:outline-none placeholder:text-slate-700"
                      />
                    </span>
                  </label>
                ))}
              </div>
              {!broker && (
                <div className="mt-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 px-3.5 py-3">
                  <p className="text-amber-200/90 text-[11px] font-bold leading-relaxed">{t.invest.noBroker}</p>
                  <button
                    type="button"
                    onClick={onEditBroker}
                    className="mt-1.5 text-accent text-xs font-black active:scale-95 transition-transform"
                  >
                    {t.invest.chooseBroker}
                  </button>
                </div>
              )}
            </div>

            {/* Where the money comes from, or where it goes. */}
            <div className="mt-5">
              <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-2">
                {kind === 'buy' ? t.invest.paidFrom : t.invest.depositTo}
              </p>
              <div className="space-y-2">
                {goalOptions.map((b) => (
                  <ChoiceRow
                    key={b.id}
                    icon={b.icon}
                    label={b.name}
                    sub={b.archivedAt ? t.invest.archived : undefined}
                    value={money(toCents(b.currentAmount))}
                    on={picked && sameChoice(choice, { mode: 'goal', goalId: b.id })}
                    onClick={() => pick({ mode: 'goal', goalId: b.id })}
                  />
                ))}
                {kind === 'sell' && (canSplit || choice.mode === 'split') && (
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
                    sub={kind === 'buy' ? t.invest.notFromGoalSub : t.invest.notIntoGoalLegacySub}
                    on={picked && choice.mode === 'none'}
                    onClick={() => pick({ mode: 'none' })}
                  />
                )}
              </div>
              {!picked && (
                <p className="text-amber-300/90 text-[11px] font-bold mt-2.5 leading-relaxed">{t.invest.chooseWherePaidFrom}</p>
              )}
              {picked && needsChoice && hasDestination && (
                <p className="text-amber-300/90 text-[11px] font-bold mt-2.5 leading-relaxed">{t.invest.chooseWhereSaleGoes}</p>
              )}
              {picked && needsChoice && !hasDestination && (
                <div className="mt-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 px-3.5 py-3">
                  <p className="text-amber-200/90 text-[11px] font-bold leading-relaxed">{t.invest.noGoalForSale}</p>
                  {onCreateGoal && (
                    <button
                      type="button"
                      onClick={onCreateGoal}
                      className="mt-1.5 text-accent text-xs font-black active:scale-95 transition-transform"
                    >
                      {t.invest.createGoal}
                    </button>
                  )}
                </div>
              )}
            </div>

            {outcome && ready && (
              <div className="mt-5 rounded-2xl bg-white/5 p-4 space-y-2.5">
                <Line label={kind === 'buy' ? t.invest.thisTrade : t.invest.sale} value={money(tradeValue)} />
                <Line label={t.invest.fees} value={money(totalFees(fees))} />
                <div className="h-px bg-white/10" />
                <Line label={kind === 'buy' ? t.invest.totalPaid : t.invest.totalReceived} value={money(totalCents)} strong />
                {moneyLines()}
                <div className="h-px bg-white/10" />
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
                  <p className="text-amber-300/90 text-[11px] font-bold leading-relaxed">
                    {t.invest.saleChangesNothing}
                  </p>
                )}
                {/* Until a source is picked, the hint above already says this. */}
                {preview?.refundPending && picked && (
                  <p className="text-amber-300/90 text-[11px] font-bold leading-relaxed">{t.invest.refundLater}</p>
                )}
                {preview?.takeBackPending && (
                  <p className="text-amber-300/90 text-[11px] font-bold leading-relaxed">{t.invest.takeBackLater}</p>
                )}
              </div>
            )}

            {blocked && <p className="text-red-400 text-xs font-bold mt-4 leading-relaxed">{blocked}</p>}
            {problem && problem !== blocked && (
              <p className="text-red-400 text-xs font-bold mt-4 leading-relaxed">{problem}</p>
            )}

            <button
              onClick={() => void save()}
              disabled={!canSave}
              className="w-full h-14 mt-5 rounded-full bg-primary text-black font-black disabled:opacity-30 active:scale-95 transition-all"
            >
              {editing ? t.common.saveChanges : t.invest.record[kind]}
            </button>

            {editing && (
              <button
                onClick={() => void remove()}
                disabled={busy}
                className="w-full h-12 mt-3 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 font-black disabled:opacity-30 active:scale-95 transition-transform"
              >
                {t.invest.deleteTrade}
              </button>
            )}
          </>
        )}
      </div>

      {refundAsk && (
        <div onClick={(e) => e.stopPropagation()}>
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
        </div>
      )}

      {takeBackAsk && previous?.activity && (
        <div onClick={(e) => e.stopPropagation()}>
          <GoneShareSheet
            distributions={previous.activity.distributions}
            banks={banks}
            activities={activities}
            busy={busy}
            confirmLabel={takeBackAsk.removing ? t.invest.deleteTrade : t.common.saveChanges}
            onChoose={(takeBack) => void (takeBackAsk.removing ? removeWith(undefined, takeBack) : save(undefined, takeBack))}
            onClose={() => setTakeBackAsk(null)}
          />
        </div>
      )}

      {mismatch && (
        <div onClick={(e) => e.stopPropagation()}>
          <FeeMismatchSheet
            mismatch={mismatch}
            invest={invest}
            onUpdate={() => answerMismatch(true)}
            onNotNow={() => answerMismatch(false)}
          />
        </div>
      )}
    </div>
  );
};

export default TradeSheet;
