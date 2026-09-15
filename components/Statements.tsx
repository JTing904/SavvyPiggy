import React, { useEffect, useMemo, useState } from 'react';
import type { Activity, PiggyBank, SavingsSettings, Trade } from '../types';
import {
  RETENTION_CHOICES,
  monthSummary,
  monthsWithRecords,
  nextToClear,
  retentionCutoff,
  shownOlder,
  type MonthReport,
} from '../services/analytics';
import { loadOlderThan } from '../services/ledgerArchive';
import { useAuth } from '../contexts/AuthContext';
import { buildHoldings, type Quotes } from '../services/holdings';
import { buildMonthWorkbook, monthFileName } from '../services/export';
import { buildStatementPdf } from '../services/statement';
import { saveFile } from '../services/share';
import { formatMoney } from '../services/money';
import { useT } from '../contexts/LanguageContext';
import { dateLocale } from '../i18n';
import { useLedgerRange, type Ledger } from '../hooks/useOlderLedger';
import OlderRecordsNotice from './OlderRecordsNotice';

interface StatementsProps {
  activities: Activity[];
  /** Every kept month is listed, so the part older than the live window is read here. */
  ledger: Ledger;
  banks: PiggyBank[];
  trades: Trade[];
  quotes: Quotes;
  savings: SavingsSettings;
  owner: string;
  onSaveSettings: (patch: Partial<SavingsSettings>) => void;
  onBack: () => void;
}

const longDate = (d: Date) =>
  d.toLocaleDateString(dateLocale('en-GB'), { day: 'numeric', month: 'short', year: 'numeric' });

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
  ledger,
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
  const t = useT();
  const { user } = useAuth();
  const uid = user?.uid;
  const now = new Date();
  // The kept months older than the live three: until they are here the list,
  // its totals and the month next to clear would all be short, so they wait.
  const kept = useLedgerRange(ledger, ledger.keptFrom);

  /**
   * The live feed only reaches back to the window's start, and the records
   * before it are exactly the ones about to be cleared. They are read here,
   * once per visit, so those months are listed — and can be saved — too.
   */
  const cutoffIso = retentionCutoff(now, savings.retentionMonths).toISOString();
  const [older, setOlder] = useState<{
    cutoffIso: string;
    activities: Activity[];
    complete: boolean;
    shownCutoff: string;
  } | null>(null);
  const [olderFailed, setOlderFailed] = useState(false);

  useEffect(() => {
    if (!uid || savings.retentionMonths === null) return;
    let live = true;
    setOlderFailed(false);
    loadOlderThan(uid, new Date(cutoffIso))
      .then(({ activities: rows, complete }) => {
        if (!live) return;
        const shown = shownOlder(rows, complete, new Date(cutoffIso));
        setOlder({ cutoffIso, activities: shown.activities, complete, shownCutoff: shown.shownCutoff.toISOString() });
      })
      .catch(() => {
        if (live) setOlderFailed(true);
      });
    return () => {
      live = false;
    };
  }, [uid, cutoffIso]); // eslint-disable-line react-hooks/exhaustive-deps

  const everything = useMemo(() => {
    if (!older || older.activities.length === 0) return activities;
    const ids = new Set(activities.map((a) => a.id));
    return [...activities, ...older.activities.filter((a) => !ids.has(a.id))];
  }, [activities, older]);

  // `t` is a dependency so the month names are reworded when the language changes.
  const months = useMemo(
    () => monthsWithRecords(everything, trades, now, savings.retentionMonths),
    [everything, trades, savings.retentionMonths, t] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const going = useMemo(() => nextToClear(months), [months]);

  /**
   * Seeing this screen is the acknowledgement — but only of what it showed.
   * Once the months before the current cutoff have been read and are on the
   * screen, that cutoff is recorded, and clearing never reaches past it. A
   * window that shrinks later, or a month that ages out after this, is not
   * covered: the warning comes back and nothing more goes until this screen
   * has listed it.
   */
  // Not shown until the list is on screen, which waits for the kept months too.
  const shownFor = kept === 'ready' && older && older.cutoffIso === cutoffIso ? older.shownCutoff : null;
  const olderNote =
    !uid || savings.retentionMonths === null
      ? null
      : olderFailed
        ? t.profile.olderFailed
        : !older || older.cutoffIso !== cutoffIso
          ? t.profile.olderLoading
          : !older.complete
            ? t.profile.olderPartial
            : null;
  useEffect(() => {
    if (!shownFor || new Date(shownFor).getTime() <= 0) return;
    if (savings.retentionAcknowledgedCutoff === shownFor && savings.retentionAcknowledged) return;
    onSaveSettings({ retentionAcknowledged: true, retentionAcknowledgedCutoff: shownFor });
  }, [shownFor]); // eslint-disable-line react-hooks/exhaustive-deps

  const say = (text: string) => {
    setNote(text);
    setTimeout(() => setNote(null), 3500);
  };

  /** Everything that happened inside one month, both halves. */
  const sliceOf = (month: MonthReport) => ({
    activities: everything.filter((a) => {
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
      say(t.profile.fileSaved(month.label));
    } catch (e) {
      say(e instanceof Error ? e.message : t.profile.saveFailed);
    } finally {
      setBusy(null);
    }
  };

  const IconButton: React.FC<{ month: MonthReport; kind: 'pdf' | 'sheet' }> = ({ month, kind }) => (
    <button
      onClick={() => void download(month, kind)}
      disabled={busy !== null}
      aria-label={t.profile.downloadLabel(kind, month.label)}
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
          <h2 className="text-white text-2xl font-black tracking-tight">{t.profile.statements}</h2>
          <p className="text-slate-500 text-[11px] font-bold">{t.profile.statementsSubtitle}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-6 pb-40">
        {note && (
          <div className="mb-4 rounded-2xl bg-primary/10 border border-primary/25 px-4 py-3">
            <p className="text-primary text-xs font-black">{note}</p>
          </div>
        )}

        {kept !== 'ready' ? (
          <OlderRecordsNotice status={kept} onRetry={ledger.retry} />
        ) : months.length === 0 ? (
          <div className="text-center py-20">
            <span className="material-symbols-rounded text-slate-700 text-5xl">description</span>
            <p className="text-white font-black mt-4">{t.profile.nothingToReport}</p>
            <p className="text-slate-500 text-xs font-bold mt-2 leading-relaxed px-6">
              {t.profile.nothingToReportHint}
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
                        {t.profile.soFar}
                      </span>
                    )}
                    {month.due && month.activities > 0 ? (
                      <span className="shrink-0 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-500/15 text-red-400">
                        {t.profile.dueBadge}
                      </span>
                    ) : (
                      clearingSoon(month.clearedOn, now) && (
                        <span className="shrink-0 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-500/15 text-red-400">
                          {t.profile.clearing}
                        </span>
                      )
                    )}
                  </div>
                  {month.due && month.activities > 0 && month.clearedOn && (
                    <p className="text-red-400/80 text-[10.5px] font-bold mt-0.5">
                      {t.profile.dueDetail(longDate(month.clearedOn))}
                    </p>
                  )}
                  <p className="text-slate-500 text-[11px] font-bold mt-0.5">
                    {t.profile.records(month.activities)}
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
                        {t.profile.trades(month.trades)}
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

        {olderNote && (
          <p className="mt-3 text-slate-500 text-[11px] font-bold leading-relaxed">{olderNote}</p>
        )}

        <div className="flex items-center justify-center gap-5 mt-4 text-slate-600 text-[11px] font-bold">
          <span className="flex items-center gap-1.5">
            <span className="material-symbols-rounded text-red-400 text-[15px]">picture_as_pdf</span>
            {t.profile.pdfStatement}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="material-symbols-rounded text-primary text-[15px]">table_view</span>
            {t.profile.excelRecords}
          </span>
        </div>

        {/* ------------------------------------------------------ housekeeping */}

        <h3 className="text-white font-black text-sm mt-8">{t.profile.keepingQuick}</h3>
        <p className="text-slate-500 text-[11px] font-bold mt-1 leading-relaxed">
          {t.profile.keepingQuickHint}
        </p>

        <div className="rounded-3xl bg-amber-500/8 border border-amber-500/25 p-5 mt-4">
          {kept !== 'ready' ? (
            <p className="text-amber-200/70 text-[11.5px] font-bold leading-relaxed">
              {kept === 'loading' ? t.common.older.loading : t.common.older.failed}
            </p>
          ) : going ? (
            <>
              <p className="text-amber-300 font-black text-sm">{t.profile.nextToClear}</p>
              <p className="text-amber-200/70 text-[11.5px] font-bold mt-2 leading-relaxed">
                <span className="text-amber-200">{going.label}</span>
                {going.due
                  ? t.profile.dueToClearDetail(going.activities)
                  : t.profile.nextToClearDetail(going.activities, longDate(going.clearedOn!))}
              </p>
            </>
          ) : (
            <>
              <p className="text-amber-300 font-black text-sm">{t.profile.nothingDue}</p>
              <p className="text-amber-200/70 text-[11.5px] font-bold mt-2 leading-relaxed">
                {t.profile.nothingDueHint}
              </p>
            </>
          )}

          <div className="grid grid-cols-2 gap-3 mt-4">
            {RETENTION_CHOICES.map((choice) => {
              const on = savings.retentionMonths === choice.months;
              return (
                <button
                  key={choice.label}
                  // Choosing a window is not consent to clearing what it newly
                  // leaves out: the months past the new cutoff are read and
                  // listed first, and only then acknowledged.
                  onClick={() => onSaveSettings({ retentionMonths: choice.months })}
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
            <span className="text-primary">{t.profile.moneyUntouched}</span>
            {t.profile.moneyUntouchedHint}
          </p>
        </div>
      </div>
    </div>
  );
};

export default Statements;
