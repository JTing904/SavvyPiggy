import React, { useEffect, useMemo, useState } from 'react';
import type { InvestSettings, PiggyBank, Trade } from '../../types';
import type { Quotes } from '../../services/holdings';
import { securityTypeOf } from '../../services/fees';
import { reasonsFor, STYLES, type Style } from '../../services/advisor/model';
import { useAdvisor } from '../../hooks/useAdvisor';
import { useQuotes } from '../../hooks/useQuotes';
import { useBackHandler } from '../../hooks/useBackHandler';
import { useT } from '../../contexts/LanguageContext';
import { dateLocale } from '../../i18n';
import WatchlistSheet from './WatchlistSheet';
import {
  STYLE_COLORS,
  activeStyles,
  factsText,
  groupReasons,
  isTie,
  mergeQuotes,
  monthDate,
  pct,
  reasonLine,
  beatsRandom,
  recordSpan,
  watchSymbols,
} from './monthlyPlan';

/** The counter to buy; units and price are the person's, from their contract note. */
export interface MonthlyBuyDraft {
  symbol: string;
  name: string;
}

interface MonthlyBuyProps {
  uid: string;
  banks: PiggyBank[];
  trades: Trade[];
  invest: InvestSettings;
  /** Live quotes; the page also fetches its own for watched counters not held. */
  quotes: Quotes;
  onBack: () => void;
  /** Opens the Buy sheet with the counter filled in; the integrator handles questionnaire/broker gating first. */
  onRecordBuy: (draft: MonthlyBuyDraft) => void;
  onEditStyle: () => void;
}

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

/**
 * This month's recommendation: which counter on the person's own list fits
 * their style best, why, and how often each style's model has been right.
 *
 * It is not a monthly plan — no budget, no lot sizing. "Buy" only opens the
 * Buy sheet with the counter filled in; the person types units and price from
 * their contract note, and the money comes out of the investment pot there.
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
}) => {
  const t = useT();
  const p = t.plan;
  const [editingList, setEditingList] = useState(false);
  useBackHandler(true, onBack);

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

  const type = pick ? securityTypeOf(pick.symbol, invest.typeOverrides) : 'EQUITY';

  /* ------------------------------------------------------------- render */

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

        <button
          onClick={() => onRecordBuy({ symbol: pick.symbol, name: nameOf(pick.symbol) })}
          className="w-full h-14 mt-5 rounded-full bg-primary text-black font-black flex items-center justify-center gap-2 active:scale-95 transition-transform"
        >
          <span className="material-symbols-rounded text-xl">add_shopping_cart</span>
          {p.buyThis(nameOf(pick.symbol))}
        </button>
        <p className="text-slate-500 text-[11px] font-bold mt-2 text-center leading-relaxed">{p.buyThisHint}</p>
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
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar px-6 pb-16 safe-pb">
          {/* Style */}
          {!invest.style || !mix ? (
            <div className="rounded-[2rem] bg-accent/5 border border-accent/25 p-5">
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
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-white/5 border border-white/10">
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
