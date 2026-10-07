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
import { Chip } from './ui/Chip';
import { EmptyState } from './ui/EmptyState';
import { Icon } from './ui/Icon';
import { Notice } from './ui/Notice';

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
   * Saving a statement here is the acknowledgement — and only of what this
   * screen showed. Once the months before the current cutoff have been read and
   * are on the screen, saving any statement records that cutoff, and clearing
   * never reaches past it. Merely opening the screen clears nothing. A
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
  const acknowledge = () => {
    if (!shownFor || new Date(shownFor).getTime() <= 0) return;
    if (savings.retentionAcknowledgedCutoff === shownFor && savings.retentionAcknowledged) return;
    onSaveSettings({ retentionAcknowledged: true, retentionAcknowledgedCutoff: shownFor });
  };

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
          buildMonthWorkbook({ label: month.label, banks, holdings, quotes, month: month.start, ...slice })
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
      // Only a statement that was really saved lets the listed months go.
      acknowledge();
    } catch (e) {
      say(e instanceof Error ? e.message : t.profile.saveFailed);
    } finally {
      setBusy(null);
    }
  };

  const FileButton: React.FC<{ month: MonthReport; kind: 'pdf' | 'sheet' }> = ({ month, kind }) => (
    <button
      type="button"
      onClick={() => void download(month, kind)}
      disabled={busy !== null}
      aria-label={t.profile.downloadLabel(kind, month.label)}
      className="min-h-11 min-w-14 shrink-0 rounded-full bg-line/10 px-3.5 text-[12.5px] font-extrabold active:opacity-70 disabled:opacity-40"
    >
      {busy === `${month.key}:${kind}` ? '…' : kind === 'pdf' ? 'PDF' : 'Excel'}
    </button>
  );

  const badge = 'shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-extrabold';

  return (
    <div className="flex min-h-full flex-col px-4 pb-40 pt-3 safe-pt font-figtree text-ink">
      <div className="mb-1 flex items-center gap-3 px-1">
        <button type="button" onClick={onBack} aria-label={t.common.back} className="grid size-11 place-items-center rounded-full bg-card active:opacity-80">
          <Icon name="back" size={20} />
        </button>
      </div>
      <h1 className="px-1 text-[30px] font-extrabold tracking-tight">{t.profile.statements}</h1>
      <p className="mt-0.5 px-1 text-[13.5px] font-semibold text-mute">{t.profile.statementsSubtitle}</p>

      {note && (
        <div role="status" className="mt-4 rounded-3xl bg-mint px-5 py-3">
          <p className="text-[13px] font-extrabold">{note}</p>
        </div>
      )}

      <div className="mt-4">
        {kept !== 'ready' ? (
          <Notice status={kept} onRetry={ledger.retry} />
        ) : months.length === 0 ? (
          <EmptyState icon="doc" title={t.profile.nothingToReport} body={t.profile.nothingToReportHint} />
        ) : (
          <div className="space-y-2.5">
            {months.map((month) => (
              <div key={month.key} className={`flex items-center gap-2 rounded-3xl p-3 pl-4 ${month.current ? 'bg-hero' : 'bg-card'}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="truncate text-[15px] font-extrabold">{month.label}</p>
                    {month.current && <span className={`${badge} bg-line/10`}>{t.profile.soFar}</span>}
                    {month.due && month.activities > 0 ? (
                      <span className={`${badge} bg-peach text-neg`}>{t.profile.dueBadge}</span>
                    ) : (
                      clearingSoon(month.clearedOn, now) && <span className={`${badge} bg-peach text-neg`}>{t.profile.clearing}</span>
                    )}
                  </div>
                  {month.due && month.activities > 0 && month.clearedOn && (
                    <p className="mt-0.5 text-[11.5px] font-bold text-neg">{t.profile.dueDetail(longDate(month.clearedOn))}</p>
                  )}
                  <p className="mt-0.5 text-[12px] font-medium text-mute">
                    {t.profile.records(month.activities)}
                    {month.activities > 0 && (
                      <>
                        {' · '}
                        <span className={month.net < 0 ? 'font-bold text-neg' : 'font-bold text-pos'}>{formatMoney(month.net, { signed: true })}</span>
                      </>
                    )}
                    {month.trades > 0 && (
                      <span className="text-info">
                        {' · '}
                        {t.profile.trades(month.trades)}
                      </span>
                    )}
                  </p>
                </div>
                <FileButton month={month} kind="pdf" />
                <FileButton month={month} kind="sheet" />
              </div>
            ))}
          </div>
        )}
      </div>

      {olderNote && <p className="mt-3 px-1 text-[12px] font-medium leading-relaxed text-mute">{olderNote}</p>}

      <p className="mt-3 px-1 text-center text-[11.5px] font-semibold text-mute">
        PDF · {t.profile.pdfStatement} &nbsp;&nbsp; Excel · {t.profile.excelRecords}
      </p>

      {/* ------------------------------------------------------ housekeeping */}

      <h2 className="mt-8 px-1 text-[16px] font-extrabold">{t.profile.keepingQuick}</h2>
      <p className="mt-1 px-1 text-[12.5px] font-medium leading-relaxed text-mute">{t.profile.keepingQuickHint}</p>

      <div className="mt-3 rounded-3xl bg-sun p-5">
        {kept !== 'ready' ? (
          <p className="text-[12.5px] font-bold leading-relaxed">{kept === 'loading' ? t.common.older.loading : t.common.older.failed}</p>
        ) : going ? (
          <>
            <p className="text-[15px] font-extrabold">{t.profile.nextToClear}</p>
            <p className="mt-1.5 text-[12.5px] font-medium leading-relaxed">
              <span className="font-extrabold">{going.label}</span>
              {going.due ? t.profile.dueToClearDetail(going.activities) : t.profile.nextToClearDetail(going.activities, longDate(going.clearedOn!))}
            </p>
          </>
        ) : (
          <>
            <p className="text-[15px] font-extrabold">{t.profile.nothingDue}</p>
            <p className="mt-1.5 text-[12.5px] font-medium leading-relaxed">{t.profile.nothingDueHint}</p>
          </>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          {RETENTION_CHOICES.map((choice) => {
            const on = savings.retentionMonths === choice.months;
            return (
              <Chip
                key={choice.label}
                selected={on}
                // Choosing a window is not consent to clearing what it newly
                // leaves out: the months past the new cutoff are read and
                // listed first, and only then acknowledged.
                onClick={() => onSaveSettings({ retentionMonths: choice.months })}
                className={on ? '' : 'bg-card/70 text-ink'}
              >
                {choice.label}
              </Chip>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex items-start gap-3 rounded-3xl bg-mint p-4">
        <Icon name="shield" size={20} className="mt-0.5" />
        <p className="text-[12.5px] font-medium leading-relaxed">
          <span className="font-extrabold">{t.profile.moneyUntouched}</span>
          {t.profile.moneyUntouchedHint}
        </p>
      </div>
    </div>
  );
};

export default Statements;
