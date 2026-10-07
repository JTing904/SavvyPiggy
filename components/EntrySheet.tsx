import React, { useMemo, useState } from 'react';
import type { Activity, Loan, PiggyBank, SavingsSettings } from '../types';
import { Sheet } from './ui/Sheet';
import { Button } from './ui/Button';
import { Chip } from './ui/Chip';
import { Field } from './ui/Field';
import { Group } from './ui/Group';
import { Tile, type TileTint } from './ui/Tile';
import { EntryRow } from './history/EntryRow';
import { PlanPreview, type PreviewRow } from './history/PlanPreview';
import { AmountField, GoalChips, SectionLabel, WhenFields, useOnline } from './history/EntryFields';
import GoneShareSheet from './GoneShareSheet';
import { useT } from '../contexts/LanguageContext';
import { useToast } from '../contexts/ToastContext';
import { planActivityEdit, type ActivityEdit } from '../services/activityEdit';
import { planPotTransferDelete, planPotTransferEdit, type PotReturn } from '../services/potTransfers';
import { activityEditProblemText, potTransferProblemText } from '../services/problemText';
import { goneShareCents, type GoneShareChoice } from '../services/ledger';
import { CATEGORIES } from '../services/categories';
import { formatMoney, fromCents, toCents } from '../services/money';
import {
  buildActivityEdit,
  buildPotEdit,
  debtPreview,
  formFromActivity,
  goalPreview,
  hasChanges,
  pickableGoals,
  sourceOf,
  type EntryForm,
  type PotEdit,
} from '../services/entryFields';

export interface EntrySheetProps {
  activity: Activity;
  /** Every goal, archived ones included. */
  banks: PiggyBank[];
  loans: Loan[];
  savings: SavingsSettings;
  /** The retention cutoff: an entry cannot be moved to a day that would be cleared at once. */
  notBefore: Date;
  /** What the investment pot holds, in cents. */
  potCents: number;
  /** What the wallet holds, in cents; below zero is an overdraft. */
  walletCents: number;
  /** Loaded History, so a deleted goal's hint can say where its money went. */
  activities?: Activity[];
  onSave: (edit: ActivityEdit) => Promise<void>;
  onSavePot: (edit: PotEdit) => Promise<void>;
  /** `takeBack` settles the share of a goal deleted since; only asked for when there is one. */
  onDelete: (takeBack?: GoneShareChoice) => void;
  onDeletePot: (returnTo?: PotReturn) => Promise<void>;
  onClose: () => void;
}

type Strings = ReturnType<typeof useT>;

const money = (cents: number) => formatMoney(fromCents(cents));

/** Why a write failed, in the person's words: no connection is said as such. */
const failure = (error: unknown, t: Strings) => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return t.entry.offline;
  return error instanceof Error && error.message ? error.message : t.entry.saveFailed;
};

const DELETE_BUTTON =
  'inline-flex min-h-12 flex-1 items-center justify-center rounded-full bg-card px-6 font-figtree text-[15.5px] font-extrabold text-neg active:opacity-80 disabled:opacity-40';

/** The footer both editors share: any message, then Delete beside Save. */
const EditFooter: React.FC<{
  error: string | null;
  online: boolean;
  busy: boolean;
  canSave: boolean;
  onSave: () => void;
  onDelete: () => void;
}> = ({ error, online, busy, canSave, onSave, onDelete }) => {
  const t = useT();
  return (
    <div className="space-y-2">
      {!online && !error && <p className="text-center text-xs font-semibold text-mute">{t.entry.offline}</p>}
      {error && (
        <p role="alert" className="text-center text-[13px] font-semibold text-neg">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={onDelete} disabled={busy} className={DELETE_BUTTON}>
          {t.entry.delete}
        </button>
        <Button full={false} loading={busy} disabled={!canSave} onClick={onSave} className="flex-[2]">
          {t.entry.save}
        </Button>
      </div>
    </div>
  );
};

/** What is going on with the edit: a calm reason it cannot be saved, or what would change. */
const Outcome: React.FC<{ problem: string | null; changed: boolean; rows: PreviewRow[] }> = ({ problem, changed, rows }) => {
  const t = useT();
  if (problem) {
    return (
      <Tile tint="sun" className="mt-5">
        <p role="status" className="text-[13.5px] font-semibold leading-snug">
          {problem}
        </p>
      </Tile>
    );
  }
  if (!changed) return <p className="mt-5 text-center text-[12.5px] font-semibold text-mute">{t.entry.nothingChanged}</p>;
  if (rows.length === 0) return <p className="mt-5 text-center text-[12.5px] font-semibold text-mute">{t.entry.noMoneyMoves}</p>;
  return (
    <div className="mt-5">
      <PlanPreview rows={rows} />
    </div>
  );
};

/* ------------------------------------------------------------ deposits, spending, spending ahead */

const MoneyEntry: React.FC<EntrySheetProps> = ({
  activity,
  banks,
  loans,
  savings,
  notBefore,
  walletCents,
  activities = [],
  onSave,
  onDelete,
  onClose,
}) => {
  const t = useT();
  const toast = useToast();
  const online = useOnline();
  const [form, setForm] = useState<EntryForm>(() => formFromActivity(activity));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settling, setSettling] = useState(false);
  /** The keypad is open: the preview waits, or every key press would shift the keys under the finger. */
  const [typing, setTyping] = useState(false);
  const set = (patch: Partial<EntryForm>) => {
    setError(null);
    setForm((f) => ({ ...f, ...patch }));
  };

  const isDeposit = activity.type === 'manual' || activity.type === 'auto-save';
  const isWithdraw = activity.type === 'withdraw';

  const edit = useMemo(() => buildActivityEdit(activity, form), [activity, form]);
  const changed = hasChanges(edit);
  const result = useMemo(
    () => (changed ? planActivityEdit({ activity, edit, banks, loans, overflow: savings.overflow, notBefore, now: new Date() }) : null),
    [activity, edit, changed, banks, loans, savings.overflow, notBefore]
  );
  const problem = result && 'problem' in result ? result.problem : null;
  const plan = result && 'plan' in result ? result.plan : null;

  const rows: PreviewRow[] = plan
    ? [
        ...goalPreview(plan.bankDeltas, banks).map((l) => ({ id: l.id, name: l.name, beforeCents: l.beforeCents, afterCents: l.afterCents })),
        ...debtPreview(plan.loanOutstanding, loans).map((l) => ({
          id: l.id,
          name: l.note ? `${t.entry.debtOwed} · ${l.note}` : t.entry.debtOwed,
          beforeCents: l.beforeCents,
          afterCents: l.afterCents,
        })),
        ...(plan.walletDelta !== 0
          ? [{ id: 'wallet', name: t.wallet.name, beforeCents: walletCents, afterCents: walletCents + plan.walletDelta }]
          : []),
      ]
    : [];

  const save = async () => {
    if (!plan || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(edit);
      toast.show({ message: t.entry.saved, tone: 'success' });
      onClose();
    } catch (e) {
      setError(failure(e, t));
    } finally {
      setBusy(false);
    }
  };

  const goneShare = goneShareCents(activity.distributions, banks) !== 0;
  const consequence =
    activity.type === 'borrow'
      ? t.history.undoBorrow
      : isWithdraw
        ? t.history.undoOutgoing(formatMoney(activity.amount))
        : t.history.undoIncoming(formatMoney(activity.amount));

  const remove = () => {
    // Part of it sits in a goal that is gone: that sheet asks where it is settled, and is the confirmation.
    if (goneShare) {
      setSettling(true);
      return;
    }
    onDelete();
    onClose();
  };

  // A spend from several goals (an older row) has no single goal to show as chosen.
  const sources = pickableGoals(banks, sourceOf(activity));
  const targets = banks.filter((b) => !b.archivedAt);
  const kept = activity.distributions
    .map((d) => `${banks.find((b) => b.id === d.bankId)?.name ?? t.history.deletedGoal}${activity.distributions.length > 1 ? ` ${d.percentage}%` : ''}`)
    .join(' · ');

  return (
    <>
    <Sheet
      title={t.entry.editTitle}
      onClose={onClose}
      dismissible={!busy}
      footer={<EditFooter error={error} online={online} busy={busy} canSave={changed && !problem && !!plan} onSave={save} onDelete={remove} />}
    >
      <AmountField value={form.amount} onChange={(amount) => set({ amount })} onOpenChange={setTyping} />
      <WhenFields day={form.day} time={form.time} notBefore={notBefore} onDay={(day) => set({ day })} onTime={(time) => set({ time })} />

      {isWithdraw && (
        <>
          <SectionLabel>{t.entry.takenFrom}</SectionLabel>
          {(activity.wallet ?? 0) < 0 ? (
            <Chip selected onClick={() => undefined}>
              {t.wallet.name}
            </Chip>
          ) : (
            <>
              {form.source === null && <p className="mb-2 text-[12.5px] font-semibold text-mute">{t.entry.severalGoals}</p>}
              <GoalChips goals={sources} value={form.source} onChange={(source) => set({ source })} ariaLabel={t.entry.takenFrom} />
            </>
          )}

          <SectionLabel>{t.entry.category}</SectionLabel>
          <div role="group" aria-label={t.entry.category} className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <Chip key={c.key} selected={form.category === c.key} onClick={() => set({ category: c.key })}>
                {c.label}
              </Chip>
            ))}
          </div>
        </>
      )}

      {isDeposit && (
        <>
          <SectionLabel>{t.entry.goesTo}</SectionLabel>
          <GoalChips
            goals={targets}
            value={form.target?.mode === 'goal' ? form.target.goalId : null}
            onChange={(goalId) => set({ target: { mode: 'goal', goalId } })}
            ariaLabel={t.entry.goesTo}
            lead={
              <>
                <Chip selected={form.target === null} onClick={() => set({ target: null })}>
                  {t.entry.asItWas}
                </Chip>
                <Chip selected={form.target?.mode === 'split'} onClick={() => set({ target: { mode: 'split' } })}>
                  {t.entry.byYourSplit}
                </Chip>
              </>
            }
          />
          {form.target === null && kept && <p className="mt-2 text-[12.5px] font-semibold text-mute">{kept}</p>}
        </>
      )}

      <div className="mt-5">
        <Field
          label={t.entry.note}
          value={form.note}
          onChange={(note) => set({ note })}
          placeholder={t.entry.notePlaceholder}
          autoComplete="off"
        />
      </div>

      {!typing && <Outcome problem={problem ? activityEditProblemText(problem, t, banks) : null} changed={changed} rows={rows} />}

      <p className="mb-2 mt-6 px-1 text-[12px] font-semibold leading-snug text-mute">{consequence}</p>

    </Sheet>
    {settling && (
      <GoneShareSheet
        distributions={activity.distributions}
        banks={banks}
        activities={activities}
        confirmLabel={t.history.remove}
        onChoose={(takeBack) => {
          onDelete(takeBack);
          setSettling(false);
          onClose();
        }}
        onClose={() => setSettling(false)}
      />
    )}
    </>
  );
};

/* ------------------------------------------------------------ moves to and from investing */

const TINTS: TileTint[] = ['mint', 'peach', 'lav', 'sun'];

const PotEntry: React.FC<EntrySheetProps> = ({ activity, banks, savings, notBefore, potCents, onSavePot, onDeletePot, onClose }) => {
  const t = useT();
  const toast = useToast();
  const online = useOnline();
  const toPot = activity.type === 'toInvest';
  const [form, setForm] = useState<EntryForm>(() => formFromActivity(activity));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Asking where the money goes, because the goal this move named is gone. */
  const [choosing, setChoosing] = useState(false);
  const [typing, setTyping] = useState(false);
  const [choice, setChoice] = useState<PotReturn>(null);
  const set = (patch: Partial<EntryForm>) => {
    setError(null);
    setForm((f) => ({ ...f, ...patch }));
  };

  const edit = useMemo(() => buildPotEdit(activity, form), [activity, form]);
  const changed = hasChanges(edit);
  const result = useMemo(
    () => (changed ? planPotTransferEdit({ activity, edit, banks, potCents, notBefore, now: new Date(), savings }) : null),
    [activity, edit, changed, banks, potCents, notBefore, savings]
  );
  const problem = result && 'problem' in result ? result : null;
  const plan = result && 'plan' in result ? result.plan : null;

  /** What a plan does to the goals and to the investing cash, as before-and-after rows. */
  const rowsOf = (p: { bankDeltas: Record<string, number>; potDelta: number }): PreviewRow[] => [
    ...goalPreview(p.bankDeltas, banks).map((l) => ({ id: l.id, name: l.name, beforeCents: l.beforeCents, afterCents: l.afterCents })),
    ...(p.potDelta !== 0 ? [{ id: 'pot', name: t.entry.investingCash, beforeCents: potCents, afterCents: potCents + p.potDelta }] : []),
  ];

  const run = async (work: () => Promise<void>, done?: () => void) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await work();
      done?.();
      onClose();
    } catch (e) {
      setError(failure(e, t));
    } finally {
      setBusy(false);
    }
  };

  const save = () => plan && run(() => onSavePot(edit), () => toast.show({ message: t.entry.saved, tone: 'success' }));

  // Deleting reverses the move in full; the planner says what that does, or that it needs a goal named.
  const removal = useMemo(
    () => planPotTransferDelete({ activity, banks, potCents, savings, returnTo: choosing ? choice : null }),
    [activity, banks, potCents, savings, choosing, choice]
  );
  const removalPlan = 'plan' in removal ? removal.plan : null;
  const needsChoice = 'problem' in removal && removal.problem === 'needsChoice';
  const removalProblem = 'problem' in removal && !needsChoice ? potTransferProblemText(removal, t, banks) : null;
  const amount = money(toCents(activity.amount));

  const remove = () => {
    if (needsChoice) {
      setChoosing(true);
      return;
    }
    if (removalPlan) void run(() => onDeletePot());
  };

  if (choosing) {
    const goals = banks.filter((b) => !b.archivedAt);
    const picked = (c: PotReturn) => !!choice && !!c && (c.mode === 'split' ? choice.mode === 'split' : choice.mode === 'goal' && choice.goalId === c.goalId);
    return (
      <Sheet
        title={toPot ? t.entry.chooseBackTitle : t.entry.chooseTakeTitle}
        onClose={() => setChoosing(false)}
        dismissible={!busy}
        footer={
          <div className="space-y-2">
            {error && (
              <p role="alert" className="text-center text-[13px] font-semibold text-neg">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <Button full={false} variant="ghost" disabled={busy} onClick={() => setChoosing(false)} className="flex-1">
                {t.common.cancel}
              </Button>
              <Button
                full={false}
                variant="danger"
                loading={busy}
                disabled={!choice || !removalPlan}
                onClick={() => void run(() => onDeletePot(choice))}
                className="flex-[2]"
              >
                {t.entry.delete}
              </Button>
            </div>
          </div>
        }
      >
        <p className="mb-3 text-[13.5px] font-medium leading-snug text-mute">
          {toPot ? t.entry.chooseBackBody(amount) : t.entry.chooseTakeBody(amount)}
        </p>
        <div className="space-y-2">
          {goals.map((g, i) => (
            <Tile key={g.id} tint={TINTS[i % TINTS.length]} selected={picked({ mode: 'goal', goalId: g.id })} onClick={() => setChoice({ mode: 'goal', goalId: g.id })}>
              <span className="block pr-8 text-[14.5px] font-bold">{g.name}</span>
              <span className="block text-[12px] font-semibold text-mute">{money(Math.max(0, toCents(g.currentAmount)))}</span>
            </Tile>
          ))}
          <Tile tint="lav" selected={picked({ mode: 'split' })} onClick={() => setChoice({ mode: 'split' })}>
            <span className="block pr-8 text-[14.5px] font-bold">{t.entry.splitOption}</span>
            <span className="block text-[12px] font-semibold text-mute">{toPot ? t.entry.splitOptionSub : t.entry.takeSplitSub}</span>
          </Tile>
        </div>
        {!choice && <p className="mt-4 text-center text-[12.5px] font-semibold text-mute">{t.entry.chooseFirst}</p>}
        {choice && removalProblem && (
          <Tile tint="sun" className="mt-4">
            <p role="status" className="text-[13.5px] font-semibold leading-snug">
              {removalProblem}
            </p>
          </Tile>
        )}
        {choice && removalPlan && (
          <div className="mt-4">
            <PlanPreview rows={rowsOf(removalPlan)} />
          </div>
        )}
      </Sheet>
    );
  }

  // The sentence that says what deleting does, said before it is done.
  const effects = removalPlan
    ? [
        ...goalPreview(removalPlan.bankDeltas, banks).map((l) =>
          l.deltaCents > 0 ? t.entry.potGoesBack(money(l.deltaCents), l.name) : t.entry.potTakenFrom(money(-l.deltaCents), l.name)
        ),
        ...(removalPlan.potDelta < 0
          ? [t.entry.potLeaves(money(-removalPlan.potDelta))]
          : removalPlan.potDelta > 0
            ? [t.entry.potReturns(money(removalPlan.potDelta))]
            : []),
      ]
    : [];

  return (
    <Sheet
      title={t.entry.editPotTitle}
      onClose={onClose}
      dismissible={!busy}
      footer={
        <EditFooter
          error={error}
          online={online}
          busy={busy}
          canSave={changed && !problem && !!plan}
          onSave={save}
          onDelete={remove}
        />
      }
    >
      <AmountField value={form.amount} onChange={(amount) => set({ amount })} onOpenChange={setTyping} />
      <WhenFields day={form.day} time={form.time} notBefore={notBefore} onDay={(day) => set({ day })} onTime={(time) => set({ time })} />

      {toPot && (
        <>
          <SectionLabel>{t.entry.takenFrom}</SectionLabel>
          <GoalChips
            goals={pickableGoals(banks, sourceOf(activity))}
            value={form.source}
            onChange={(source) => set({ source })}
            ariaLabel={t.entry.takenFrom}
          />
        </>
      )}

      {!typing && (
        <Outcome
          problem={problem ? potTransferProblemText(problem, t, banks) : null}
          changed={changed}
          rows={plan ? rowsOf(plan) : []}
        />
      )}

      <div className="mb-2 mt-6 space-y-1 px-1 text-[12px] font-semibold leading-snug text-mute">
        {effects.map((line) => (
          <p key={line}>{line}</p>
        ))}
        {removalProblem && <p>{removalProblem}</p>}
      </div>
    </Sheet>
  );
};

/* ------------------------------------------------------------ rows that cannot be changed here */

const LockedEntry: React.FC<EntrySheetProps> = ({ activity, banks, onClose }) => {
  const t = useT();
  const transfer = activity.type === 'transfer';
  return (
    <Sheet
      title={transfer ? t.entry.transferTitle : t.common.activity[activity.type === 'invest' ? 'invest' : 'divest']}
      onClose={onClose}
      footer={<Button onClick={onClose}>{t.ui.close}</Button>}
    >
      <Group>
        <EntryRow activity={activity} banks={banks} />
      </Group>
      <p className="mb-2 mt-4 px-1 text-[13.5px] font-medium leading-relaxed text-mute">
        {transfer ? (activity.fromGoal ? t.entry.transferBody(activity.fromGoal) : t.entry.transferBodyNoName) : t.entry.tradeBody}
      </p>
    </Sheet>
  );
};

/** A move between the wallet and the goals: it can be read, or deleted, which puts the money back where it was. */
const WalletMoveEntry: React.FC<EntrySheetProps> = ({ activity, banks, onDelete, onClose }) => {
  const t = useT();
  return (
    <Sheet
      title={t.common.activity.walletMove}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              onDelete();
              onClose();
            }}
            className={DELETE_BUTTON}
          >
            {t.entry.delete}
          </button>
          <Button full={false} onClick={onClose} className="flex-[2]">
            {t.ui.close}
          </Button>
        </div>
      }
    >
      <Group>
        <EntryRow activity={activity} banks={banks} />
      </Group>
      <p className="mb-2 mt-4 px-1 text-[13.5px] font-medium leading-relaxed text-mute">{t.entry.walletMoveBody}</p>
    </Sheet>
  );
};

/**
 * Opens from a History row (and later from Home and a goal's own list): change
 * an entry, see exactly what the change would do before saving it, or delete it.
 * A deposit, a spend and a spend-ahead share one editor; a move to or from the
 * investing cash has its own, because it changes goals and the pot together;
 * money handed on from a deleted goal can only be read.
 */
const EntrySheet: React.FC<EntrySheetProps> = (props) => {
  const { type } = props.activity;
  if (type === 'toInvest' || type === 'fromInvest') return <PotEntry {...props} />;
  if (type === 'walletMove') return <WalletMoveEntry {...props} />;
  if (type === 'manual' || type === 'auto-save' || type === 'withdraw' || type === 'borrow') return <MoneyEntry {...props} />;
  return <LockedEntry {...props} />;
};

export default EntrySheet;
