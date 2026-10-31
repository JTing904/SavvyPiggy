import React, { useRef, useState } from 'react';
import type { Activity, ActivityType, PiggyBank } from '../types';
import { compressImage } from '../services/image';
import { uploadGoalImage } from '../services/storage';
import { isStorageEnabled } from '../lib/firebase';
import { archiveStrategy, isArchived, isFull, isInSplit } from '../services/ledger';
import type { BankEdit } from '../services/bankEdit';
import { safeGoalIcon } from '../services/goalIcons';
import { useLedgerRange, type Ledger } from '../hooks/useOlderLedger';
import OlderRecordsNotice from './OlderRecordsNotice';
import EditGoalSheet from './EditGoalSheet';
import { formatMoney, fromCents, percentReached, toCents } from '../services/money';
import { addMonthsTo, monthKeyOf, monthStartOf } from '../services/review';
import { useT } from '../contexts/LanguageContext';
import { deviceDateLocale, noteText, type Messages } from '../i18n';
import { Button } from './ui/Button';
import { Ring, type ChartColor } from './ui/Charts';
import { EmptyState } from './ui/EmptyState';
import { Group } from './ui/Group';
import { Icon } from './ui/Icon';
import { IconTile, type IconTint } from './ui/IconTile';
import { PageBand } from './ui/PageBand';
import { Row } from './ui/Row';
import { Sheet } from './ui/Sheet';

/** Which kind of entry reads as what: its icon, its square's tint, and how its figure is coloured. */
interface Style {
  label: (t: Messages) => string;
  icon: string;
  tint: IconTint;
  /** Money in and out go by sign; moves to and from shares are the investing colour. */
  tone: 'sign' | 'info';
}

/** Labels are looked up at render, so they follow the language. */
const STYLES: Record<ActivityType, Style> = {
  'auto-save': { label: (t) => t.goals.scheduledDeposit, icon: 'repeat', tint: 'teal', tone: 'sign' },
  manual: { label: (t) => t.common.activity.manual, icon: 'dep', tint: 'teal', tone: 'sign' },
  withdraw: { label: (t) => t.common.activity.withdraw, icon: 'out', tint: 'coral', tone: 'sign' },
  borrow: { label: (t) => t.common.activity.borrow, icon: 'out', tint: 'amber', tone: 'sign' },
  invest: { label: (t) => t.common.activity.invest, icon: 'trend', tint: 'violet', tone: 'info' },
  divest: { label: (t) => t.common.activity.divest, icon: 'trend', tint: 'violet', tone: 'info' },
  transfer: { label: (t) => t.common.activity.transfer, icon: 'swap', tint: 'teal', tone: 'sign' },
  toInvest: { label: (t) => t.common.activity.toInvest, icon: 'swap', tint: 'violet', tone: 'info' },
  fromInvest: { label: (t) => t.common.activity.fromInvest, icon: 'swap', tint: 'violet', tone: 'info' },
  walletMove: { label: (t) => t.common.activity.walletMove, icon: 'swap', tint: 'violet', tone: 'info' },
  loanPayment: { label: (t) => t.common.activity.loanPayment, icon: 'out', tint: 'coral', tone: 'sign' },
};

interface GoalDetailProps {
  uid: string;
  bank: PiggyBank;
  banks: PiggyBank[];
  activities: Activity[];
  /** The goal's history covers everything kept, so the older part is read when it opens. */
  ledger: Ledger;
  onBack: () => void;
  onEditStrategy: () => void;
  onChangePhoto: (imageUrl: string) => Promise<void> | void;
  onArchive: () => void;
  onUnarchive: () => void;
  /** Saves a change to the goal's name, target or icon. Rejects with the reason it was refused. */
  onEditGoal: (edit: BankEdit) => Promise<void>;
  /** Tapping an entry opens it in the shared entry sheet. */
  onOpenEntry: (id: string) => void;
  /** A trade's row is corrected through its trade, so tapping one opens it. */
  onOpenTrade?: (tradeId: string) => void;
  /** Opens a move with this goal as where the money starts. */
  onMove?: () => void;
  /** Opens a spend with this goal as where it comes from. */
  onSpend?: () => void;
}

const GoalDetail: React.FC<GoalDetailProps> = ({
  uid,
  bank,
  banks,
  activities,
  ledger,
  onBack,
  onEditStrategy,
  onChangePhoto,
  onArchive,
  onUnarchive,
  onEditGoal,
  onOpenEntry,
  onOpenTrade,
  onMove,
  onSpend,
}) => {
  const t = useT();
  const p = t.pro.goal;
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [editing, setEditing] = useState(false);

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      // Cloud Storage when it is switched on, otherwise the shrunken photo
      // lives inside the goal document itself.
      const imageUrl = isStorageEnabled ? await uploadGoalImage(uid, file) : await compressImage(file);
      await onChangePhoto(imageUrl);
    } catch (e) {
      setError((e as Error).message || t.goals.couldNotUseImage);
    } finally {
      setUploading(false);
    }
  };

  // Every entry that moved money in or out of this goal, newest first, paired
  // with the slice that actually belonged to it.
  const entries = activities
    .map((activity) => ({
      activity,
      amount: activity.distributions
        .filter((d) => d.bankId === bank.id)
        .reduce((sum, d) => sum + d.amount, 0),
    }))
    .filter((e) => e.amount !== 0);

  const paidIn = entries.filter((e) => e.amount > 0).reduce((sum, e) => sum + e.amount, 0);
  const takenOut = entries.filter((e) => e.amount < 0).reduce((sum, e) => sum - e.amount, 0);

  const overspent = toCents(bank.currentAmount) < 0;
  const hasTarget = bank.targetAmount > 0;
  const remaining = bank.targetAmount - bank.currentAmount;

  const archived = isArchived(bank);
  // The colour the goal has on the goals page: its place among those not put away.
  const color = ((Math.max(0, banks.filter((b) => !isArchived(b)).findIndex((b) => b.id === bank.id)) % 5) + 1) as ChartColor;
  // What archiving would do to the strategy, so the sheet can spell it out.
  const share = isInSplit(bank) ? bank.splitPercentage : 0;
  const handovers = archiveStrategy(banks, bank.id)
    .map((b) => ({ name: b.name, gained: b.splitPercentage - (banks.find((x) => x.id === b.id)?.splitPercentage ?? 0) }))
    .filter((b) => b.gained > 0);

  // Paid in and taken out are over everything kept; until the part older than
  // the live three months is read they show nothing rather than a smaller sum.
  const history = useLedgerRange(ledger, ledger.keptFrom);
  const complete = history === 'ready';
  const stats = [
    { label: t.goals.paidIn, value: complete ? formatMoney(paidIn, { decimals: 0 }) : '—' },
    { label: t.goals.takenOut, value: complete ? formatMoney(takenOut, { decimals: 0 }) : '—' },
    { label: t.goals.entries, value: complete ? String(entries.length) : '—' },
  ];

  // What went in month by month, from the entries themselves, in the months the
  // kept history covers. Until all of it is read the bars wait, as the totals do.
  const thisMonth = monthStartOf(new Date());
  const monthly = [-5, -4, -3, -2, -1, 0]
    .map((back) => addMonthsTo(thisMonth, back))
    .filter((start) => start.getTime() >= monthStartOf(ledger.keptFrom).getTime())
    .map((start) => ({
      start,
      cents: entries
        .filter((e) => e.amount > 0 && monthKeyOf(new Date(e.activity.date)) === monthKeyOf(start))
        .reduce((sum, e) => sum + toCents(e.amount), 0),
    }));
  const topMonth = Math.max(0, ...monthly.map((m) => m.cents));
  const latest = monthly[monthly.length - 1];
  const plain = (ringgit: number) => formatMoney(ringgit, { symbol: false });
  const reached = percentReached(bank.currentAmount, bank.targetAmount);

  return (
    <div className="flex min-h-full flex-col bg-page pb-40 font-figtree text-ink">
      <PageBand
        title={
          <span className="flex min-w-0 items-center gap-2">
            <span className="material-symbols-rounded shrink-0 text-[22px] leading-none" aria-hidden="true">
              {safeGoalIcon(bank.icon)}
            </span>
            <span className="min-w-0 truncate">{bank.name}</span>
          </span>
        }
        onBack={onBack}
        overlap={16}
        trailing={
          <button type="button" onClick={() => setEditing(true)} aria-label={t.goalEdit.editGoal} className="-mr-2.5 grid size-11 shrink-0 place-items-center active:opacity-70">
            <Icon name="pencil" size={21} strokeWidth={1.9} />
          </button>
        }
      />

      <div className="-mt-[58px] flex flex-col gap-2.5 px-4">
        {/* The goal at a glance. The cover photo, when there is one, sits across the top. */}
        <div className="overflow-hidden rounded-3xl bg-card shadow-[0_2px_10px_rgba(20,35,58,0.1)]">
          {bank.imageUrl && (
            <img
              key={bank.imageUrl}
              src={bank.imageUrl}
              alt=""
              className="aspect-[16/9] w-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          )}
          <div className="flex items-center gap-4 p-3.5">
            <Ring percent={hasTarget ? reached : null} color={color} size={112} width={12} label={hasTarget ? p.ring(bank.name, reached) : bank.name}>
              {hasTarget ? (
                <span className="text-[24px] font-bold tabular-nums">{reached}%</span>
              ) : (
                <span className="material-symbols-rounded text-[34px] leading-none text-mute">{safeGoalIcon(bank.icon)}</span>
              )}
            </Ring>
            <div className="min-w-0 flex-1 tabular-nums">
              <p className="text-[13px] font-semibold text-mute">{overspent ? t.goals.overspent : t.goals.saved}</p>
              <p className={`mt-px truncate text-[24px] font-bold leading-tight ${overspent ? 'text-neg' : ''}`}>{formatMoney(bank.currentAmount)}</p>
              {hasTarget ? (
                <>
                  <p className="mt-2 truncate text-[13px] font-semibold text-mute">{p.target(plain(bank.targetAmount))}</p>
                  <p className="mt-0.5 truncate text-[13px] font-semibold text-mute">{toCents(remaining) > 0 ? p.stillToGo(plain(remaining)) : t.goals.targetReached}</p>
                </>
              ) : (
                <p className="mt-2 text-[13px] font-semibold text-mute">{t.goals.noFinishLine}</p>
              )}
            </div>
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-2xl bg-card px-4 py-3 text-[13px] font-bold text-neg">
            {error}
          </p>
        )}

        {/* An archived goal is off the money pages, so these wait until it is back. */}
        {!archived && onMove && onSpend && (
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={onMove} className="!px-2">
              <Icon name="swap" size={20} strokeWidth={2} />
              {t.pro.home.move}
            </Button>
            <Button variant="ghost" onClick={onSpend} className="!px-2">
              <Icon name="out" size={20} strokeWidth={2} className="text-tcoral" />
              {p.spendHere}
            </Button>
          </div>
        )}

        {complete && topMonth > 0 && (
          <div className="rounded-3xl bg-card px-3.5 py-3">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-[15px] font-bold">{p.monthly}</h2>
              <span className="truncate text-[13px] font-semibold tabular-nums text-mute">
                {p.monthAmount(t.report.monthsShort[latest.start.getMonth()], formatMoney(fromCents(latest.cents), { symbol: false }))}
              </span>
            </div>
            <div role="img" aria-label={p.monthlyChart(monthly.map((m) => `${t.report.monthsShort[m.start.getMonth()]} ${formatMoney(fromCents(m.cents))}`).join('，'))}>
              <div className="mt-2.5 flex h-[72px] items-end gap-3 border-b border-track" aria-hidden="true">
                {monthly.map((m) => (
                  <span
                    key={m.start.getTime()}
                    className={`block min-w-0 flex-1 rounded-t ${m === latest ? 'bg-c1' : 'bg-c1/30'}`}
                    style={{ height: m.cents > 0 ? `${Math.max(4, (m.cents / topMonth) * 100)}%` : 0 }}
                  />
                ))}
              </div>
              <div className="mt-1 flex gap-3" aria-hidden="true">
                {monthly.map((m) => (
                  <span key={m.start.getTime()} className="min-w-0 flex-1 truncate text-center text-[11.5px] font-semibold text-mute">
                    {t.report.monthsShort[m.start.getMonth()]}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          {stats.map((s) => (
            <div key={s.label} className="min-w-0 rounded-2xl bg-card px-3 py-2.5">
              <p className="truncate text-[12.5px] font-semibold text-mute">{s.label}</p>
              <p className="truncate text-[15px] font-bold tabular-nums">{s.value}</p>
            </div>
          ))}
        </div>

        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            void pickPhoto(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <Group>
          <Row
            icon="pie"
            tint="mint"
            title={bank.autoSplit === false ? t.goals.excludedFromDeposits : t.goals.percentOfEveryDeposit(bank.splitPercentage)}
            sub={t.goalEdit.shareHint}
            trailing={<Icon name="chev" size={18} className="text-mute" />}
            onClick={onEditStrategy}
          />
          <Row
            icon="camera"
            tint="lav"
            title={t.goalEdit.coverPhoto}
            sub={uploading ? t.goals.saving : bank.imageUrl ? t.goals.change : t.goals.addPhoto}
            trailing={<Icon name="chev" size={18} className="text-mute" />}
            onClick={uploading ? undefined : () => fileInput.current?.click()}
          />
          {archived ? (
            <Row
              icon="archive"
              tint="peach"
              title={t.goals.archived}
              sub={t.goals.restoreAtZero}
              trailing={<Icon name="chev" size={18} className="text-mute" />}
              onClick={onUnarchive}
            />
          ) : (
            <Row
              icon="archive"
              tint="peach"
              title={t.goals.archiveThisGoal}
              sub={isFull(bank) ? t.goals.archiveFull : t.goals.archiveNotFull}
              trailing={<Icon name="chev" size={18} className="text-mute" />}
              onClick={() => setConfirmArchive(true)}
            />
          )}
        </Group>

        <h2 className="mt-2 px-1 text-[15px] font-bold">{t.goals.activity}</h2>
        {history !== 'ready' && <OlderRecordsNotice status={history} onRetry={ledger.retry} />}
        {entries.length === 0 && history !== 'ready' ? null : entries.length === 0 ? (
          <div className="rounded-3xl bg-card">
            <EmptyState icon="doc" title={t.goals.nothingYet} body={t.goals.depositsShowHere} />
          </div>
        ) : (
          <Group>
            {entries.map(({ activity, amount }) => {
              const style = STYLES[activity.type];
              // Money moved for shares reads as the trade it was, and opens it.
              const trade = activity.type === 'invest' || activity.type === 'divest';
              const { tradeId } = activity;
              const open = trade && tradeId && onOpenTrade ? () => onOpenTrade(tradeId) : () => onOpenEntry(activity.id);
              const when = new Date(activity.date).toLocaleDateString(deviceDateLocale(), {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });
              // The goal is this page, so a trade's line names only what else it did.
              const meta = trade
                ? [
                    activity.units ? t.common.units(activity.units.toLocaleString('en-US')) : '',
                    activity.type === 'divest' && activity.distributions.length > 1
                      ? t.history.splitAcross(activity.distributions.length)
                      : '',
                    when,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : when;
              const title =
                trade && activity.counter
                  ? t.history.tradeTitle(style.label(t), activity.counter)
                  : activity.type === 'transfer' && activity.fromGoal
                    ? t.common.movedFrom(style.label(t), activity.fromGoal)
                    : (activity.note && noteText(activity.note)) || style.label(t);
              const tone = style.tone === 'info' ? 'text-info' : amount < 0 ? 'text-neg' : 'text-pos';
              return (
                <button key={activity.id} type="button" onClick={open} className="flex min-h-[58px] w-full items-center gap-2.5 py-2 text-left active:opacity-70">
                  <IconTile icon={style.icon} tint={style.tint} size={38} round />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-bold">{title}</span>
                    <span className="block truncate text-[12.5px] font-semibold text-mute">{meta}</span>
                  </span>
                  <span className={`shrink-0 text-[14.5px] font-bold tabular-nums ${tone}`}>{formatMoney(amount, { signed: true })}</span>
                </button>
              );
            })}
          </Group>
        )}
      </div>

      {editing && <EditGoalSheet bank={bank} onSave={onEditGoal} onClose={() => setEditing(false)} />}

      {confirmArchive && (
        <Sheet
          title={t.goals.archiveTitle(bank.name)}
          onClose={() => setConfirmArchive(false)}
          footer={
            <div className="flex gap-3">
              <Button variant="ghost" onClick={() => setConfirmArchive(false)}>
                {t.common.cancel}
              </Button>
              <Button
                onClick={() => {
                  setConfirmArchive(false);
                  onArchive();
                }}
              >
                {t.goals.archive}
              </Button>
            </div>
          }
        >
          <p className="text-[14px] font-medium leading-relaxed text-mute">{t.goals.archiveBody(formatMoney(bank.currentAmount))}</p>

          {share > 0 && (
            <div className="mt-4 rounded-3xl bg-card p-4">
              <p className="text-[12.5px] font-bold text-mute">{t.goals.shareGoesTo(share)}</p>
              {handovers.length === 0 ? (
                <p className="mt-2 text-[13px] font-medium leading-relaxed text-mute">{t.goals.noOtherGoal(share)}</p>
              ) : (
                <div className="mt-2 divide-y divide-line/10">
                  {handovers.map((h) => (
                    <div key={h.name} className="flex min-h-11 items-center justify-between gap-3">
                      <span className="truncate text-[14.5px] font-bold">{h.name}</span>
                      <span className="shrink-0 text-[14.5px] font-extrabold text-pos">+{h.gained}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Sheet>
      )}
    </div>
  );
};

export default GoalDetail;
