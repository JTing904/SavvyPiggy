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
import BackupSheet from './BackupSheet';
import { Chip } from './ui/Chip';
import { Group } from './ui/Group';
import { Row } from './ui/Row';
import { EmptyState } from './ui/EmptyState';
import { Icon } from './ui/Icon';
import { IconTile } from './ui/IconTile';
import { Notice } from './ui/Notice';
import { PageBand } from './ui/PageBand';

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
  const [showBackup, setShowBackup] = useState(false);
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
      className="min-h-11 min-w-14 shrink-0 rounded-xl bg-page px-3 text-[13px] font-bold active:opacity-70 disabled:opacity-40"
    >
      {busy === `${month.key}:${kind}` ? '…' : kind === 'pdf' ? 'PDF' : 'Excel'}
    </button>
  );

  const badge = 'shrink-0 rounded-md px-1.5 py-0.5 text-[11.5px] font-bold';

  return (
    <div className="flex min-h-full flex-col pb-40 font-figtree text-ink">
      <PageBand title={t.profile.statements} onBack={onBack}>
        <p className="truncate text-[13.5px] font-semibold text-band-sub">{t.profile.statementsSubtitle}</p>
      </PageBand>

      <div className="flex flex-col gap-2.5 px-4 pt-3">
        {note && (
          <div role="status" className="rounded-3xl bg-mint px-3.5 py-2.5">
            <p className="text-[13px] font-bold">{note}</p>
          </div>
        )}

        <Group>
          <Row
            icon="dep"
            tint="mint"
            title={t.backup.rowTitle}
            sub={t.backup.rowSub}
            trailing={<Icon name="chev" size={18} className="text-mute" />}
            tone="mute"
            onClick={() => setShowBackup(true)}
          />
        </Group>

        {kept !== 'ready' ? (
          <Notice status={kept} onRetry={ledger.retry} />
        ) : months.length === 0 ? (
          <EmptyState icon="doc" title={t.profile.nothingToReport} body={t.profile.nothingToReportHint} />
        ) : (
          <div className="divide-y divide-line/10 rounded-3xl bg-card px-3.5 py-0.5">
            {months.map((month) => (
              <div key={month.key} className="flex min-h-[60px] items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="truncate text-[14.5px] font-bold">{month.label}</p>
                    {month.current && <span className={`${badge} bg-hero text-tblue`}>{t.profile.soFar}</span>}
                    {month.due && month.activities > 0 ? (
                      <span className={`${badge} bg-peach text-neg`}>{t.profile.dueBadge}</span>
                    ) : (
                      clearingSoon(month.clearedOn, now) && <span className={`${badge} bg-peach text-neg`}>{t.profile.clearing}</span>
                    )}
                  </div>
                  {month.due && month.activities > 0 && month.clearedOn && (
                    <p className="mt-0.5 text-[12.5px] font-bold text-neg">{t.profile.dueDetail(longDate(month.clearedOn))}</p>
                  )}
                  <p className="mt-0.5 text-[12.5px] font-semibold text-mute">
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

        {olderNote && <p className="px-1 text-[12.5px] font-medium leading-relaxed text-mute">{olderNote}</p>}

        <p className="px-1 text-center text-[12.5px] font-semibold text-mute">
          PDF · {t.profile.pdfStatement} &nbsp;&nbsp; Excel · {t.profile.excelRecords}
        </p>

        {/* ------------------------------------------------------ housekeeping */}

        <div className="mt-3 px-1">
          <h2 className="text-[15px] font-bold">{t.profile.keepingQuick}</h2>
          <p className="text-[12.5px] font-medium leading-relaxed text-mute">{t.profile.keepingQuickHint}</p>
        </div>

        <div className="rounded-3xl bg-card p-3.5">
          {kept !== 'ready' ? (
            <p className="text-[12.5px] font-bold leading-relaxed">{kept === 'loading' ? t.common.older.loading : t.common.older.failed}</p>
          ) : going ? (
            <>
              <p className="text-[15px] font-bold">{t.profile.nextToClear}</p>
              <p className="mt-1 text-[12.5px] font-medium leading-relaxed text-mute">
                <span className="font-bold text-ink">{going.label}</span>
                {going.due ? t.profile.dueToClearDetail(going.activities) : t.profile.nextToClearDetail(going.activities, longDate(going.clearedOn!))}
              </p>
            </>
          ) : (
            <>
              <p className="text-[15px] font-bold">{t.profile.nothingDue}</p>
              <p className="mt-1 text-[12.5px] font-medium leading-relaxed text-mute">{t.profile.nothingDueHint}</p>
            </>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2">
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
                  className={on ? '' : '!bg-page !text-ink'}
                >
                  {choice.label}
                </Chip>
              );
            })}
          </div>
        </div>

        <div className="flex items-start gap-2.5 rounded-3xl bg-card p-3.5">
          <IconTile icon="shield" tint="teal" size={38} />
          <p className="min-w-0 flex-1 text-[12.5px] font-medium leading-relaxed text-mute">
            <span className="font-bold text-ink">{t.profile.moneyUntouched}</span>
            {t.profile.moneyUntouchedHint}
          </p>
        </div>
      </div>

      {showBackup && <BackupSheet onClose={() => setShowBackup(false)} />}
    </div>
  );
};

export default Statements;
