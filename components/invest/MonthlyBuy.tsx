import React, { useEffect, useMemo, useState } from 'react';
import type { InvestSettings, PiggyBank, Trade } from '../../types';
import type { Quotes } from '../../services/holdings';
import type { MoneyChoice } from '../../services/tradeMoney';
import { brokerById, securityTypeOf } from '../../services/fees';
import { reasonsFor, STYLES, type Style } from '../../services/advisor/model';
import { saveInvest } from '../../services/firestore';
import { formatMoney, fromCents, toCents } from '../../services/money';
import { useAdvisor } from '../../hooks/useAdvisor';
import { useQuotes } from '../../hooks/useQuotes';
import { useBackHandler } from '../../hooks/useBackHandler';
import { useT } from '../../contexts/LanguageContext';
import { dateLocale } from '../../i18n';
import WatchlistSheet from './WatchlistSheet';
import {
  STYLE_COLORS,
  activeStyles,
  defaultPayFrom,
  factsText,
  groupReasons,
  isTie,
  mergeQuotes,
  monthDate,
  pct,
  planBudget,
  pricePointsOfQuote,
  priceText,
  reasonLine,
  beatsRandom,
  recordSpan,
  sizeBuy,
  watchSymbols,
  type Order,
  type PayFrom,
} from './monthlyPlan';

export interface MonthlyBuyDraft {
  symbol: string;
  name: string;
  units: number;
  pricePoints: number;
  choice: MoneyChoice;
}

interface MonthlyBuyProps {
  uid: string;
  banks: PiggyBank[];
  trades: Trade[];
  invest: InvestSettings;
  /** Live quotes; the page also fetches its own for watched counters not held. */
  quotes: Quotes;
  onBack: () => void;
  /** Opens the Buy sheet pre-filled; the integrator handles questionnaire/broker gating first. */
  onRecordBuy: (draft: MonthlyBuyDraft) => void;
  onEditStyle: () => void;
  onEditBroker: () => void;
}

const money = (cents: number, decimals: 0 | 2 = 2) => formatMoney(fromCents(cents), { decimals });
const unitsText = (n: number) => n.toLocaleString('en-US');

const Dot: React.FC<{ style: Style; className?: string }> = ({ style, className = '' }) => (
  <span className={`inline-block size-2 rounded-full shrink-0 ${className}`} style={{ background: STYLE_COLORS[style] }} />
);

const MixBar: React.FC<{ mix: Record<Style, number>; className?: string }> = ({ mix, className = '' }) => (
  <div className={`flex h-2.5 rounded-full overflow-hidden bg-white/5 ${className}`}>
    {STYLES.map((s) => (
      <i key={s} className="block h-full" style={{ width: `${mix[s]}%`, background: STYLE_COLORS[s] }} />
    ))}
  </div>
);

/** A radio row: a goal to pay from, or one of the two ways to handle odd units. */
const Option: React.FC<{
  on: boolean;
  icon: string;
  muted?: boolean;
  label: string;
  hint?: string;
  value?: string;
  onClick: () => void;
}> = ({ on, icon, muted, label, hint, value, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl border text-left transition-colors ${
      on ? 'bg-primary/5 border-primary/45' : 'bg-white/5 border-white/10'
    }`}
  >
    <span
      className={`size-8 shrink-0 rounded-xl flex items-center justify-center ${
        muted ? 'bg-white/5 text-slate-400' : 'bg-primary/10 text-primary'
      }`}
    >
      <span className="material-symbols-rounded text-lg">{icon}</span>
    </span>
    <span className="flex-1 min-w-0">
      <span className="block text-white text-[13px] font-black truncate">{label}</span>
      {hint && <span className="block text-slate-500 text-[11px] font-bold leading-snug mt-0.5">{hint}</span>}
    </span>
    {value && <span className="shrink-0 text-slate-300 text-xs font-black tabular-nums">{value}</span>}
    <span className={`size-4 shrink-0 rounded-full ${on ? 'border-[5px] border-primary' : 'border-2 border-slate-600'}`} />
  </button>
);

const Line: React.FC<{ label: string; value: string; tone?: 'sub' | 'total' | 'left' }> = ({ label, value, tone }) => (
  <div
    className={`flex items-baseline gap-3 ${
      tone === 'sub'
        ? 'pl-3 text-xs text-slate-500'
        : tone === 'total'
          ? 'pt-2.5 border-t border-white/10 text-sm text-white'
          : 'text-[13px] text-slate-400'
    } font-bold`}
  >
    <span className="flex-1 min-w-0">{label}</span>
    <span
      className={`shrink-0 tabular-nums font-black ${
        tone === 'sub' ? 'text-slate-300' : tone === 'left' ? 'text-accent' : tone === 'total' ? 'text-white text-base' : 'text-white'
      }`}
    >
      {value}
    </span>
  </div>
);

/**
 * This month's buy: where the money comes from, how much, which counter on
 * the person's own list fits their style best, and exactly what it costs.
 *
 * The page never writes a trade. "Record this buy" hands a draft to the Buy
 * sheet, which is where the goal's money actually moves — so there is one
 * place a buy is recorded, whichever way someone got there.
 */
const MonthlyBuy: React.FC<MonthlyBuyProps> = ({
  uid,
  banks,
  trades,
  invest,
  quotes,
  onBack,
  onRecordBuy,
  onEditStyle,
  onEditBroker,
}) => {
  const t = useT();
  const p = t.plan;
  const [editingList, setEditingList] = useState(false);
  useBackHandler(true, onBack);

  /* ---------------------------------------------------------- pay from */

  const goals = useMemo(() => banks.filter((b) => !b.archivedAt), [banks]);
  const [payFrom, setPayFrom] = useState<PayFrom>(() => defaultPayFrom(banks, invest.budgetGoalId));
  /** What was typed; null follows the goal's whole balance, so it stays right as the balance moves. */
  const [budgetText, setBudgetText] = useState<string | null>(null);

  const choosePayFrom = (next: PayFrom) => {
    setPayFrom(next);
    setBudgetText(null);
    // Only a goal is remembered. Picking "not from a goal" for one month
    // should not make the page forget which goal the buys usually come from.
    if (next.mode === 'goal' && next.goalId !== invest.budgetGoalId) {
      saveInvest(uid, { budgetGoalId: next.goalId }).catch(() => {});
    }
  };

  const typedCents = budgetText === null ? null : toCents(Math.max(0, parseFloat(budgetText) || 0));
  const budget = planBudget(payFrom, typedCents, banks);
  const payGoal = payFrom.mode === 'goal' ? banks.find((b) => b.id === payFrom.goalId) ?? null : null;
  const inputValue =
    budgetText ?? (budget.balanceCents !== null ? String(fromCents(budget.balanceCents)) : '');
  const chips: { label: string; cents: number | null }[] = [
    ...(payFrom.mode === 'goal' ? [{ label: p.allOfIt, cents: null }] : []),
    { label: 'RM1,000', cents: 100_000 },
    { label: 'RM500', cents: 50_000 },
  ];

  /* ------------------------------------------------------------ advisor */

  const symbols = useMemo(() => watchSymbols(invest.watchlist), [invest.watchlist]);
  const { quotes: live } = useQuotes(symbols);
  const merged = useMemo(() => mergeQuotes(quotes, live), [quotes, live]);
  const mix = invest.style?.mix ?? null;

  // Trying again switches the advisor off for one render and back on, which
  // runs its download from the start; whatever did arrive is already cached.
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) setPaused(false);
  }, [paused]);

  const advisor = useAdvisor({
    watchlist: symbols,
    mix,
    quotes: merged,
    enabled: symbols.length >= 2 && !!invest.style && !paused,
  });

  const nameOf = (symbol: string) => invest.watchlist.find((w) => w.symbol === symbol)?.name ?? symbol;
  const month = monthDate(advisor.month);
  const monthName = month.toLocaleDateString(dateLocale('en-GB'), { month: 'long' });

  const ready = advisor.status === 'ready';
  const ranked = ready ? advisor.ranked : [];
  const pick = ranked[0] ?? null;

  /* ------------------------------------------------------------- sizing */

  const broker = brokerById(invest.brokerId, invest.customRule);
  const pricePoints = pick ? pricePointsOfQuote(merged[pick.symbol]) : null;
  const type = pick ? securityTypeOf(pick.symbol, invest.typeOverrides) : 'EQUITY';
  const [allNow, setAllNow] = useState(false);
  useEffect(() => setAllNow(false), [pick?.symbol]);

  const sizing = pick && broker && pricePoints ? sizeBuy(budget.cashCents, pricePoints, broker, type, allNow) : null;
  const order: Order | null = sizing && sizing.kind !== 'none' ? sizing.order : null;

  const pill = !sizing
    ? null
    : sizing.kind === 'none'
      ? { text: p.pill.skip, cls: 'bg-slate-400/10 text-slate-400' }
      : sizing.kind === 'shortOfLot'
        ? order
          ? { text: p.pill.odd, cls: 'bg-accent/15 text-accent' }
          : { text: p.pill.wait, cls: 'bg-amber-400/10 text-amber-400' }
        : sizing.odd > 0 && allNow
          ? { text: p.pill.odd, cls: 'bg-accent/15 text-accent' }
          : sizing.odd > 0
            ? { text: p.pill.lots, cls: 'bg-accent/15 text-accent' }
            : { text: p.pill.buy, cls: 'bg-primary/15 text-primary' };

  const record = () => {
    if (!pick || !order || !pricePoints || order.units <= 0) return;
    onRecordBuy({
      symbol: pick.symbol,
      name: nameOf(pick.symbol),
      units: order.units,
      pricePoints,
      choice: payFrom.mode === 'goal' ? { mode: 'goal', goalId: payFrom.goalId } : { mode: 'none' },
    });
  };

  /* ------------------------------------------------------------- render */

  const renderOrder = (o: Order) => {
    const odd = o.units % 100;
    return (
      <>
        <div className="mt-4 pt-3 border-t border-white/10 space-y-2.5">
          <Line label={p.unitsAt(unitsText(o.units), priceText(pricePoints!))} value={money(o.valueCents)} />
          <Line tone="sub" label={p.brokerage} value={money(o.fees.brokerageCents)} />
          <Line tone="sub" label={p.clearing} value={money(o.fees.clearingCents)} />
          <Line tone="sub" label={p.stamp} value={money(o.fees.stampCents)} />
          {type === 'REIT' && <Line tone="sub" label={p.sst} value={money(o.fees.sstCents)} />}
          <Line tone="total" label={p.total} value={money(o.totalCents)} />
          {payGoal && budget.balanceCents !== null ? (
            <Line tone="left" label={p.staysIn(payGoal.name)} value={money(budget.balanceCents - o.totalCents)} />
          ) : (
            <Line tone="left" label={p.leftOfBudget} value={money(o.leftCents)} />
          )}
        </div>
        {o.drag > 0.01 && (
          <div className="flex gap-2 items-start mt-3 px-3 py-2.5 rounded-2xl bg-amber-400/5 text-amber-300 text-[11px] font-bold leading-relaxed">
            <span className="material-symbols-rounded text-base shrink-0">warning</span>
            <span>{p.feeDrag(pct(o.drag, 2))}</span>
          </div>
        )}
        <p className="text-slate-600 text-[10px] font-bold mt-3">{p.ratesOf(broker!.name || p.ownRates)}</p>
        <button
          onClick={record}
          className="w-full h-14 mt-3 rounded-full bg-primary text-black font-black active:scale-95 transition-transform"
        >
          {p.recordBuy}
        </button>
        {odd > 0 && (
          <div className="flex gap-2 items-start mt-3 text-slate-400 text-[11px] font-semibold leading-relaxed">
            <span className="material-symbols-rounded text-base text-slate-500 shrink-0">info</span>
            <span>{p.oddNote(priceText(pricePoints!), unitsText(odd))}</span>
          </div>
        )}
      </>
    );
  };

  const renderSizing = () => {
    if (!broker) {
      return (
        <div className="mt-4 pt-4 border-t border-white/10">
          <p className="text-slate-300 text-xs font-bold leading-relaxed">{p.chooseBroker}</p>
          <button
            onClick={onEditBroker}
            className="w-full h-12 mt-3 rounded-full glass border border-white/10 text-accent font-black active:scale-95 transition-transform"
          >
            {p.chooseBrokerButton}
          </button>
        </div>
      );
    }
    if (!pricePoints || !sizing) {
      return <p className="mt-4 pt-4 border-t border-white/10 text-slate-500 text-xs font-bold">{p.noPrice}</p>;
    }
    if (sizing.kind === 'none') {
      return (
        <div className="flex gap-2 items-start mt-4 pt-4 border-t border-white/10">
          <span className="material-symbols-rounded text-base text-slate-500 shrink-0">savings</span>
          <div className="min-w-0">
            <p className="text-white text-[13px] font-black">{p.notOneUnit}</p>
            <p className="text-slate-400 text-[11px] font-semibold leading-relaxed mt-0.5">{p.oneUnitCosts(money(sizing.oneUnitCents))}</p>
          </div>
        </div>
      );
    }
    if (sizing.kind === 'shortOfLot') {
      return (
        <>
          <p className="mt-4 pt-4 border-t border-white/10 text-amber-300 text-[13px] font-black">
            {p.notALot(money(sizing.shortCents))}
          </p>
          <div className="mt-3 space-y-1.5">
            <Option on={!allNow} icon="inventory_2" label={p.waitForLot} hint={p.waitForLotHint} onClick={() => setAllNow(false)} />
            <Option
              on={allNow}
              icon="scatter_plot"
              muted
              label={p.buyAllNow(unitsText(sizing.units))}
              hint={p.buyAllNowHint(unitsText(sizing.units))}
              onClick={() => setAllNow(true)}
            />
          </div>
          {order ? (
            renderOrder(order)
          ) : (
            <div className="mt-4 pt-3 border-t border-white/10 space-y-2.5">
              <Line label={p.oneLotCosts} value={money(sizing.lotCents)} />
            </div>
          )}
        </>
      );
    }
    return (
      <>
        {sizing.odd > 0 && (
          <div className="mt-4 space-y-1.5">
            <Option
              on={!allNow}
              icon="inventory_2"
              label={p.fullLotsOnly(unitsText(sizing.lots * 100))}
              hint={p.fullLotsHint(unitsText(sizing.odd))}
              onClick={() => setAllNow(false)}
            />
            <Option
              on={allNow}
              icon="scatter_plot"
              muted
              label={p.buyAllNow(unitsText(sizing.units))}
              hint={p.buyAllNowHint(unitsText(sizing.odd))}
              onClick={() => setAllNow(true)}
            />
          </div>
        )}
        {renderOrder(sizing.order)}
      </>
    );
  };

  const renderPick = () => {
    if (!pick || !mix) return null;
    const reasons = reasonsFor(pick, mix);
    const list = advisor.ranked.map((c) => c.x);
    const forIt = groupReasons(reasons.forIt)
      .map((r) => ({ ...r, text: reasonLine(p, r.feature, pick.x, 'for', list) }))
      .filter((r): r is typeof r & { text: string } => r.text !== null);
    const against = groupReasons(reasons.against)
      .map((r) => ({ ...r, text: reasonLine(p, r.feature, pick.x, 'against', list) }))
      .filter((r): r is typeof r & { text: string } => r.text !== null);
    const second = ranked[1];
    return (
      <div className="mt-4 rounded-[2rem] bg-surface border border-white/5 p-5">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">{p.bestMatch(monthName)}</p>
            <div className="flex items-center gap-2 mt-1 min-w-0">
              <h3 className="text-white text-2xl font-black tracking-tight truncate">{nameOf(pick.symbol)}</h3>
              <span className="shrink-0 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/5 text-slate-400">
                {p.tag[type]}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
              {activeStyles(mix).map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5 text-slate-300 text-xs font-bold">
                  <Dot style={s} />
                  {p.styles[s]} <b className="text-white font-black tabular-nums">{pct(pick.chance[s], 0)}</b>
                </span>
              ))}
            </div>
          </div>
          {pill && (
            <span className={`shrink-0 mt-4 text-[9px] font-black tracking-wider px-2 py-1 rounded-full whitespace-nowrap ${pill.cls}`}>
              {pill.text}
            </span>
          )}
        </div>

        {(forIt.length > 0 || against.length > 0) && (
          <div className="mt-4 space-y-3">
            {forIt.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">{p.countsFor}</p>
                {forIt.map((r) => (
                  <div key={r.feature} className="flex gap-2 text-slate-300 text-xs font-bold leading-snug">
                    <span className="material-symbols-rounded text-[16px] shrink-0" style={{ color: STYLE_COLORS[r.styles[0]] }}>
                      add_circle
                    </span>
                    <span className="min-w-0">
                      {r.text}
                      {r.styles.length > 1 && (
                        <span className="inline-flex gap-1 ml-1.5 align-middle">
                          {r.styles.map((s) => (
                            <Dot key={s} style={s} />
                          ))}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {against.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">{p.countsAgainst}</p>
                {against.map((r) => (
                  <div key={r.feature} className="flex gap-2 text-slate-300 text-xs font-bold leading-snug">
                    <span className="material-symbols-rounded text-[16px] text-slate-500 shrink-0">do_not_disturb_on</span>
                    <span className="min-w-0">
                      {r.text}
                      <span className="inline-flex gap-1 ml-1.5 align-middle">
                        {r.styles.map((s) => (
                          <Dot key={s} style={s} />
                        ))}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {second && isTie(ranked) && (
          <div className="flex gap-2 mt-3 px-3 py-2.5 rounded-2xl bg-white/5 text-slate-300 text-[11px] font-bold leading-relaxed">
            <span className="material-symbols-rounded text-base text-slate-400 shrink-0">balance</span>
            <span>{p.tie(nameOf(second.symbol))}</span>
          </div>
        )}

        {renderSizing()}
      </div>
    );
  };

  const renderStatus = () => {
    if (symbols.length === 0) {
      return (
        <div className="mt-4 rounded-[2rem] glass p-6 text-center">
          <span className="material-symbols-rounded text-slate-600 text-5xl">playlist_add</span>
          <p className="text-white font-black mt-3">{p.emptyListTitle}</p>
          <p className="text-slate-500 text-xs font-bold mt-1.5 leading-relaxed">{p.emptyListBody}</p>
          <button
            onClick={() => setEditingList(true)}
            className="w-full h-12 mt-5 rounded-full bg-accent text-black font-black active:scale-95 transition-transform"
          >
            {p.addCounters}
          </button>
        </div>
      );
    }
    if (symbols.length < 2) {
      return (
        <div className="mt-4 rounded-[2rem] glass p-5">
          <div className="flex gap-2 text-slate-300 text-xs font-bold leading-relaxed">
            <span className="material-symbols-rounded text-base text-slate-500 shrink-0">playlist_add</span>
            <span>{p.oneMore}</span>
          </div>
          <button
            onClick={() => setEditingList(true)}
            className="w-full h-12 mt-4 rounded-full glass border border-white/10 text-accent font-black active:scale-95 transition-transform"
          >
            {p.addCounters}
          </button>
        </div>
      );
    }
    if (advisor.status === 'unavailable') {
      return (
        <div className="mt-4 rounded-[2rem] glass p-5">
          <div className="flex gap-2 text-slate-300 text-xs font-bold leading-relaxed">
            <span className="material-symbols-rounded text-base text-slate-500 shrink-0">cloud_off</span>
            <span>{p.unavailable}</span>
          </div>
          <button
            onClick={() => setPaused(true)}
            className="w-full h-12 mt-4 rounded-full glass border border-white/10 text-accent font-black active:scale-95 transition-transform"
          >
            {p.tryAgain}
          </button>
        </div>
      );
    }
    if (!ready) {
      const text =
        advisor.status === 'training'
          ? p.training
          : advisor.progress
            ? p.loadingProgress(advisor.progress.done, advisor.progress.total)
            : p.loading;
      const share =
        advisor.status === 'training' ? 1 : advisor.progress ? advisor.progress.done / Math.max(1, advisor.progress.total) : 0;
      return (
        <div className="mt-4 rounded-[2rem] glass p-5">
          <div className="flex gap-2 items-start text-slate-300 text-xs font-bold leading-relaxed">
            <span className="material-symbols-rounded text-base text-accent shrink-0 animate-spin">progress_activity</span>
            <span className="tabular-nums">{text}</span>
          </div>
          <div className="h-1.5 mt-3 rounded-full bg-white/5 overflow-hidden">
            <div
              className={`h-full rounded-full bg-accent/70 transition-all duration-500 ${advisor.status === 'training' ? 'animate-pulse' : ''}`}
              style={{ width: `${Math.round(share * 100)}%` }}
            />
          </div>
        </div>
      );
    }
    if (!pick) {
      return <p className="mt-4 rounded-[2rem] glass p-5 text-slate-400 text-xs font-bold leading-relaxed">{p.noScores}</p>;
    }
    return renderPick();
  };

  const renderRecord = () => {
    if (!ready || !mix || !pick) return null;
    const records = advisor.records;
    const span = recordSpan(records);
    const judged = STYLES.filter((s) => records?.[s]);
    // "Beaten a random pick" is only said when it is clearly true; a couple of
    // points either way is noise, not skill.
    const beat = judged.filter((s) => beatsRandom(records![s]!));
    const notBeat = judged.filter((s) => !beatsRandom(records![s]!));
    const names = (list: Style[]) => list.map((s) => p.styles[s]).join(p.and);
    const monthText = (key: string) => monthDate(key).toLocaleDateString(dateLocale('en-GB'), { month: 'short', year: 'numeric' });
    return (
      <div className="mt-5 rounded-3xl border border-amber-400/20 bg-amber-400/5 p-4">
        <div className="flex items-center gap-2 text-amber-300 text-[13px] font-black">
          <span className="material-symbols-rounded text-lg">history</span>
          {p.recordTitle}
        </div>
        <div className="mt-3 space-y-2.5">
          {STYLES.map((s) => {
            const r = records?.[s] ?? null;
            const worse = r !== null && !beatsRandom(r);
            return (
              <div key={s} className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="flex items-center gap-1.5 text-white text-xs font-black">
                    <Dot style={s} />
                    <span className="truncate">
                      {p.styles[s]} · {mix[s]}%
                    </span>
                  </p>
                  <p className="text-slate-500 text-[10px] font-bold mt-0.5 pl-3.5">{p.recordWhat[s]}</p>
                </div>
                <p
                  className={`shrink-0 max-w-[55%] text-right text-[11px] font-black tabular-nums leading-snug ${
                    r === null ? 'text-slate-500' : worse ? 'text-slate-400' : 'text-white'
                  }`}
                >
                  {r === null ? p.noRecord : p.rightRandom(pct(r.hitRate, 0), pct(r.randomRate, 0))}
                </p>
              </div>
            );
          })}
        </div>
        {span && (
          <p className="mt-3 text-slate-300 text-[11px] font-semibold leading-relaxed">
            {p.recordTested(monthText(span.from), monthText(span.to))}
            {beat.length > 0 && ` ${p.recordBeat(names(beat), beat.length)}`}
            {notBeat.length > 0 && (
              <>
                {' '}
                <b className="text-white">{p.recordNotBeat(names(notBeat), notBeat.length)}</b>
              </>
            )}
          </p>
        )}
      </div>
    );
  };

  const renderRanked = () => {
    if (symbols.length === 0) return null;
    const scored = new Set(ranked.map((r) => r.symbol));
    const rest = symbols.filter((s) => !scored.has(s));
    return (
      <>
        <div className="flex items-center mt-6">
          <p className="flex-1 text-slate-500 text-[10px] font-black uppercase tracking-widest">{p.ranked}</p>
          <button onClick={() => setEditingList(true)} className="text-accent text-[13px] font-black px-1 py-1">
            {t.common.edit}
          </button>
        </div>
        <div className="mt-2 space-y-4">
          {ranked.map((r, i) => (
            <div key={r.symbol}>
              <div className="flex items-baseline gap-2 text-[13px] font-black">
                <span className="w-4 shrink-0 text-slate-600 text-[11px]">{i + 1}</span>
                <span className="flex-1 min-w-0 truncate text-white">{nameOf(r.symbol)}</span>
                <span className={`shrink-0 tabular-nums ${i === 0 ? 'text-accent' : 'text-slate-300'}`}>{r.match}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-1.5 ml-6">
                {STYLES.map((s) => (
                  <div key={s} className="min-w-0">
                    <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.round(r.chance[s] * 100)}%`, background: STYLE_COLORS[s] }} />
                    </div>
                    <p className="text-slate-500 text-[10px] font-bold mt-1 truncate">
                      <span className="text-slate-300 tabular-nums">{pct(r.chance[s], 0)}</span> {p.styles[s]}
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-slate-500 text-[10px] font-bold mt-1 ml-6 tabular-nums">{factsText(p, r.x)}</p>
            </div>
          ))}
          {rest.map((symbol) => (
            <div key={symbol} className="flex items-baseline gap-2 text-[13px] font-black">
              <span className="w-4 shrink-0 text-slate-700 text-[11px]">–</span>
              <span className="min-w-0 truncate text-slate-400">{nameOf(symbol)}</span>
              {ready && <span className="flex-1 min-w-0 truncate text-right text-slate-600 text-[10px] font-bold">{p.notScored}</span>}
            </div>
          ))}
        </div>
      </>
    );
  };

  return (
    <div className="fixed inset-0 z-[45] bg-bg-dark flex justify-center">
      <div className="w-full max-w-md h-full flex flex-col safe-pt">
        <div className="flex items-center px-6 py-4 gap-3 shrink-0">
          <button
            onClick={onBack}
            aria-label={t.common.back}
            className="size-10 shrink-0 rounded-full glass flex items-center justify-center text-slate-300 active:scale-90 transition-transform"
          >
            <span className="material-symbols-rounded text-xl">arrow_back_ios_new</span>
          </button>
          <h2 className="flex-1 min-w-0 truncate text-white text-2xl font-black tracking-tight">{p.title}</h2>
          <button
            onClick={onEditBroker}
            aria-label={p.changeBroker}
            className="size-10 shrink-0 rounded-full glass flex items-center justify-center text-slate-300 active:scale-90 transition-transform"
          >
            <span className="material-symbols-rounded text-xl">tune</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar px-6 pb-16 safe-pb">
          {/* Where the money comes from */}
          <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">{p.payFrom}</p>
          <div className="mt-2 space-y-1.5">
            {goals.map((g) => (
              <Option
                key={g.id}
                on={payFrom.mode === 'goal' && payFrom.goalId === g.id}
                icon={g.icon}
                label={g.name}
                value={formatMoney(g.currentAmount)}
                onClick={() => choosePayFrom({ mode: 'goal', goalId: g.id })}
              />
            ))}
            <Option
              on={payFrom.mode === 'none'}
              icon="block"
              muted
              label={t.common.notFromGoal}
              hint={p.notFromGoalHint}
              onClick={() => choosePayFrom({ mode: 'none' })}
            />
          </div>

          <label htmlFor="monthly-budget" className="block mt-4 text-slate-500 text-[10px] font-black uppercase tracking-widest">
            {payFrom.mode === 'none' ? p.monthBudget : p.spendUpTo}
          </label>
          <div className="mt-2 flex items-center gap-2 h-14 px-4 rounded-2xl bg-white/5 border border-white/10 focus-within:border-accent/50 transition-colors">
            <span className="text-slate-500 font-black shrink-0">RM</span>
            <input
              id="monthly-budget"
              type="number"
              inputMode="decimal"
              value={inputValue}
              onChange={(e) => setBudgetText(e.target.value)}
              placeholder="0.00"
              className="w-full min-w-0 border-0 bg-transparent text-white text-xl font-black tabular-nums focus:outline-none placeholder:text-slate-700"
            />
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {chips.map((chip) => {
              const on = chip.cents === null ? budgetText === null : typedCents === chip.cents;
              return (
                <button
                  key={chip.label}
                  onClick={() => setBudgetText(chip.cents === null ? null : String(fromCents(chip.cents)))}
                  className={`h-8 px-3 rounded-full border text-xs font-black transition-colors ${
                    on ? 'bg-accent/15 border-accent/35 text-accent' : 'bg-white/5 border-white/10 text-slate-300'
                  }`}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>
          {budget.over && payGoal && budget.balanceCents !== null && (
            <p className="mt-2 text-red-400 text-[11px] font-bold leading-relaxed">
              {p.overBalance(payGoal.name, money(budget.balanceCents))}
            </p>
          )}

          {/* Style */}
          {!invest.style || !mix ? (
            <div className="mt-5 rounded-[2rem] bg-accent/5 border border-accent/25 p-5">
              <p className="text-accent text-[10px] font-black uppercase tracking-widest">{p.yourStyle}</p>
              <p className="text-white font-black mt-1.5">{p.setStyleTitle}</p>
              <p className="text-slate-400 text-xs font-bold mt-1 leading-relaxed">{p.setStyleBody}</p>
              <button
                onClick={onEditStyle}
                className="w-full h-12 mt-4 rounded-full bg-accent text-black font-black active:scale-95 transition-transform"
              >
                {p.setStyle}
              </button>
            </div>
          ) : (
            <>
              <div className="mt-5 flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-white/5 border border-white/10">
                <div className="flex-1 min-w-0">
                  <MixBar mix={mix} />
                  <p className="mt-1.5 text-slate-300 text-[11px] font-black leading-snug">
                    {activeStyles(mix)
                      .map((s) => `${p.styles[s]} ${mix[s]}`)
                      .join(' · ')}
                  </p>
                </div>
                <button onClick={onEditStyle} className="shrink-0 text-accent text-[13px] font-black px-1 py-1">
                  {t.common.edit}
                </button>
              </div>

              {renderStatus()}
              {renderRanked()}
              {renderRecord()}
            </>
          )}

          <p className="mt-5 text-center text-slate-600 text-[10px] font-semibold leading-relaxed">{p.disclaimer}</p>
        </div>
      </div>

      {editingList && (
        <WatchlistSheet
          uid={uid}
          watchlist={invest.watchlist}
          trades={trades}
          quotes={merged}
          onClose={() => setEditingList(false)}
        />
      )}
    </div>
  );
};

export default MonthlyBuy;
