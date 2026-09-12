import React, { useEffect, useMemo, useState } from 'react';
import type { Trade } from '../types';
import { averageCostCents, buildHoldings, normalizeSymbol, replay, tradeCents } from '../services/holdings';
import { searchSymbols, type SymbolHit } from '../services/quotes';
import { createTrade, deleteTrade, updateTrade } from '../services/firestore';
import { formatMoney, fromCents, toCents } from '../services/money';
import { fromInputDate, toInputDate } from '../services/calendar';
import { useBackHandler } from '../hooks/useBackHandler';
import { useConfirm } from '../contexts/ConfirmContext';
import DateField from './DateField';

/**
 * What the sheet has been opened to do. Recording a trade and correcting one
 * ask for the same three things — a date, a number of units and a price — so
 * they share a form; only what happens on Save differs.
 */
export type TradeDraft =
  | { mode: 'new'; kind: 'buy' | 'sell'; symbol?: string; name?: string }
  | { mode: 'edit'; trade: Trade };

interface TradeSheetProps {
  uid: string;
  /** The whole log, so the sheet can show what the position becomes. */
  trades: Trade[];
  draft: TradeDraft;
  onClose: () => void;
  onDone: (message: string) => void;
}

const money = (cents: number, opts?: { decimals?: 0 | 2; signed?: boolean }) =>
  formatMoney(fromCents(cents), opts);

const LABEL: Record<Trade['kind'], string> = { buy: 'Buy', sell: 'Sell', dividend: 'Dividend' };

const Field: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  prefix?: string;
  autoFocus?: boolean;
}> = ({ label, value, onChange, type = 'number', prefix, autoFocus }) => (
  <div className="flex-1 min-w-0">
    <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-2">{label}</p>
    <div className="flex items-center gap-2 h-14 px-4 rounded-2xl bg-white/5 border border-white/10 focus-within:border-primary/50 transition-colors">
      {prefix && <span className="text-slate-500 font-black shrink-0">{prefix}</span>}
      <input
        autoFocus={autoFocus}
        type={type}
        inputMode={type === 'number' ? 'decimal' : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={type === 'number' ? '0' : undefined}
        className="w-full border-0 bg-transparent text-white text-lg font-black focus:outline-none placeholder:text-slate-700"
      />
    </div>
  </div>
);

const TradeSheet: React.FC<TradeSheetProps> = ({ uid, trades, draft, onClose, onDone }) => {
  const confirm = useConfirm();
  const editing = draft.mode === 'edit' ? draft.trade : null;
  const kind: Trade['kind'] = draft.mode === 'edit' ? draft.trade.kind : draft.kind;

  const [symbol, setSymbol] = useState(editing?.symbol ?? (draft.mode === 'new' ? draft.symbol ?? '' : ''));
  const [name, setName] = useState(editing?.name ?? (draft.mode === 'new' ? draft.name ?? '' : ''));
  const [units, setUnits] = useState(editing ? String(editing.units) : '');
  const [price, setPrice] = useState(editing ? fromCents(editing.priceCents).toFixed(kind === 'dividend' ? 4 : 2) : '');
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
  const priceCents = toCents(Number(price) || 0);
  const tradedAt = fromInputDate(date);
  const canSave = !!symbol && unitsIn > 0 && priceCents > 0 && !busy;

  /**
   * What the position becomes once this trade is in the log — every other
   * trade left exactly as it is. Editing one line can only ever move the
   * numbers by that line's worth, and this is where you see it before saving.
   */
  const outcome = useMemo(() => {
    if (!symbol) return null;
    const mine = trades.filter((t) => t.symbol === symbol);
    const before = replay(mine);
    const candidate: Trade = {
      id: editing?.id ?? 'draft',
      symbol,
      name,
      kind,
      units: unitsIn,
      priceCents,
      tradedAt,
      createdAt: editing?.createdAt ?? Date.now(),
    };
    const after = replay([...mine.filter((t) => t.id !== editing?.id), candidate]);
    return { before, after };
  }, [trades, symbol, name, kind, unitsIn, priceCents, tradedAt, editing]);

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    setProblem(null);
    try {
      const body = { symbol, name: name || symbol, kind, units: unitsIn, priceCents, tradedAt };
      if (editing) {
        await updateTrade(uid, editing.id, body);
        onDone(`${name || symbol} trade corrected.`);
      } else {
        await createTrade(uid, body);
        onDone(`${LABEL[kind]} recorded · ${unitsIn} units of ${name || symbol}.`);
      }
      onClose();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Could not save that.');
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!editing || busy) return;
    const ok = await confirm({
      title: 'Delete this trade?',
      body: 'The position is worked out again from the remaining trades, so your units and average cost will move.',
      tone: 'danger',
      confirmLabel: 'Delete',
      detail: {
        icon: editing.kind === 'sell' ? 'trending_down' : 'trending_up',
        tint: editing.kind === 'sell' ? 'bg-slate-500/10 text-slate-400' : 'bg-accent/10 text-accent',
        label: `${LABEL[editing.kind]} · ${editing.name || editing.symbol}`,
        meta: `${editing.units.toLocaleString('en-US')} units · ${new Date(editing.tradedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`,
        amount: money(tradeCents(editing)),
      },
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteTrade(uid, editing.id);
      onDone('Trade deleted.');
      onClose();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Could not delete that.');
      setBusy(false);
    }
  };

  // A dividend is not edited here, so it is not titled as if it were.
  const title =
    kind === 'dividend' ? 'Dividend' : editing ? `Edit · ${LABEL[kind]}` : kind === 'buy' ? 'Buy' : 'Sell';

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/85 veil-in" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md mx-auto bg-surface sheet-rise rounded-t-[2rem] border-t border-white/10 px-6 pt-4 pb-8 max-h-[90%] overflow-y-auto no-scrollbar safe-pb"
      >
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-5" />

        <h3 className="text-white text-xl font-black">
          {title}
          {name && ` · ${name}`}
        </h3>
        <p className="text-slate-500 text-[11px] font-bold mt-1 leading-relaxed">
          {kind === 'dividend'
            ? 'This is the record of a payment the app made into your goals. The money itself lives in your history — if the amount that reached your account was different, correct it there.'
            : editing
            ? 'Fixing one trade leaves every other one alone, so how many units you held on a past ex-date is worked out again from scratch — correctly.'
            : kind === 'buy'
              ? 'Recording the day it was done, not the day you typed it in. That date is what a dividend is decided on.'
              : 'Selling after an ex-date still leaves that dividend yours, which is why the date matters here too.'}
        </p>

        {/* A dividend was not typed in by anyone, so there is nothing here to
            re-type. It is shown as the receipt it is. */}
        {kind === 'dividend' ? (
          <div className="mt-5">
            <div className="rounded-2xl bg-white/5 p-4 space-y-2.5">
              <div className="flex text-[13px]">
                <span className="flex-1 text-slate-400 font-bold">Paid on</span>
                <span className="text-white font-black">
                  {new Date(tradedAt).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
              </div>
              <div className="flex text-[13px]">
                <span className="flex-1 text-slate-400 font-bold">Units on the ex-date</span>
                <span className="text-white font-black">{unitsIn.toLocaleString('en-US')}</span>
              </div>
              <div className="flex text-[13px]">
                <span className="flex-1 text-slate-400 font-bold">Per unit</span>
                <span className="text-white font-black">
                  RM{((editing?.perUnitPoints ?? 0) / 10_000).toFixed(4)}
                </span>
              </div>
              <div className="h-px bg-white/10" />
              <div className="flex items-center">
                <span className="flex-1 text-accent font-black text-sm">Paid into your goals</span>
                <span className="text-accent font-black text-lg">
                  {money(editing ? tradeCents(editing) : 0)}
                </span>
              </div>
            </div>
            <p className="text-slate-500 text-[11px] font-bold mt-4 leading-relaxed">
              Companies deduct tax and fees, so what reaches your account is often less than what was
              announced. The money is an ordinary deposit in your history — correct the amount there and
              every figure follows.
            </p>
            <button
              onClick={onClose}
              className="w-full h-14 mt-5 rounded-full glass border border-white/10 text-white font-black active:scale-95 transition-transform"
            >
              Close
            </button>
          </div>
        ) : needsCounter && kind === 'sell' ? (
          <div className="mt-5">
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-3">
              Which counter
            </p>
            {held.length === 0 ? (
              <p className="text-slate-500 text-xs font-bold leading-relaxed">
                Nothing is held right now, so there is nothing to sell.
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
                        {holding.units.toLocaleString('en-US')} units · {holding.symbol}
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
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-2">Counter</p>
            <div className="flex items-center gap-3 h-14 px-4 rounded-2xl bg-white/5 border border-white/10 focus-within:border-primary/50 transition-colors">
              <span className="material-symbols-rounded text-slate-500">search</span>
              <input
                autoFocus
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Name or code, e.g. maybank"
                className="w-full border-0 bg-transparent text-white font-bold focus:outline-none placeholder:text-slate-700"
              />
            </div>
            {searching && <p className="text-slate-500 text-xs font-bold mt-3">Searching…</p>}
            {!searching && term.trim().length >= 2 && hits.length === 0 && (
              <p className="text-slate-500 text-xs font-bold mt-3 leading-relaxed">
                Nothing on Bursa matched. Try the four-digit code.
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
                label="Trade date"
                value={date}
                onChange={setDate}
                max={today}
                title="When was this trade?"
                hint="The day you dealt decides which dividends are yours."
              />
            </div>
            <div className="flex gap-3 mt-4">
              <Field label="Units" value={units} onChange={setUnits} autoFocus={!editing} />
              <Field
                label="Price per unit"
                value={price}
                onChange={setPrice}
                prefix="RM"
              />
            </div>

            {outcome && canSave && (
              <div className="mt-5 rounded-2xl bg-white/5 p-4 space-y-2.5">
                <div className="flex text-[13px]">
                  <span className="flex-1 text-slate-400 font-bold">This trade</span>
                  <span className="text-white font-black">{money(unitsIn * priceCents)}</span>
                </div>
                <div className="flex text-[13px]">
                  <span className="flex-1 text-slate-400 font-bold">{name || symbol} after this</span>
                  <span className="text-white font-black">
                    {outcome.before.units.toLocaleString('en-US')} → {outcome.after.units.toLocaleString('en-US')} units
                  </span>
                </div>
                <div className="flex text-[13px]">
                  <span className="flex-1 text-slate-400 font-bold">Average cost</span>
                  <span className="text-white font-black">
                    {money(Math.round(averageCostCents(outcome.after)))}
                  </span>
                </div>
                {kind === 'sell' && outcome.after.units === outcome.before.units && unitsIn > 0 && (
                  <p className="text-amber-300/90 text-[11px] font-bold leading-relaxed">
                    Nothing was held on that date, so this sale changes nothing. Check the date.
                  </p>
                )}
              </div>
            )}

            {problem && <p className="text-red-400 text-xs font-bold mt-4">{problem}</p>}

            <button
              onClick={() => void save()}
              disabled={!canSave}
              className="w-full h-14 mt-5 rounded-full bg-primary text-black font-black disabled:opacity-30 active:scale-95 transition-all"
            >
              {editing ? 'Save changes' : `Record this ${kind}`}
            </button>

            {editing && (
              <button
                onClick={() => void remove()}
                className="w-full h-12 mt-3 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 font-black active:scale-95 transition-transform"
              >
                Delete this trade
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default TradeSheet;
