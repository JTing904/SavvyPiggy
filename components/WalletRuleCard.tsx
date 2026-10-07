import React, { useEffect, useState } from 'react';
import type { WalletSettings } from '../types';
import { formatMoney } from '../services/money';
import { useT } from '../contexts/LanguageContext';
import { Button } from './ui/Button';

interface WalletRuleCardProps {
  wallet: WalletSettings;
  /** Resolves when saved; a refusal rejects and the card keeps what was typed. */
  onSave: (goalsPercent: number) => void | Promise<void>;
}

const EXAMPLE_CENTS = 100_000;

/** How much of every income goes straight to the goals; the rest stays in the wallet. */
const WalletRuleCard: React.FC<WalletRuleCardProps> = ({ wallet, onSave }) => {
  const t = useT();
  const w = t.wallet;
  const [percent, setPercent] = useState(wallet.goalsPercent);
  const [busy, setBusy] = useState(false);

  // Another device changed the rule: follow it, unless a change is being made here.
  useEffect(() => {
    setPercent(wallet.goalsPercent);
  }, [wallet.goalsPercent]);

  const toGoals = Math.floor((EXAMPLE_CENTS * percent) / 100);
  const money = (cents: number) => formatMoney(cents / 100);
  const changed = percent !== wallet.goalsPercent;

  const save = async () => {
    if (!changed || busy) return;
    setBusy(true);
    try {
      await onSave(percent);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-[2rem] bg-card p-5 text-ink">
      <p className="text-[15px] font-extrabold">{w.ruleTitle}</p>
      <p className="mt-0.5 text-[12.5px] font-semibold text-mute">{w.ruleLabel}</p>

      <p className="mt-3 text-[34px] font-extrabold leading-none tracking-tight">
        {percent}
        <span className="ml-0.5 text-[18px] text-mute">%</span>
      </p>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={percent}
        onChange={(e) => setPercent(Number(e.target.value))}
        aria-label={w.ruleSliderLabel}
        className="mt-3 h-11 w-full accent-[rgb(var(--cta))]"
      />
      <div className="flex justify-between text-[11.5px] font-bold text-mute">
        <span>{w.ruleNone}</span>
        <span>{w.ruleAll}</span>
      </div>

      <div className="mt-4 rounded-2xl bg-field px-4 py-3">
        <p className="mb-1 text-[12.5px] font-bold text-mute">{w.ruleExample(money(EXAMPLE_CENTS))}</p>
        <div className="flex justify-between py-0.5 text-[13.5px] font-semibold">
          <span>{w.ruleToGoals}</span>
          <b className="tabular-nums text-pos">{money(toGoals)}</b>
        </div>
        <div className="flex justify-between py-0.5 text-[13.5px] font-semibold">
          <span>{w.ruleToWallet}</span>
          <b className="tabular-nums">{money(EXAMPLE_CENTS - toGoals)}</b>
        </div>
      </div>

      <p className="mt-3 text-[12px] font-medium leading-relaxed text-mute">{w.ruleNote}</p>
      <p className="mt-1.5 text-[12px] font-medium leading-relaxed text-mute">{w.ruleScheduled}</p>
      <Button className="mt-4" disabled={!changed} loading={busy} onClick={save}>
        {w.ruleSave}
      </Button>
    </div>
  );
};

export default WalletRuleCard;
