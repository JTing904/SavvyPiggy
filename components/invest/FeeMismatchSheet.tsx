import React from 'react';
import type { InvestSettings } from '../../types';
import type { FeeMismatch } from '../../services/feePrompt';
import { brokerById, CUSTOM_BROKER_ID, feesFor, securityTypeOf, valueCents } from '../../services/fees';
import { pricePointsOf } from '../../services/holdings';
import { formatMoney, fromCents } from '../../services/money';
import { useBackHandler } from '../../hooks/useBackHandler';
import { useT } from '../../contexts/LanguageContext';
import { dateLocale } from '../../i18n';

interface FeeMismatchSheetProps {
  mismatch: FeeMismatch;
  invest: InvestSettings;
  /** Opens the broker settings; the person changes the rates themselves. */
  onUpdate: () => void;
  onNotNow: () => void;
}

/**
 * Three contract notes in a row disagreeing with the saved rates, in the same
 * direction, on the same fee. The sheet only shows the evidence and points at
 * the settings — it never works out a "new rate" from three data points, since
 * a promotion or a rebate would look exactly the same.
 */
const FeeMismatchSheet: React.FC<FeeMismatchSheetProps> = ({ mismatch, invest, onUpdate, onNotNow }) => {
  const t = useT();
  // Back is the same as "Not now": the question has been seen and put aside.
  useBackHandler(true, onNotNow);

  const broker = brokerById(invest.brokerId, invest.customRule);
  const rates = !broker
    ? t.invest.mismatchSavedRates
    : broker.id === CUSTOM_BROKER_ID
      ? t.invest.yourRates
      : t.invest.brokerRates(broker.name);
  const money = (cents: number) => formatMoney(fromCents(cents));

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/85 veil-in" onClick={onNotNow}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md mx-auto bg-surface sheet-rise rounded-t-[2rem] border-t border-white/10 px-6 pt-4 pb-8 max-h-[90%] overflow-y-auto no-scrollbar safe-pb"
      >
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-5" />
        <div className="size-12 rounded-2xl flex items-center justify-center mb-4 bg-amber-500/10 text-amber-400">
          <span className="material-symbols-rounded text-2xl">receipt_long</span>
        </div>
        <h3 className="text-white text-xl font-black tracking-tight">{t.invest.mismatchTitle(rates)}</h3>
        <p className="text-slate-400 text-[13px] font-medium mt-2 leading-relaxed">
          {t.invest.mismatchBody(t.invest.feeInSentence[mismatch.key], rates, mismatch.direction < 0)}
        </p>

        <div className="mt-5 rounded-2xl bg-white/5 p-4">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-3 gap-y-2.5 items-baseline">
            <span className="text-slate-500 text-[10px] font-black uppercase tracking-wider truncate">
              {t.invest.feeName[mismatch.key]}
            </span>
            <span className="text-slate-500 text-[10px] font-black uppercase tracking-wider text-right max-w-[6.5rem] truncate">
              {rates}
            </span>
            <span className="text-slate-500 text-[10px] font-black uppercase tracking-wider text-right">
              {t.invest.youEntered}
            </span>
            {mismatch.trades.map((trade) => {
              const type = trade.securityType ?? securityTypeOf(trade.symbol, invest.typeOverrides);
              // Expected is what the rates saved now give, so the list reads the
              // same as what the next trade would be filled in with.
              const expected = broker
                ? feesFor(valueCents(trade.units, pricePointsOf(trade)), broker, type)[mismatch.key]
                : null;
              const date = new Date(trade.tradedAt).toLocaleDateString(dateLocale('en-GB'), {
                day: 'numeric',
                month: 'short',
              });
              return (
                <React.Fragment key={trade.id}>
                  <span className="text-white text-[13px] font-bold truncate">
                    {trade.name || trade.symbol} · {date}
                  </span>
                  <span className="text-slate-300 text-[13px] font-black text-right">
                    {expected === null ? '—' : money(expected)}
                  </span>
                  <span className="text-amber-300 text-[13px] font-black text-right">
                    {money(trade.fees?.[mismatch.key] ?? 0)}
                  </span>
                </React.Fragment>
              );
            })}
          </div>
        </div>
        <p className="text-slate-500 text-[11px] font-bold mt-3 leading-relaxed">{t.invest.mismatchNote}</p>

        <button
          type="button"
          onClick={onUpdate}
          className="w-full h-14 mt-5 rounded-full bg-primary text-black font-black active:scale-95 transition-all"
        >
          {t.invest.updateRates}
        </button>
        <button
          type="button"
          onClick={onNotNow}
          className="w-full h-12 mt-3 rounded-full glass border border-white/10 text-white font-black active:scale-95 transition-transform"
        >
          {t.invest.notNow}
        </button>
      </div>
    </div>
  );
};

export default FeeMismatchSheet;
