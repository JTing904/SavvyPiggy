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
import { formatMoney, percentReached, toCents } from '../services/money';
import { useT } from '../contexts/LanguageContext';
import { deviceDateLocale, noteText, type Messages } from '../i18n';
import { Amount } from './ui/Amount';
import { Button } from './ui/Button';
import { EmptyState } from './ui/EmptyState';
import { Group } from './ui/Group';
import { Icon } from './ui/Icon';
import { Row, type RowTone } from './ui/Row';
import { Sheet } from './ui/Sheet';
import type { TileTint } from './ui/Tile';

/** Which kind of entry reads as what: its icon, its square's tint, and how its figure is coloured. */
interface Style {
  label: (t: Messages) => string;
  icon: string;
  tint: TileTint;
  /** Money in and out go by sign; moves to and from shares are the investing colour. */
  tone: 'sign' | 'info';
}

/** Labels are looked up at render, so they follow the language. */
const STYLES: Record<ActivityType, Style> = {
  'auto-save': { label: (t) => t.goals.scheduledDeposit, icon: 'repeat', tint: 'mint', tone: 'sign' },
  manual: { label: (t) => t.common.activity.manual, icon: 'dep', tint: 'mint', tone: 'sign' },
  withdraw: { label: (t) => t.common.activity.withdraw, icon: 'out', tint: 'peach', tone: 'sign' },
  borrow: { label: (t) => t.common.activity.borrow, icon: 'out', tint: 'sun', tone: 'sign' },
  invest: { label: (t) => t.common.activity.invest, icon: 'trend', tint: 'lav', tone: 'info' },
  divest: { label: (t) => t.common.activity.divest, icon: 'trend', tint: 'lav', tone: 'info' },
  transfer: { label: (t) => t.common.activity.transfer, icon: 'swap', tint: 'mint', tone: 'sign' },
  toInvest: { label: (t) => t.common.activity.toInvest, icon: 'swap', tint: 'lav', tone: 'info' },
  fromInvest: { label: (t) => t.common.activity.fromInvest, icon: 'swap', tint: 'lav', tone: 'info' },
};

// Full literal strings so the build keeps every class.
const HERO: Record<TileTint, string> = {
  peach: 'bg-peach',
  mint: 'bg-mint',
  lav: 'bg-lav',
  sun: 'bg-sun',
};
// The same order the money sheet colours its goal tiles in.
const TINTS: TileTint[] = ['peach', 'lav', 'sun', 'mint'];

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
}) => {
  const t = useT();
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
  const progress = hasTarget
    ? Math.min(100, Math.max(0, (bank.currentAmount / bank.targetAmount) * 100))
    : 0;
  const remaining = bank.targetAmount - bank.currentAmount;
  const tint = TINTS[Math.max(0, banks.findIndex((b) => b.id === bank.id)) % TINTS.length];

  const archived = isArchived(bank);
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

  return (
    <div className="flex min-h-full flex-col bg-page pb-40 font-figtree text-ink safe-pt">
      <div className="sticky top-0 z-20 flex items-center justify-between gap-3 bg-page px-5 py-2">
        <button
          type="button"
          onClick={onBack}
          aria-label={t.common.back}
          className="grid size-11 place-items-center rounded-full bg-card text-ink active:opacity-70"
        >
          <Icon name="back" size={20} />
        </button>
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={t.goalEdit.editGoal}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-card px-4 text-[13.5px] font-bold text-ink active:opacity-70"
        >
          <Icon name="pencil" size={16} />
          {t.goalEdit.edit}
        </button>
      </div>

      <div className="space-y-3 px-5">
        <h1 className="break-words text-[30px] font-extrabold leading-tight tracking-[-0.035em]">{bank.name}</h1>

        {/* The goal at a glance. The cover photo, when there is one, sits across the top. */}
        <div className={`overflow-hidden rounded-[28px] ${HERO[tint]}`}>
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
          <div className="p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="grid size-11 place-items-center rounded-full bg-card/70 text-ink" aria-hidden="true">
                <span className="material-symbols-rounded" style={{ fontSize: 24 }}>
                  {safeGoalIcon(bank.icon)}
                </span>
              </span>
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
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={uploading}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-card/70 px-4 text-[13px] font-bold text-ink active:opacity-70 disabled:opacity-50"
              >
                <Icon name="camera" size={16} />
                {uploading ? t.goals.saving : bank.imageUrl ? t.goals.change : t.goals.addPhoto}
              </button>
            </div>

            <p className="mt-4 text-[12.5px] font-bold text-mute">{overspent ? t.goals.overspent : t.goals.saved}</p>
            <Amount cents={toCents(bank.currentAmount)} size="xl" tone={overspent ? 'neg' : 'ink'} />

            {hasTarget && !overspent && (
              <div
                className="mt-4 h-2 w-full overflow-hidden rounded-full bg-line/10"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress)}
              >
                <div className="h-full rounded-full bg-ink" style={{ width: `${progress}%` }} />
              </div>
            )}
            <p className="mt-2 text-[12.5px] font-semibold text-mute">
              {hasTarget
                ? toCents(remaining) > 0
                  ? t.goals.toGo(formatMoney(remaining), percentReached(bank.currentAmount, bank.targetAmount))
                  : t.goals.targetReached
                : t.goals.noFinishLine}
            </p>
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-2xl bg-card px-4 py-3 text-[13px] font-bold text-neg">
            {error}
          </p>
        )}

        <div className="grid grid-cols-3 gap-2">
          {stats.map((s) => (
            <div key={s.label} className="min-w-0 rounded-2xl bg-card px-3 py-2.5">
              <p className="truncate text-[11.5px] font-semibold text-mute">{s.label}</p>
              <p className="truncate text-[15px] font-extrabold tabular-nums">{s.value}</p>
            </div>
          ))}
        </div>

        <Group>
          <Row
            icon="pie"
            tint="mint"
            title={bank.autoSplit === false ? t.goals.excludedFromDeposits : t.goals.percentOfEveryDeposit(bank.splitPercentage)}
            sub={t.goalEdit.shareHint}
            trailing={<Icon name="chev" size={18} className="text-mute" />}
            onClick={onEditStrategy}
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
      </div>

      <div className="mt-7 px-5">
        <h2 className="mb-2.5 px-1 text-[17px] font-extrabold tracking-tight">{t.goals.activity}</h2>
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
              const tone: RowTone = style.tone === 'info' ? 'info' : amount < 0 ? 'neg' : 'pos';
              return (
                <Row
                  key={activity.id}
                  icon={style.icon}
                  tint={style.tint}
                  title={title}
                  sub={meta}
                  trailing={formatMoney(amount, { signed: true })}
                  tone={tone}
                  onClick={open}
                />
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
