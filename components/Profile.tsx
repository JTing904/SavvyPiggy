import React, { useEffect, useMemo, useState } from 'react';
import type { Activity, PiggyBank, SavingsSettings, Schedule } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useT } from '../contexts/LanguageContext';
import LanguageSheet from './LanguageSheet';
import InviteSheet from './InviteSheet';
import { isAdminUser } from '../services/inviteCodes';
import { isArchived, isFull, isInSplit, receiptCount, seedSampleBanks } from '../services/firestore';
import { summarize, type StreakRun } from '../services/analytics';
import { describe, nextOccurrence } from '../services/schedules';
import { safeGoalIcon } from '../services/goalIcons';
import { APP_VERSION } from '../services/version';
import { formatMoney } from '../services/money';
import { dateLocale } from '../i18n';
import { getThemePreference, setThemePreference, type ThemePreference } from '../hooks/useScreenLook';
import { Button } from './ui/Button';
import { Group } from './ui/Group';
import { Icon } from './ui/Icon';
import { IconTile } from './ui/IconTile';
import { PageBand } from './ui/PageBand';
import { Row } from './ui/Row';
import { Toggle } from './ui/Toggle';

/** About 80% of the free gigabyte, at roughly 150 KB a receipt. */
const RECEIPT_WARN = 5400;

interface ProfileProps {
  /** The version on this phone; empty where there is nothing to update. */
  version?: string;
  checking?: boolean;
  upToDate?: boolean | null;
  checkFailed?: boolean;
  onCheckUpdate?: () => void;
  banks: PiggyBank[];
  activities: Activity[];
  /** The current saving streak, counted by the app. */
  streak: StreakRun;
  schedules: Schedule[];
  /** How many bills are switched on. */
  liveBills: number;
  savings: SavingsSettings;
  unreadAlerts: number;
  onBack: () => void;
  onToggleOverflow: (on: boolean) => void;
  onUnarchive: (id: string) => void;
  onOpenAutoDeposits: () => void;
  onOpenStrategy: () => void;
  onOpenAlerts: () => void;
  onOpenReport: () => void;
  onOpenHoldings: () => void;
  holdingCount: number;
}

const monthYear = (d: Date) => d.toLocaleDateString(dateLocale('en-US'), { month: 'long', year: 'numeric' });
const shortDate = (d: Date) => d.toLocaleDateString(dateLocale('en-US'), { month: 'short', day: 'numeric' });

const Section: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <section className="mt-1">
    <h2 className="mb-1.5 px-1 text-[15px] font-bold">{label}</h2>
    {children}
  </section>
);

const Chevron = () => <Icon name="chev" size={18} className="text-mute" />;

const Profile: React.FC<ProfileProps> = ({
  banks,
  activities,
  streak: streakRun,
  schedules,
  liveBills,
  savings,
  unreadAlerts,
  version,
  checking = false,
  upToDate = null,
  checkFailed = false,
  onCheckUpdate,
  onBack,
  onToggleOverflow,
  onUnarchive,
  onOpenAutoDeposits,
  onOpenStrategy,
  onOpenAlerts,
  onOpenReport,
  onOpenHoldings,
  holdingCount,
}) => {
  const { user, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [showLanguage, setShowLanguage] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [theme, setTheme] = useState<ThemePreference>(getThemePreference);
  const t = useT();
  // How many receipt photos are kept (a count on the server: none is downloaded to answer it).
  const [receipts, setReceipts] = useState(0);
  useEffect(() => {
    if (user?.uid) void receiptCount(user.uid).then(setReceipts).catch(() => undefined);
  }, [user?.uid]);
  const now = new Date();

  const summary = useMemo(() => summarize(activities, banks, 'month', now), [activities, banks]); // eslint-disable-line react-hooks/exhaustive-deps
  const [seedError, setSeedError] = useState<string | null>(null);

  if (!user) return null;

  const label = user.displayName || user.email || t.profile.defaultName;
  const initial = label.charAt(0).toUpperCase();
  const joined = user.metadata.creationTime ? new Date(user.metadata.creationTime) : null;

  const active = banks.filter((b) => !isArchived(b));
  // The one put away most recently first.
  const archived = banks.filter(isArchived).sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0));
  const totalBalance = banks.reduce((sum, b) => sum + b.currentAmount, 0);
  const archivedTotal = archived.reduce((sum, b) => sum + b.currentAmount, 0);
  const withTarget = active.filter((b) => b.targetAmount > 0);
  const reached = active.filter(isFull);

  // Counted once for the whole app (see knownStreak), so the live window's start does not cut it short.
  const run = streakRun;
  const streak = run.days;

  const inSplit = active.filter(isInSplit);
  const allocated = inSplit.reduce((sum, b) => sum + b.splitPercentage, 0);

  const liveRules = schedules.filter((s) => s.enabled);
  const nextRun = liveRules
    .map((s) => nextOccurrence(s, now))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime())[0];

  const handleSeed = async () => {
    setBusy(true);
    setSeedError(null);
    try {
      await seedSampleBanks(user.uid);
    } catch (e) {
      // The button only shows on an account with no goals, so failing in
      // silence here is a dead end on the one screen offering a way forward.
      setSeedError(e instanceof Error ? e.message : t.profile.seedFailed);
    } finally {
      setBusy(false);
    }
  };

  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleDateString(dateLocale('en-US'), { month: 'short' });

  const stats = [
    {
      label: t.profile.saved,
      value: formatMoney(totalBalance, { decimals: 0 }),
      // The full sentence would be clipped in a third of a phone's width.
      hint:
        summary.change === null
          ? t.profile.thisMonth
          : t.profile.vsMonth(`${summary.change >= 0 ? '+' : ''}${summary.change}`, lastMonth),
      tone: summary.change !== null && summary.change < 0 ? 'text-mute' : 'text-pos',
    },
    {
      label: t.common.goals,
      value: String(active.length),
      hint: withTarget.length === 0 ? t.profile.noTargets : t.profile.reachedRatio(reached.length, withTarget.length),
      tone: 'text-mute',
    },
    {
      label: t.profile.streak,
      value: run.capped ? t.report.streakAtLeast(streak) : t.profile.streakValue(streak),
      hint: streak === 0 ? t.profile.startToday : t.profile.inARow,
      tone: streak > 0 ? 'text-pos' : 'text-mute',
    },
  ];

  const appearance = t.language.appearance;
  const THEMES: { value: ThemePreference; label: string }[] = [
    { value: 'light', label: appearance.light },
    { value: 'dark', label: appearance.dark },
    { value: 'system', label: appearance.system },
  ];

  const rules = liveRules.length + liveBills;

  return (
    <div className="flex min-h-full flex-col pb-24 font-figtree text-ink">
      <PageBand title={t.profile.settings} onBack={onBack} overlap={16} />

      <div className="-mt-[58px] flex flex-col gap-2.5 px-4">
        {/* Who */}
        <div className="rounded-3xl bg-card p-3.5 shadow-[0_2px_10px_rgba(20,35,58,0.1)]">
          <div className="flex items-center gap-3">
            {user.photoURL ? (
              <img src={user.photoURL} alt="" referrerPolicy="no-referrer" className="size-[52px] shrink-0 rounded-full object-cover" />
            ) : (
              <span className="grid size-[52px] shrink-0 place-items-center rounded-full bg-hero text-[18px] font-extrabold text-tblue">{initial}</span>
            )}
            <div className="min-w-0">
              <p className="truncate text-[16px] font-bold">{label}</p>
              <p className="truncate text-[12.5px] font-semibold text-mute">{user.email}</p>
              {joined && <p className="text-[12.5px] font-semibold text-pos">{t.profile.savingSince(monthYear(joined))}</p>}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {/* A third of a phone's width, so everything here wraps rather than truncating on a large system font; the figure steps down instead. */}
            {stats.map((s) => (
              <div key={s.label} className="min-w-0 rounded-2xl bg-page px-2 py-2.5 text-center">
                <p className={`truncate font-bold tabular-nums leading-tight ${s.value.length > 9 ? 'text-[min(15px,3.05vw)]' : s.value.length > 8 ? 'text-[min(15px,3.6vw)]' : 'text-[15px]'}`}>{s.value}</p>
                <p className="mt-1 text-[12px] font-semibold leading-tight text-mute">{s.label}</p>
                <p className={`mt-0.5 text-[11.5px] font-semibold leading-tight ${s.tone}`}>{s.hint}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Automatic */}
        <Section label={t.profile.automatedSavings}>
          <Group>
            <Row
              icon="repeat"
              tint="mint"
              title={
                rules === 0
                  ? t.profile.noAutoDeposits
                  : liveBills === 0 && liveRules.length === 1
                    ? describe(liveRules[0])
                    : t.profile.rulesRunning(rules)
              }
              sub={rules === 0 ? t.profile.setAside : nextRun ? t.profile.nextOn(shortDate(nextRun)) : t.profile.postsOnOpen}
              trailing={
                liveRules.length > 0 ? (
                  <span className="rounded-md bg-mint px-2 py-0.5 text-[12.5px] font-bold">{formatMoney(liveRules.reduce((sum, s) => sum + s.amount, 0))}</span>
                ) : (
                  <Chevron />
                )
              }
              tone="mute"
              onClick={onOpenAutoDeposits}
            />
            <div className="flex min-h-14 items-center gap-2.5 py-2">
              <IconTile icon="swap" tint="violet" />
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-bold">{t.profile.overflowTitle}</span>
                <span className="block text-[12.5px] font-semibold leading-snug text-mute">{t.profile.overflowHint}</span>
              </span>
              <Toggle checked={savings.overflow} onChange={onToggleOverflow} label={t.profile.overflowTitle} />
            </div>
            <Row
              icon="pie"
              tint="sun"
              title={t.profile.distributionSplit}
              sub={allocated === 100 ? t.profile.fullyAllocated : t.profile.allocatedUnassigned(allocated, 100 - allocated)}
              trailing={<Chevron />}
              tone="mute"
              onClick={onOpenStrategy}
            />
          </Group>
        </Section>

        {/* Goals: one way in; the split itself lives on its own page */}
        <Section label={t.common.goals}>
          <Group>
            <Row
              icon="target"
              tint="peach"
              title={t.profile.manageAll(active.length)}
              sub={t.profile.activeAmount(formatMoney(totalBalance - archivedTotal, { decimals: 0 }))}
              trailing={<Chevron />}
              tone="mute"
              onClick={onOpenStrategy}
            />
            {archived.length > 0 && (
              <>
                <Row
                  icon="archive"
                  tint="lav"
                  title={t.profile.archivedGoals(archived.length)}
                  sub={t.profile.putAway(formatMoney(archivedTotal, { decimals: 0 }))}
                  trailing={<Icon name="chev" size={18} className={`text-mute transition-transform ${showArchive ? 'rotate-90' : ''}`} />}
                  tone="mute"
                  onClick={() => setShowArchive((v) => !v)}
                />
                {showArchive && (
                  <div className="space-y-1 pb-2">
                    {archived.map((b) => (
                      <div key={b.id} className="flex min-w-0 items-center gap-3 py-1.5">
                        <IconTile icon={<span className="material-symbols-rounded text-[20px] leading-none">{safeGoalIcon(b.icon)}</span>} tint="plain" size={38} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-bold">{b.name}</span>
                          <span className="block truncate text-[12.5px] font-semibold text-mute">
                            {formatMoney(b.currentAmount)}
                            {b.archivedAt ? t.profile.archivedOn(shortDate(new Date(b.archivedAt))) : ''}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => onUnarchive(b.id)}
                          className="min-h-11 shrink-0 rounded-xl bg-page px-4 text-[13px] font-bold active:opacity-70"
                        >
                          {t.profile.restore}
                        </button>
                      </div>
                    ))}
                    <p className="px-1 pt-1 text-[12.5px] font-medium leading-relaxed text-mute">{t.profile.archiveNote}</p>
                  </div>
                )}
              </>
            )}
          </Group>
        </Section>

        {/* App */}
        <Section label={t.profile.app}>
          <Group>
            <Row
              icon="bell"
              tint="peach"
              title={t.profile.notificationCenter}
              sub={t.profile.notificationHint}
              trailing={
                <span className="flex items-center gap-2">
                  {unreadAlerts > 0 && <span className="size-2.5 rounded-full bg-neg" aria-label={String(unreadAlerts)} />}
                  <Chevron />
                </span>
              }
              tone="mute"
              onClick={onOpenAlerts}
            />
            <Row
              icon="trend"
              tint="mint"
              title={t.profile.investments}
              sub={holdingCount === 0 ? t.profile.investmentsEmpty : t.profile.investmentsCount(holdingCount)}
              trailing={<Chevron />}
              tone="mute"
              onClick={onOpenHoldings}
            />
            {receipts > 0 && (
              <Row
                icon="image"
                tint="lav"
                title={t.net.receiptsRow}
                sub={receipts >= RECEIPT_WARN ? t.net.receiptsNearFull : t.net.receiptsUsed(receipts, `${((receipts * 150) / 1024).toFixed(1)} MB`)}
              />
            )}
            <Row icon="doc" tint="lav" title={t.profile.statementsExports} sub={t.profile.statementsHint} trailing={<Chevron />} tone="mute" onClick={onOpenReport} />
            {isAdminUser(user) && (
              <Row
                icon="userplus"
                tint="mint"
                title={t.invite.rowTitle}
                sub={t.invite.rowSub}
                trailing={<Chevron />}
                tone="mute"
                onClick={() => setShowInvite(true)}
              />
            )}
            <Row
              icon="globe"
              tint="sun"
              title={t.language.title}
              sub={t.language.subtitle}
              trailing={
                <span className="flex items-center gap-1 text-[13px] font-bold text-mute">
                  {t.language.current}
                  <Chevron />
                </span>
              }
              tone="mute"
              onClick={() => setShowLanguage(true)}
            />
            {version && (
              <Row
                icon="dep"
                tint="lav"
                title={t.pro.update.check}
                sub={`${t.pro.update.row} ${version}`}
                trailing={<span className="text-[13px] font-bold text-mute">{checking ? t.pro.update.checking : checkFailed ? t.pro.update.couldNotCheck : upToDate ? t.pro.update.latest : <Chevron />}</span>}
                tone="mute"
                onClick={onCheckUpdate}
              />
            )}
            <Row icon="check" tint="mint" title={t.profile.synced} sub={t.profile.syncedHint} />
          </Group>
        </Section>

        {/* Light, dark, or the phone's own */}
        <Section label={appearance.title}>
          <div className="rounded-3xl bg-card p-2.5">
            <div role="tablist" aria-label={appearance.title} className="flex gap-0.5 rounded-[10px] bg-page p-0.5">
              {THEMES.map((o) => {
                const on = o.value === theme;
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => {
                      setTheme(o.value);
                      setThemePreference(o.value);
                    }}
                    className={`min-h-11 min-w-0 flex-1 whitespace-nowrap rounded-lg px-1 text-[13px] font-bold ${on ? 'bg-card text-ink' : 'text-mute'}`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 px-1.5 text-[12.5px] font-medium leading-snug text-mute">{appearance.hint}</p>
          </div>
        </Section>

        {banks.length === 0 && (
          <Button variant="ghost" loading={busy} onClick={() => void handleSeed()} className="mt-1">
            {busy ? t.profile.adding : t.profile.addSamples}
          </Button>
        )}
        {seedError && <p className="text-center text-[12.5px] font-bold text-neg">{seedError}</p>}

        <button
          type="button"
          onClick={() => void logout()}
          className="mt-1 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[14px] bg-card text-[15px] font-bold text-neg active:opacity-70"
        >
          <Icon name="logout" size={18} strokeWidth={2} />
          {t.profile.signOut}
        </button>
        <p className="mt-1 text-center text-[12.5px] font-semibold text-mute">SavvyPiggy v{APP_VERSION}</p>
      </div>

      {showLanguage && <LanguageSheet onClose={() => setShowLanguage(false)} />}
      {showInvite && <InviteSheet onClose={() => setShowInvite(false)} />}
    </div>
  );
};

export default Profile;
