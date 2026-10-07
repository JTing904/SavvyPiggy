import React from 'react';
import type { InvestSettings } from '../../types';
import type { FeeMismatch } from '../../services/feePrompt';
import { brokerById, CUSTOM_BROKER_ID, feesFor, securityTypeOf, valueCents } from '../../services/fees';
import { pricePointsOf } from '../../services/holdings';
import { formatMoney, fromCents } from '../../services/money';
import { useT } from '../../contexts/LanguageContext';
import { dateLocale } from '../../i18n';
import { Button } from '../ui/Button';
import { Sheet } from '../ui/Sheet';

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

  const broker = brokerById(invest.brokerId, invest.customRule);
  const rates = !broker
    ? t.invest.mismatchSavedRates
    : broker.id === CUSTOM_BROKER_ID
      ? t.invest.yourRates
      : t.invest.brokerRates(broker.name);
  const money = (cents: number) => formatMoney(fromCents(cents));

  return (
    <Sheet
      title={t.invest.mismatchTitle(rates)}
      z={60}
      onClose={onNotNow}
      footer={
        <div className="space-y-2">
          <Button onClick={onUpdate}>{t.invest.updateRates}</Button>
          <Button variant="ghost" onClick={onNotNow}>
            {t.invest.notNow}
          </Button>
        </div>
      }
    >
      <p className="px-1 text-[13.5px] font-medium leading-relaxed text-mute">{t.invest.mismatchBody(t.invest.feeInSentence[mismatch.key], rates, mismatch.direction < 0)}</p>

      <div className="mt-4 rounded-3xl bg-card p-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-3 gap-y-2.5">
          <span className="truncate text-[11.5px] font-bold text-mute">{t.invest.feeName[mismatch.key]}</span>
          <span className="max-w-[6.5rem] truncate text-right text-[11.5px] font-bold text-mute">{rates}</span>
          <span className="text-right text-[11.5px] font-bold text-mute">{t.invest.youEntered}</span>
          {mismatch.trades.map((trade) => {
            const type = trade.securityType ?? securityTypeOf(trade.symbol, invest.typeOverrides);
            // Expected is what the rates saved now give, so the list reads the
            // same as what the next trade would be filled in with.
            const expected = broker ? feesFor(valueCents(trade.units, pricePointsOf(trade)), broker, type)[mismatch.key] : null;
            const date = new Date(trade.tradedAt).toLocaleDateString(dateLocale('en-GB'), { day: 'numeric', month: 'short' });
            return (
              <React.Fragment key={trade.id}>
                <span className="truncate text-[13.5px] font-bold">
                  {trade.name || trade.symbol} · {date}
                </span>
                <span className="text-right text-[13.5px] font-bold tabular-nums">{expected === null ? '—' : money(expected)}</span>
                <span className="text-right text-[13.5px] font-extrabold tabular-nums text-warn">{money(trade.fees?.[mismatch.key] ?? 0)}</span>
              </React.Fragment>
            );
          })}
        </div>
      </div>
      <p className="mt-3 px-1 text-[12px] font-medium leading-relaxed text-mute">{t.invest.mismatchNote}</p>
    </Sheet>
  );
};

export default FeeMismatchSheet;
