import React, { useEffect, useMemo, useState } from 'react';
import type { InvestSettings, Trade } from '../../types';
import type { Quotes } from '../../services/holdings';
import { securityTypeOf } from '../../services/fees';
import { reasonsFor, STYLES, type Style } from '../../services/advisor/model';
import { useAdvisor } from '../../hooks/useAdvisor';
import { useQuotes } from '../../hooks/useQuotes';
import { useBackHandler } from '../../hooks/useBackHandler';
import { useT } from '../../contexts/LanguageContext';
import { dateLocale } from '../../i18n';
import WatchlistSheet from './WatchlistSheet';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
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
  <span className={`inline-block size-2 shrink-0 rounded-full ${className}`} style={{ background: STYLE_COLORS[style] }} />
);

const MixBar: React.FC<{ mix: Record<Style, number>; className?: string }> = ({ mix, className = '' }) => (
  <div className={`flex h-2.5 overflow-hidden rounded-full bg-line/10 ${className}`}>
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
const MonthlyBuy: React.FC<MonthlyBuyProps> = ({ uid, trades, invest, quotes, onBack, onRecordBuy, onEditStyle }) => {
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
      <div className="mt-3 rounded-[28px] bg-sun p-5">
        <p className="text-[12.5px] font-bold">{p.bestMatch(monthName)}</p>
        <div className="mt-1 flex min-w-0 items-center gap-2">
          <h3 className="truncate text-[30px] font-extrabold leading-tight tracking-[-0.03em]">{nameOf(pick.symbol)}</h3>
          <span className="shrink-0 rounded-full bg-line/10 px-2.5 py-0.5 text-[11px] font-extrabold">{p.tag[type]}</span>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
          {activeStyles(mix).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5 text-[13px] font-bold">
              <Dot style={s} />
              {p.styles[s]} <b className="font-extrabold tabular-nums">{pct(pick.chance[s], 0)}</b>
            </span>
          ))}
        </div>

        {(forIt.length > 0 || against.length > 0) && (
          <div className="mt-4 space-y-3">
            {forIt.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[12px] font-bold opacity-70">{p.countsFor}</p>
                {forIt.map((r) => (
                  <div key={r.feature} className="flex gap-2 text-[13.5px] font-semibold leading-snug">
                    <Icon name="plus" size={16} className="mt-0.5" />
                    <span className="min-w-0">
                      {r.text}
                      {r.styles.length > 1 && (
                        <span className="ml-1.5 inline-flex gap-1 align-middle">
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
                <p className="text-[12px] font-bold opacity-70">{p.countsAgainst}</p>
                {against.map((r) => (
                  <div key={r.feature} className="flex gap-2 text-[13.5px] font-semibold leading-snug">
                    <Icon name="minus" size={16} className="mt-0.5" />
                    <span className="min-w-0">
                      {r.text}
                      <span className="ml-1.5 inline-flex gap-1 align-middle">
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
          <div className="mt-3 flex gap-2 rounded-2xl bg-line/10 px-3 py-2.5 text-[12.5px] font-semibold leading-relaxed">
            <Icon name="swap" size={16} className="mt-0.5" />
            <span>{p.tie(nameOf(second.symbol))}</span>
          </div>
        )}

        <Button className="mt-5" onClick={() => onRecordBuy({ symbol: pick.symbol, name: nameOf(pick.symbol) })}>
          {p.buyThis(nameOf(pick.symbol))}
        </Button>
        <p className="mt-2 text-center text-[12px] font-medium leading-relaxed opacity-75">{p.buyThisHint}</p>
      </div>
    );
  };

  const renderStatus = () => {
    if (symbols.length === 0) {
      return (
        <div className="mt-3 rounded-3xl bg-card p-6 text-center">
          <span className="mx-auto mb-3 grid size-14 place-items-center rounded-full bg-mint">
            <Icon name="list" size={26} />
          </span>
          <p className="text-[17px] font-extrabold">{p.emptyListTitle}</p>
          <p className="mt-1.5 text-[13px] font-medium leading-relaxed text-mute">{p.emptyListBody}</p>
          <Button className="mt-5" onClick={() => setEditingList(true)}>
            {p.addCounters}
          </Button>
        </div>
      );
    }
    if (symbols.length < 2) {
      return (
        <div className="mt-3 rounded-3xl bg-card p-5">
          <div className="flex gap-2 text-[13px] font-semibold leading-relaxed">
            <Icon name="list" size={18} className="mt-0.5" />
            <span>{p.oneMore}</span>
          </div>
          <Button variant="ghost" className="mt-4 bg-line/10" onClick={() => setEditingList(true)}>
            {p.addCounters}
          </Button>
        </div>
      );
    }
    if (advisor.status === 'unavailable') {
      return (
        <div className="mt-3 rounded-3xl bg-card p-5">
          <div className="flex gap-2 text-[13px] font-semibold leading-relaxed">
            <Icon name="bell" size={18} className="mt-0.5" />
            <span>{p.unavailable}</span>
          </div>
          <Button variant="ghost" className="mt-4 bg-line/10" onClick={() => setPaused(true)}>
            {p.tryAgain}
          </Button>
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
      const share = advisor.status === 'training' ? 1 : advisor.progress ? advisor.progress.done / Math.max(1, advisor.progress.total) : 0;
      return (
        <div className="mt-3 rounded-3xl bg-card p-5">
          <div className="flex items-start gap-2 text-[13px] font-semibold leading-relaxed">
            <Icon name="hist" size={18} className="mt-0.5 animate-pulse motion-reduce:animate-none" />
            <span className="tabular-nums">{text}</span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line/10">
            <div
              className={`h-full rounded-full bg-ink/60 transition-all duration-500 ${advisor.status === 'training' ? 'animate-pulse motion-reduce:animate-none' : ''}`}
              style={{ width: `${Math.round(share * 100)}%` }}
            />
          </div>
        </div>
      );
    }
    if (!pick) {
      return <p className="mt-3 rounded-3xl bg-card p-5 text-[13px] font-medium leading-relaxed text-mute">{p.noScores}</p>;
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
      <div className="mt-5 rounded-3xl bg-card p-5">
        <div className="flex items-center gap-2 text-[14.5px] font-extrabold">
          <Icon name="hist" size={18} />
          {p.recordTitle}
        </div>
        <div className="mt-3 space-y-3">
          {STYLES.map((s) => {
            const r = records?.[s] ?? null;
            const worse = r !== null && !beatsRandom(r);
            return (
              <div key={s} className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-[13.5px] font-extrabold">
                    <Dot style={s} />
                    <span className="truncate">
                      {p.styles[s]} · {mix[s]}%
                    </span>
                  </p>
                  <p className="mt-0.5 pl-3.5 text-[11.5px] font-medium text-mute">{p.recordWhat[s]}</p>
                </div>
                <p className={`max-w-[55%] shrink-0 text-right text-[12px] font-bold tabular-nums leading-snug ${r === null || worse ? 'text-mute' : ''}`}>
                  {r === null ? p.noRecord : p.rightRandom(pct(r.hitRate, 0), pct(r.randomRate, 0))}
                </p>
              </div>
            );
          })}
        </div>
        {span && (
          <p className="mt-3 text-[12px] font-medium leading-relaxed text-mute">
            {p.recordTested(monthText(span.from), monthText(span.to))}
            {beat.length > 0 && ` ${p.recordBeat(names(beat), beat.length)}`}
            {notBeat.length > 0 && (
              <>
                {' '}
                <b className="text-ink">{p.recordNotBeat(names(notBeat), notBeat.length)}</b>
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
        <div className="mb-2 mt-6 flex items-center px-1">
          <h2 className="flex-1 text-[15px] font-extrabold">{p.ranked}</h2>
          <button type="button" onClick={() => setEditingList(true)} className="min-h-11 px-1 text-[13.5px] font-extrabold">
            {t.common.edit}
          </button>
        </div>
        <div className="divide-y divide-line/10 rounded-3xl bg-card px-4 py-1">
          {ranked.map((r, i) => (
            <div key={r.symbol} className="py-3">
              <div className="flex items-baseline gap-2 text-[15px] font-extrabold">
                <span className="w-4 shrink-0 text-[12px] font-bold text-mute">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">{nameOf(r.symbol)}</span>
                <span className={`shrink-0 tabular-nums ${i === 0 ? 'text-pos' : ''}`}>{r.match}</span>
              </div>
              <div className="ml-6 mt-2 grid grid-cols-3 gap-2">
                {STYLES.map((s) => (
                  <div key={s} className="min-w-0">
                    <div className="h-1.5 overflow-hidden rounded-full bg-line/10">
                      <div className="h-full rounded-full" style={{ width: `${Math.round(r.chance[s] * 100)}%`, background: STYLE_COLORS[s] }} />
                    </div>
                    <p className="mt-1 truncate text-[11px] font-bold text-mute">
                      <span className="tabular-nums text-ink">{pct(r.chance[s], 0)}</span> {p.styles[s]}
                    </p>
                  </div>
                ))}
              </div>
              <p className="ml-6 mt-1 text-[11.5px] font-medium tabular-nums text-mute">{factsText(p, r.x)}</p>
            </div>
          ))}
          {rest.map((symbol) => (
            <div key={symbol} className="flex items-baseline gap-2 py-3 text-[14px] font-bold">
              <span className="w-4 shrink-0 text-[12px] text-mute">–</span>
              <span className="min-w-0 truncate text-mute">{nameOf(symbol)}</span>
              {ready && <span className="min-w-0 flex-1 truncate text-right text-[11px] font-medium text-mute">{p.notScored}</span>}
            </div>
          ))}
        </div>
      </>
    );
  };

  return (
    <div className="fixed inset-0 z-[45] flex justify-center bg-page font-figtree text-ink">
      <div className="flex h-full w-full max-w-md flex-col safe-pt">
        <div className="flex shrink-0 items-center gap-3 px-4 pb-1 pt-3">
          <button type="button" onClick={onBack} aria-label={t.common.back} className="grid size-11 shrink-0 place-items-center rounded-full bg-card active:opacity-80">
            <Icon name="back" size={20} />
          </button>
        </div>
        <h1 className="shrink-0 truncate px-5 text-[30px] font-extrabold tracking-tight">{p.title}</h1>

        <div className="no-scrollbar flex-1 overflow-y-auto px-4 pb-16 safe-pb">
          {/* Style */}
          {!invest.style || !mix ? (
            <div className="mt-3 rounded-3xl bg-sun p-5">
              <p className="text-[12.5px] font-bold">{p.yourStyle}</p>
              <p className="mt-1.5 text-[17px] font-extrabold">{p.setStyleTitle}</p>
              <p className="mt-1 text-[13px] font-medium leading-relaxed opacity-80">{p.setStyleBody}</p>
              <Button className="mt-4" onClick={onEditStyle}>
                {p.setStyle}
              </Button>
            </div>
          ) : (
            <>
              <div className="mt-3 flex items-center gap-3 rounded-3xl bg-card px-4 py-3">
                <div className="min-w-0 flex-1">
                  <MixBar mix={mix} />
                  <p className="mt-1.5 text-[12px] font-bold leading-snug">
                    {activeStyles(mix)
                      .map((s) => `${p.styles[s]} ${mix[s]}`)
                      .join(' · ')}
                  </p>
                </div>
                <button type="button" onClick={onEditStyle} className="min-h-11 shrink-0 px-1 text-[13.5px] font-extrabold">
                  {t.common.edit}
                </button>
              </div>

              {renderStatus()}
              {renderRanked()}
              {renderRecord()}
            </>
          )}

          <p className="mt-5 px-3 text-center text-[11.5px] font-medium leading-relaxed text-mute">{p.disclaimer}</p>
        </div>
      </div>

      {editingList && <WatchlistSheet uid={uid} watchlist={invest.watchlist} trades={trades} quotes={merged} onClose={() => setEditingList(false)} />}
    </div>
  );
};

export default MonthlyBuy;
