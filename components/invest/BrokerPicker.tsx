import React, { useState } from 'react';
import { BROKERS, CUSTOM_BROKER_ID, type BrokerageRule } from '../../services/fees';
import { formatMoney } from '../../services/money';
import type { Messages } from '../../i18n';
import { useT } from '../../contexts/LanguageContext';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { Icon } from '../ui/Icon';
import { Sheet } from '../ui/Sheet';

interface BrokerPickerProps {
  brokerId: string | null;
  customRule: BrokerageRule | null;
  /** Shown before the first buy: title "Where do you buy?" and a line saying fees are filled in from it. */
  firstTime?: boolean;
  onPick: (brokerId: string, customRule: BrokerageRule | null) => void;
  onClose: () => void;
}

type SetupMessages = Messages['setup'];

/* ---------------------------------------------------------------- helpers */

/** Basis points as a percentage, without trailing zeros: 8 → 0.08%, 10 → 0.1%. */
export const bpText = (bp: number) => `${Number((bp / 100).toFixed(4))}%`;

/** Whole ringgit drop the cents (RM8, RM10,000); anything else keeps them (RM2.88, RM2.50). */
export const rmText = (cents: number) => formatMoney(cents / 100, { decimals: cents % 100 === 0 ? 0 : 2 });

const feeText = (flatCents: number | undefined, bp: number | undefined) =>
  [flatCents ? rmText(flatCents) : null, bp ? bpText(bp) : null].filter(Boolean).join(' + ') || rmText(0);

/**
 * One line that says what a broker charges, written from the rule itself so
 * the words can never disagree with the fee the app actually computes.
 *
 * Tiers read as a sequence: the first says where it stops, the last where it
 * starts. A single middle step needs no bounds of its own — its neighbours
 * already give them — but two or more do, or the line would not say which is
 * which.
 */
export const ruleSummary = (rule: BrokerageRule, s: SetupMessages): string => {
  switch (rule.kind) {
    case 'percent':
      return s.percentMin(bpText(rule.bp), rmText(rule.minCents));
    case 'percentPlusFlat':
      return s.percentPlusFlat(bpText(rule.bp), rmText(rule.flatCents));
    case 'tiers': {
      const { tiers } = rule;
      if (tiers.length === 1) return feeText(tiers[0].flatCents, tiers[0].bp);
      return tiers
        .map((tier, i) => {
          const fee = feeText(tier.flatCents, tier.bp);
          const last = i === tiers.length - 1;
          if (last) return s.tierFrom(fee, rmText(tiers[i - 1].upToCents ?? 0));
          if (i > 0 && tiers.length === 3) return fee;
          return s.tierUnder(fee, rmText(tier.upToCents ?? 0));
        })
        .join(' · ');
    }
  }
};

export interface CustomInputs {
  percent: string;
  minimum: string;
  flat: string;
}

export type CustomError = keyof SetupMessages['customError'];

export type CustomResult = { rule: BrokerageRule } | { error: CustomError };

/** Empty is null; anything that is not a plain decimal number is NaN. */
const readNumber = (text: string): number | null => {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  return /^(\d+\.?\d*|\.\d+)$/.test(trimmed) ? parseFloat(trimmed) : NaN;
};

/**
 * Turns the "Mine isn't listed" form into a rule the fee engine understands.
 *
 * The engine has a percentage with a floor, or a percentage plus a flat fee —
 * not both at once — so a form with both filled in is sent back rather than
 * quietly dropping one of them.
 */
export const parseCustomRule = (inputs: CustomInputs): CustomResult => {
  const percent = readNumber(inputs.percent);
  const minimum = readNumber(inputs.minimum);
  const flat = readNumber(inputs.flat);

  if (percent === null || Number.isNaN(percent) || percent < 0 || percent > 2) return { error: 'percent' };
  if (minimum !== null && (Number.isNaN(minimum) || minimum < 0 || minimum > 100)) return { error: 'minimum' };
  if (flat !== null && (Number.isNaN(flat) || flat < 0 || flat > 100)) return { error: 'flat' };

  // Hundredths of a basis point are as fine as any broker quotes (0.0850%).
  const bp = Math.round(percent * 10_000) / 100;
  const minCents = Math.round((minimum ?? 0) * 100);
  const flatCents = Math.round((flat ?? 0) * 100);

  if (flatCents > 0 && minCents > 0) return { error: 'both' };
  if (flatCents > 0) return { rule: { kind: 'percentPlusFlat', bp, flatCents } };
  return { rule: { kind: 'percent', bp, minCents } };
};

/** The form, filled back in from a rule saved earlier. */
export const inputsFromRule = (rule: BrokerageRule | null): CustomInputs => {
  const blank = { percent: '', minimum: '', flat: '' };
  if (!rule) return blank;
  if (rule.kind === 'tiers') return blank;
  const percent = String(Number((rule.bp / 100).toFixed(4)));
  if (rule.kind === 'percent') return { ...blank, percent, minimum: rule.minCents ? String(rule.minCents / 100) : '' };
  return { ...blank, percent, flat: rule.flatCents ? String(rule.flatCents / 100) : '' };
};

/* -------------------------------------------------------------- component */

/**
 * Which broker someone uses, so every trade's fees can be filled in from its
 * published rates. Picking a listed broker takes effect at once; a broker that
 * is not listed gets its rates typed in.
 */
const BrokerPicker: React.FC<BrokerPickerProps> = ({ brokerId, customRule, firstTime, onPick, onClose }) => {
  const t = useT();
  const s = t.setup;

  const isCustom = brokerId === CUSTOM_BROKER_ID;
  const [formOpen, setFormOpen] = useState(isCustom);
  const [inputs, setInputs] = useState<CustomInputs>(() => inputsFromRule(isCustom ? customRule : null));
  const [error, setError] = useState<CustomError | null>(null);

  const set = (key: keyof CustomInputs) => (value: string) => {
    setInputs((prev) => ({ ...prev, [key]: value }));
    setError(null);
  };

  const submit = () => {
    const result = parseCustomRule(inputs);
    if ('error' in result) setError(result.error);
    else onPick(CUSTOM_BROKER_ID, result.rule);
  };

  return (
    <Sheet title={firstTime ? s.brokerFirstTitle : s.brokerTitle} onClose={onClose} height="tall">
      <p className="px-1 text-[13.5px] font-medium leading-relaxed text-mute">{firstTime ? s.brokerFirstHint : s.brokerHint}</p>

      <div className="mt-4 space-y-2">
        {BROKERS.map((broker) => {
          const on = broker.id === brokerId;
          return (
            <button
              key={broker.id}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(broker.id, null)}
              className={`flex min-h-16 w-full items-center gap-3 rounded-3xl bg-card p-3.5 text-left active:opacity-80 ${on ? 'outline outline-2 outline-ink' : ''}`}
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl text-[12px] font-extrabold text-white" style={{ background: broker.color }}>
                {broker.short}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-bold">{broker.name}</span>
                <span className="block text-[12px] font-medium leading-snug text-mute">{ruleSummary(broker.rule, s)}</span>
              </span>
              {on && (
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-cta text-cta-fg">
                  <Icon name="check" size={14} strokeWidth={2.4} />
                  <span className="sr-only">{t.ui.selected}</span>
                </span>
              )}
            </button>
          );
        })}

        <div className={`rounded-3xl bg-card ${isCustom ? 'outline outline-2 outline-ink' : ''}`}>
          <button
            type="button"
            onClick={() => setFormOpen((open) => !open)}
            aria-expanded={formOpen}
            className="flex min-h-16 w-full items-center gap-3 p-3.5 text-left active:opacity-80"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-line/10">
              <Icon name="pencil" size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-bold">{isCustom ? s.customName : s.notListed}</span>
              <span className="block text-[12px] font-medium leading-snug text-mute">{isCustom && customRule ? ruleSummary(customRule, s) : s.notListedHint}</span>
            </span>
            {isCustom ? (
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-cta text-cta-fg">
                <Icon name="check" size={14} strokeWidth={2.4} />
              </span>
            ) : (
              <Icon name="chev" size={18} className={`text-mute ${formOpen ? '-rotate-90' : 'rotate-90'}`} />
            )}
          </button>

          {formOpen && (
            <div className="space-y-3 px-3.5 pb-4">
              <Field label={s.percentLabel} value={inputs.percent} onChange={set('percent')} inputMode="decimal" placeholder="0" error={error === 'percent' ? s.customError.percent : undefined} />
              <Field
                label={`${s.minimumLabel} · ${s.optional}`}
                value={inputs.minimum}
                onChange={set('minimum')}
                inputMode="decimal"
                placeholder="0"
                error={error === 'minimum' ? s.customError.minimum : undefined}
              />
              <Field
                label={`${s.flatLabel} · ${s.optional}`}
                value={inputs.flat}
                onChange={set('flat')}
                inputMode="decimal"
                placeholder="0"
                error={error === 'flat' ? s.customError.flat : undefined}
              />
              {error === 'both' && <p className="px-1 text-[12.5px] font-bold text-neg">{s.customError.both}</p>}
              <Button onClick={submit}>{s.useTheseRates}</Button>
            </div>
          )}
        </div>
      </div>

      <p className="mt-5 px-1 text-[12px] font-medium leading-relaxed text-mute">{s.brokerNote}</p>
    </Sheet>
  );
};

export default BrokerPicker;
