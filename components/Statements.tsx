import React, { useEffect, useMemo, useState } from 'react';
import type { Activity, PiggyBank, SavingsSettings, Trade } from '../types';
import {
  RETENTION_CHOICES,
  monthSummary,
  monthsWithRecords,
  nextToClear,
  type MonthReport,
} from '../services/analytics';
import { buildHoldings, type Quotes } from '../services/holdings';
import { buildMonthWorkbook, monthFileName } from '../services/export';
import { buildStatementPdf } from '../services/statement';
import { saveFile } from '../services/share';
import { formatMoney } from '../services/money';

interface StatementsProps {
  activities: Activity[];
  banks: PiggyBank[];
  trades: Trade[];
  quotes: Quotes;
  savings: SavingsSettings;
  owner: string;
  onSaveSettings: (patch: Partial<SavingsSettings>) => void;
  onBack: () => void;
}

const longDate = (d: Date) =>
  d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * How close a clearing date has to be before the row is flagged. A month that
 * has a year left is not news, and a red badge on it would only teach people
 * to ignore red badges.
 */
const SOON_DAYS = 60;
const clearingSoon = (at: Date | null, now: Date) =>
  at !== null && at.getTime() - now.getTime() < SOON_DAYS * 86_400_000;

/**
 * A statement for every month there is something to report, and the settings
 * for how long the ledger is kept.
 *
 * These live together on purpose: the only thing that makes automatic clearing
 * safe is that the month about to go is right there with a download button
 * next to it.
 */
const Statements: React.FC<StatementsProps> = ({
  activities,
  banks,
  trades,
  quotes,
  savings,
  owner,
  onSaveSettings,
  onBack,
}) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const now = new Date();

  const months = useMemo(
    () => monthsWithRecords(activities, trades, now, savings.retentionMonths),
    [activities, trades, savings.retentionMonths] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const going = useMemo(() => nextToClear(months), [months]);

  /**
   * Seeing this screen is the acknowledgement. Until it has been opened once,
   * nothing is cleared automatically — the warning alert just keeps pointing
   * here, where every month sits beside its own download button.
   */
  useEffect(() => {
    if (!savings.retentionAcknowledged) onSaveSettings({ retentionAcknowledged: true });
  }, [savings.retentionAcknowledged]); // eslint-disable-line react-hooks/exhaustive-deps

  const say = (text: string) => {
    setNote(text);
    setTimeout(() => setNote(null), 3500);
  };

  /** Everything that happened inside one month, both halves. */
  const sliceOf = (month: MonthReport) => ({
    activities: activities.filter((a) => {
      const d = new Date(a.date);
      return d >= month.start && d < month.end;
    }),
    trades: trades.filter((t) => t.tradedAt >= month.start.getTime() && t.tradedAt < month.end.getTime()),
  });

  const download = async (month: MonthReport, kind: 'pdf' | 'sheet') => {
    if (busy) return;
    setBusy(`${month.key}:${kind}`);
    try {
      const slice = sliceOf(month);
      // Positions as they stood at the end of that month, replayed from every
      // trade up to then rather than from what is held today.
      const holdings = buildHoldings(trades.filter((t) => t.tradedAt < month.end.getTime()));

      if (kind === 'sheet') {
        await saveFile(
          monthFileName(month.label, 'xlsx'),
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          buildMonthWorkbook({ label: month.label, banks, holdings, quotes, ...slice })
        );
      } else {
        await saveFile(
          monthFileName(month.label, 'pdf'),
          'application/pdf',
          buildStatementPdf({
            summary: monthSummary(slice.activities, banks, month, now),
            activities: slice.activities,
            banks,
            owner,
            now,
            trades: slice.trades,
            holdings,
            quotes,
          })
        );
      }
      say(`${month.label} saved.`);
    } catch (e) {
      say(e instanceof Error ? e.message : 'Could not save that.');
    } finally {
      setBusy(null);
    }
  };

  const IconButton: React.FC<{ month: MonthReport; kind: 'pdf' | 'sheet' }> = ({ month, kind }) => (
    <button
      onClick={() => void download(month, kind)}
      disabled={busy !== null}
      aria-label={`${kind.toUpperCase()} for ${month.label}`}
      className={`size-10 shrink-0 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center active:scale-90 transition-transform disabled:opacity-40 ${
        kind === 'pdf' ? 'text-red-400' : 'text-primary'
      }`}
    >
      <span className="material-symbols-rounded text-[20px]">
        {busy === `${month.key}:${kind}` ? 'hourglass_top' : kind === 'pdf' ? 'picture_as_pdf' : 'table_view'}
      </span>
    </button>
  );

  return (
    <div className="flex flex-col h-full bg-bg-dark safe-pt">
      <div className="flex items-center px-6 py-4 gap-4 sticky top-0 bg-bg-dark/95 z-20">
        <button
          onClick={onBack}
          className="size-10 shrink-0 rounded-full glass flex items-center justify-center text-slate-300 active:scale-90 transition-transform"
        >
          <span className="material-symbols-rounded text-xl">arrow_back_ios_new</span>
        </button>
        <div className="min-w-0">
          <h2 className="text-white text-2xl font-black tracking-tight">Statements</h2>
          <p className="text-slate-500 text-[11px] font-bold">One a month, savings and investments together</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-6 pb-40">
        {note && (
          <div className="mb-4 rounded-2xl bg-primary/10 border border-primary/25 px-4 py-3">
            <p className="text-primary text-xs font-black">{note}</p>
          </div>
        )}

        {months.length === 0 ? (
          <div className="text-center py-20">
            <span className="material-symbols-rounded text-slate-700 text-5xl">description</span>
            <p className="text-white font-black mt-4">Nothing to report yet</p>
            <p className="text-slate-500 text-xs font-bold mt-2 leading-relaxed px-6">
              A month appears here as soon as it has a deposit or a trade in it.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {months.map((month) => (
              <div
                key={month.key}
                className="flex items-center gap-2.5 p-3 pl-4 rounded-3xl glass"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-white font-black text-sm truncate">{month.label}</p>
                    {month.current && (
                      <span className="shrink-0 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent/15 text-accent">
                        so far
                      </span>
                    )}
                    {clearingSoon(month.clearedOn, now) && (
                      <span className="shrink-0 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-500/15 text-red-400">
                        clearing
                      </span>
                    )}
                  </div>
                  <p className="text-slate-500 text-[11px] font-bold mt-0.5">
                    {month.activities} record{month.activities === 1 ? '' : 's'}
                    {month.activities > 0 && (
                      <>
                        {' · '}
                        <span className={month.net < 0 ? 'text-red-400' : 'text-primary'}>
                          {formatMoney(month.net, { signed: true })}
                        </span>
                      </>
                    )}
                    {month.trades > 0 && (
                      <span className="text-accent">
                        {' · '}
                        {month.trades} trade{month.trades === 1 ? '' : 's'}
                      </span>
                    )}
                  </p>
                </div>
                <IconButton month={month} kind="pdf" />
                <IconButton month={month} kind="sheet" />
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-center gap-5 mt-4 text-slate-600 text-[11px] font-bold">
          <span className="flex items-center gap-1.5">
            <span className="material-symbols-rounded text-red-400 text-[15px]">picture_as_pdf</span>
            PDF statement
          </span>
          <span className="flex items-center gap-1.5">
            <span className="material-symbols-rounded text-primary text-[15px]">table_view</span>
            Excel records
          </span>
        </div>

        {/* ------------------------------------------------------ housekeeping */}

        <h3 className="text-white font-black text-sm mt-8">Keeping the app quick</h3>
        <p className="text-slate-500 text-[11px] font-bold mt-1 leading-relaxed">
          Every time the app opens it reads the whole ledger, and a free Firebase project allows 50,000
          reads a day. Space is not the problem — a few thousand records is. Old months are cleared
          automatically so that day never arrives, which is why there is no “keep everything” here.
        </p>

        <div className="rounded-3xl bg-amber-500/8 border border-amber-500/25 p-5 mt-4">
          {going ? (
            <>
              <p className="text-amber-300 font-black text-sm">Next to be cleared</p>
              <p className="text-amber-200/70 text-[11.5px] font-bold mt-2 leading-relaxed">
                <span className="text-amber-200">{going.label}</span> — {going.activities} record
                {going.activities === 1 ? '' : 's'}, on {longDate(going.clearedOn!)}. Save it with the buttons
                above first if you want to keep it.
              </p>
            </>
          ) : (
            <>
              <p className="text-amber-300 font-black text-sm">Nothing due to be cleared</p>
              <p className="text-amber-200/70 text-[11.5px] font-bold mt-2 leading-relaxed">
                Every month on record is inside the window you keep.
              </p>
            </>
          )}

          <div className="grid grid-cols-2 gap-3 mt-4">
            {RETENTION_CHOICES.map((choice) => {
              const on = savings.retentionMonths === choice.months;
              return (
                <button
                  key={choice.label}
                  onClick={() =>
                    onSaveSettings({ retentionMonths: choice.months, retentionAcknowledged: true })
                  }
                  className={`py-2.5 rounded-2xl text-[11px] font-black transition-colors ${
                    on
                      ? 'bg-amber-400 text-black'
                      : 'bg-white/5 border border-white/10 text-slate-400'
                  }`}
                >
                  {choice.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-start gap-3 mt-4 p-4 rounded-3xl bg-primary/8 border border-primary/25">
          <span className="material-symbols-rounded text-primary text-xl shrink-0">verified_user</span>
          <p className="text-primary/85 text-[11.5px] font-bold leading-relaxed">
            <span className="text-primary">Your money is never touched.</span> Balances live on the goals
            themselves and the trade log is what your positions are worked out from — clearing history
            removes only the record of what happened, never a ringgit or a share.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Statements;
