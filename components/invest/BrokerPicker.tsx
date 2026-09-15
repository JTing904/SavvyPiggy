import React, { useState } from 'react';
import { BROKERS, CUSTOM_BROKER_ID, type BrokerageRule } from '../../services/fees';
import { formatMoney } from '../../services/money';
import type { Messages } from '../../i18n';
import { useT } from '../../contexts/LanguageContext';
import { useBackHandler } from '../../hooks/useBackHandler';

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

const Field: React.FC<{
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  invalid: boolean;
}> = ({ label, hint, value, onChange, invalid }) => (
  <div className="min-w-0">
    <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-2 leading-relaxed">
      {label}
      {hint && <span className="normal-case tracking-normal text-slate-600"> · {hint}</span>}
    </p>
    <input
      type="text"
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="0"
      className={`w-full h-12 px-4 rounded-2xl bg-white/5 border text-white text-base font-black focus:outline-none placeholder:text-slate-700 transition-colors ${
        invalid ? 'border-red-400/60' : 'border-white/10 focus:border-primary/50'
      }`}
    />
  </div>
);

/**
 * Which broker someone uses, so every trade's fees can be filled in from its
 * published rates. Picking a listed broker takes effect at once; a broker that
 * is not listed gets its rates typed in.
 */
const BrokerPicker: React.FC<BrokerPickerProps> = ({ brokerId, customRule, firstTime, onPick, onClose }) => {
  const t = useT();
  const s = t.setup;
  useBackHandler(true, onClose);

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
    <div className="fixed inset-0 z-50 bg-bg-dark veil-in">
      <div className="h-full max-w-md mx-auto flex flex-col safe-pt">
        <div className="flex items-center px-6 py-4 gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-white text-2xl font-black tracking-tight">
              {firstTime ? s.brokerFirstTitle : s.brokerTitle}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label={t.common.close}
            className="size-10 shrink-0 rounded-full glass flex items-center justify-center text-slate-300 active:scale-90 transition-transform"
          >
            <span className="material-symbols-rounded text-xl">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar px-6 pb-10">
          <p className="text-slate-400 text-sm font-medium leading-relaxed">
            {firstTime ? s.brokerFirstHint : s.brokerHint}
          </p>

          <div className="mt-5 space-y-2">
            {BROKERS.map((broker) => {
              const on = broker.id === brokerId;
              return (
                <button
                  key={broker.id}
                  type="button"
                  onClick={() => onPick(broker.id, null)}
                  className={`w-full flex items-center gap-3 p-3 rounded-2xl border text-left active:scale-[0.98] transition-all ${
                    on ? 'bg-primary/10 border-primary/40' : 'bg-white/5 border-white/10'
                  }`}
                >
                  <span
                    className="size-9 shrink-0 rounded-xl flex items-center justify-center text-white text-xs font-black"
                    style={{ background: broker.color }}
                  >
                    {broker.short}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-black truncate">{broker.name}</p>
                    <p className="text-slate-500 text-[11px] font-bold mt-0.5 leading-snug">
                      {ruleSummary(broker.rule, s)}
                    </p>
                  </div>
                  {on && <span className="material-symbols-rounded text-primary fill-1 shrink-0">check_circle</span>}
                </button>
              );
            })}

            <div
              className={`rounded-2xl border transition-all ${
                isCustom ? 'bg-primary/10 border-primary/40' : 'bg-white/5 border-white/10'
              }`}
            >
              <button
                type="button"
                onClick={() => setFormOpen((open) => !open)}
                aria-expanded={formOpen}
                className="w-full flex items-center gap-3 p-3 text-left active:scale-[0.98] transition-transform"
              >
                <span className="size-9 shrink-0 rounded-xl flex items-center justify-center bg-white/5 border border-dashed border-white/20 text-slate-400">
                  <span className="material-symbols-rounded text-lg">edit</span>
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-black truncate">{isCustom ? s.customName : s.notListed}</p>
                  <p className="text-slate-500 text-[11px] font-bold mt-0.5 leading-snug">
                    {isCustom && customRule ? ruleSummary(customRule, s) : s.notListedHint}
                  </p>
                </div>
                {isCustom ? (
                  <span className="material-symbols-rounded text-primary fill-1 shrink-0">check_circle</span>
                ) : (
                  <span className="material-symbols-rounded text-slate-600 shrink-0">
                    {formOpen ? 'expand_less' : 'expand_more'}
                  </span>
                )}
              </button>

              {formOpen && (
                <div className="px-3 pb-3 space-y-3">
                  <Field label={s.percentLabel} value={inputs.percent} onChange={set('percent')} invalid={error === 'percent'} />
                  <Field
                    label={s.minimumLabel}
                    hint={s.optional}
                    value={inputs.minimum}
                    onChange={set('minimum')}
                    invalid={error === 'minimum' || error === 'both'}
                  />
                  <Field
                    label={s.flatLabel}
                    hint={s.optional}
                    value={inputs.flat}
                    onChange={set('flat')}
                    invalid={error === 'flat' || error === 'both'}
                  />
                  {error && <p className="text-red-400 text-xs font-bold">{s.customError[error]}</p>}
                  <button
                    type="button"
                    onClick={submit}
                    className="w-full h-12 rounded-full bg-primary text-black font-black active:scale-95 transition-transform"
                  >
                    {s.useTheseRates}
                  </button>
                </div>
              )}
            </div>
          </div>

          <p className="text-slate-600 text-[11px] font-bold mt-5 leading-relaxed">{s.brokerNote}</p>
          <div className="safe-pb" />
        </div>
      </div>
    </div>
  );
};

export default BrokerPicker;
