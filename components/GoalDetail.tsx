import React, { useRef, useState } from 'react';
import type { Activity, ActivityType, PiggyBank } from '../types';
import { compressImage } from '../services/image';
import { uploadGoalImage } from '../services/storage';
import { isStorageEnabled } from '../lib/firebase';
import { archiveStrategy, isArchived, isFull, isInSplit } from '../services/ledger';
import { useBackHandler } from '../hooks/useBackHandler';

const STYLES: Record<ActivityType, { label: string; icon: string; tint: string }> = {
  'auto-save': { label: 'Scheduled Deposit', icon: 'magic_button', tint: 'bg-primary/10 text-primary' },
  manual: { label: 'Deposit', icon: 'person', tint: 'bg-blue-400/10 text-blue-400' },
  withdraw: { label: 'Withdrawal', icon: 'north_east', tint: 'bg-slate-500/10 text-slate-400' },
  borrow: { label: 'Borrowed', icon: 'account_balance', tint: 'bg-amber-500/10 text-amber-400' },
};

const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toFixed(2)}`;

interface GoalDetailProps {
  uid: string;
  bank: PiggyBank;
  banks: PiggyBank[];
  activities: Activity[];
  onBack: () => void;
  onEditStrategy: () => void;
  onChangePhoto: (imageUrl: string) => Promise<void> | void;
  onArchive: () => void;
  onUnarchive: () => void;
}

const GoalDetail: React.FC<GoalDetailProps> = ({
  uid,
  bank,
  banks,
  activities,
  onBack,
  onEditStrategy,
  onChangePhoto,
  onArchive,
  onUnarchive,
}) => {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  useBackHandler(confirmArchive, () => setConfirmArchive(false));

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
      setError((e as Error).message || 'Could not use that image.');
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

  const overspent = bank.currentAmount < 0;
  const hasTarget = bank.targetAmount > 0;
  const progress = hasTarget
    ? Math.min(100, Math.max(0, (bank.currentAmount / bank.targetAmount) * 100))
    : 0;
  const remaining = bank.targetAmount - bank.currentAmount;

  const archived = isArchived(bank);
  // What archiving would do to the strategy, so the sheet can spell it out.
  const share = isInSplit(bank) ? bank.splitPercentage : 0;
  const handovers = archiveStrategy(banks, bank.id)
    .map((b) => ({ name: b.name, gained: b.splitPercentage - (banks.find((x) => x.id === b.id)?.splitPercentage ?? 0) }))
    .filter((b) => b.gained > 0);

  const stats = [
    { label: 'Paid in', value: `$${paidIn.toFixed(2)}` },
    { label: 'Taken out', value: `$${takenOut.toFixed(2)}` },
    { label: 'Entries', value: String(entries.length) },
  ];

  return (
    <div className="flex flex-col min-h-full bg-bg-dark pb-40 safe-pt">
      <div className="flex items-center px-6 py-4 justify-between sticky top-0 bg-bg-dark/80 backdrop-blur-md z-20">
        <button
          onClick={onBack}
          className="size-10 rounded-full glass flex items-center justify-center text-slate-300 active:scale-90 transition-transform"
        >
          <span className="material-symbols-rounded text-xl">arrow_back_ios_new</span>
        </button>
        <h2 className="text-white text-lg font-bold tracking-tight truncate px-3">{bank.name}</h2>
        <div className="size-10"></div>
      </div>

      <div className="px-6 pt-2 space-y-4">
        {/* Artwork, drawn locally when there is no uploaded cover. */}
        <div className="w-full aspect-[16/10] rounded-[2rem] relative overflow-hidden bg-gradient-to-br from-primary/25 to-accent/10">
          <div className="absolute inset-0 flex items-center justify-center text-primary/25">
            <span className="material-symbols-rounded text-8xl">{bank.icon}</span>
          </div>
          {bank.imageUrl && (
            <img
              key={bank.imageUrl}
              src={bank.imageUrl}
              alt=""
              className="absolute inset-0 size-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent"></div>

          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void pickPhoto(e.target.files?.[0])}
          />
          <button
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            className="absolute top-4 right-4 h-10 px-4 rounded-full glass flex items-center gap-2 text-white text-xs font-bold active:scale-90 transition-transform disabled:opacity-50"
          >
            <span className="material-symbols-rounded text-lg">
              {bank.imageUrl ? 'edit' : 'add_photo_alternate'}
            </span>
            {uploading ? 'Saving...' : bank.imageUrl ? 'Change' : 'Add photo'}
          </button>

          <div className="absolute bottom-5 left-5 right-5">
            <p className="text-white/60 text-[10px] font-black uppercase tracking-widest mb-1">
              {overspent ? 'Overspent' : 'Saved'}
            </p>
            <h1 className={`text-4xl font-extrabold tracking-tight ${overspent ? 'text-red-400' : 'text-white'}`}>
              {money(bank.currentAmount)}
            </h1>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-3 rounded-2xl bg-red-500/10 border border-red-500/20 px-5 py-4">
            <span className="material-symbols-rounded text-red-400 text-lg">error</span>
            <p className="text-red-300 text-xs font-bold leading-relaxed">{error}</p>
          </div>
        )}

        {/* Progress toward the target, or the open-ended marker. */}
        <div className="bg-surface border border-white/5 rounded-[2rem] p-6 space-y-3 shadow-xl">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-slate-500 text-xs font-black uppercase tracking-widest">
              {hasTarget ? 'Target' : 'No limit'}
            </p>
            <p className="text-white font-black">
              {hasTarget ? `$${bank.targetAmount.toLocaleString()}` : '∞'}
            </p>
          </div>
          <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
            {overspent ? (
              <div className="h-full w-full rounded-full bg-red-500/30"></div>
            ) : hasTarget ? (
              <div
                className="h-full bg-primary rounded-full shadow-[0_0_10px_rgba(74,222,128,0.5)] transition-all duration-700"
                style={{ width: `${progress}%` }}
              ></div>
            ) : (
              <div className="h-full w-full rounded-full bg-gradient-to-r from-primary/40 to-accent/10"></div>
            )}
          </div>
          <p className="text-slate-500 text-xs font-medium">
            {hasTarget
              ? remaining > 0
                ? `${money(remaining)} to go · ${Math.round(progress)}% there`
                : 'Target reached'
              : 'Keep saving with no finish line.'}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="bg-surface border border-white/5 rounded-3xl p-4 text-center shadow-xl">
              <p className="text-white text-lg font-black tabular-nums">{s.value}</p>
              <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        <button
          onClick={onEditStrategy}
          className="w-full bg-surface border border-white/5 rounded-[2rem] p-5 flex items-center gap-4 shadow-xl active:scale-[0.99] transition-transform text-left"
        >
          <div className="size-12 shrink-0 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
            <span className="material-symbols-rounded text-2xl">pie_chart</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-white font-bold">
              {bank.autoSplit === false ? 'Excluded from deposits' : `${bank.splitPercentage}% of every deposit`}
            </p>
            <p className="text-slate-500 text-xs font-medium">Change on the Strategy tab</p>
          </div>
          <span className="material-symbols-rounded text-slate-600">chevron_right</span>
        </button>

        {archived ? (
          <button
            onClick={onUnarchive}
            className="w-full bg-surface border border-white/5 rounded-[2rem] p-5 flex items-center gap-4 shadow-xl active:scale-[0.99] transition-transform text-left"
          >
            <div className="size-12 shrink-0 rounded-2xl bg-white/5 text-slate-400 flex items-center justify-center">
              <span className="material-symbols-rounded text-2xl">unarchive</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-white font-bold">Archived</p>
              <p className="text-slate-500 text-xs font-medium">Restore it to the list at 0% of deposits</p>
            </div>
          </button>
        ) : (
          <button
            onClick={() => setConfirmArchive(true)}
            className="w-full bg-surface border border-white/5 rounded-[2rem] p-5 flex items-center gap-4 shadow-xl active:scale-[0.99] transition-transform text-left"
          >
            <div className="size-12 shrink-0 rounded-2xl bg-white/5 text-slate-400 flex items-center justify-center">
              <span className="material-symbols-rounded text-2xl">inventory_2</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-white font-bold">Archive this goal</p>
              <p className="text-slate-500 text-xs font-medium">
                {isFull(bank) ? 'Target reached — put it away, keep the money' : 'Put it away without deleting anything'}
              </p>
            </div>
          </button>
        )}
      </div>

      <div className="px-6 mt-8">
        <h3 className="text-white text-lg font-bold mb-4">Activity</h3>
        <div className="space-y-3">
          {entries.length === 0 ? (
            <div className="bg-surface border border-dashed border-white/10 rounded-[2rem] p-12 flex flex-col items-center justify-center text-center">
              <span className="material-symbols-rounded text-4xl text-slate-700 mb-4">receipt_long</span>
              <p className="text-slate-500 font-bold">Nothing yet</p>
              <p className="text-slate-600 text-xs mt-1">Deposits reaching this goal show up here</p>
            </div>
          ) : (
            entries.map(({ activity, amount }) => {
              const style = STYLES[activity.type];
              return (
                <div
                  key={activity.id}
                  className="flex items-center justify-between gap-3 p-4 rounded-2xl glass"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className={`size-11 shrink-0 rounded-2xl flex items-center justify-center ${style.tint}`}>
                      <span className="material-symbols-rounded">{style.icon}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-white font-bold text-sm truncate">{activity.note || style.label}</p>
                      <p className="text-slate-500 text-[10px] font-medium">
                        {new Date(activity.date).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                  <p className={`font-black shrink-0 tabular-nums ${amount < 0 ? 'text-slate-400' : 'text-white'}`}>
                    {amount < 0 ? '-' : '+'}${Math.abs(amount).toFixed(2)}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </div>

      {confirmArchive && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setConfirmArchive(false)}
        >
          <div
            className="w-full max-w-md bg-surface rounded-t-[3rem] sm:rounded-[3rem] sm:mb-6 shadow-2xl animate-in slide-in-from-bottom duration-300 p-7 safe-pb"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-white text-2xl font-black">Archive {bank.name}?</h3>
            <p className="text-slate-400 text-sm font-medium mt-3 leading-relaxed">
              Its {money(bank.currentAmount)} stays in your total savings and every record stays in your history. The goal
              just leaves the Home and Strategy lists.
            </p>

            {share > 0 && (
              <div className="mt-5 rounded-3xl bg-white/5 p-5">
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">
                  Its {share}% goes to
                </p>
                {handovers.length === 0 ? (
                  <p className="text-slate-400 text-xs font-medium mt-3 leading-relaxed">
                    No other goal is taking a share yet, so {share}% of each deposit will be left unassigned until you set
                    the split.
                  </p>
                ) : (
                  <div className="space-y-2 mt-3">
                    {handovers.map((h) => (
                      <div key={h.name} className="flex items-center justify-between gap-3">
                        <span className="text-slate-300 text-sm font-bold truncate">{h.name}</span>
                        <span className="text-primary text-sm font-black shrink-0">+{h.gained}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setConfirmArchive(false)}
                className="flex-1 h-14 rounded-2xl glass text-slate-300 font-black active:scale-95 transition-transform"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setConfirmArchive(false);
                  onArchive();
                }}
                className="flex-1 h-14 rounded-2xl bg-primary text-black font-black active:scale-95 transition-transform"
              >
                Archive
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GoalDetail;
