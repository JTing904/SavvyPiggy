import React, { useMemo, useState } from 'react';
import type { Activity, Loan, PiggyBank, SavingsSettings } from '../types';
import { Sheet } from './ui/Sheet';
import { Button } from './ui/Button';
import { Swatch, type ChartColor } from './ui/Charts';
import { Chip } from './ui/Chip';
import { Group } from './ui/Group';
import { Icon } from './ui/Icon';
import { PageBand } from './ui/PageBand';
import { PageSheet } from './ui/PageSheet';
import { Tile, type TileTint } from './ui/Tile';
import { EntryRow } from './history/EntryRow';
import { PlanPreview, type PreviewRow } from './history/PlanPreview';
import { AmountFigure, AmountKeys, DetailRow, GoalChips, NoteRow, WhenFields, useOnline } from './history/EntryFields';
import GoneShareSheet from './GoneShareSheet';
import ReceiptStrip from './ReceiptStrip';
import { useT } from '../contexts/LanguageContext';
import { useToast } from '../contexts/ToastContext';
import { planActivityEdit, type ActivityEdit } from '../services/activityEdit';
import { planPotTransferDelete, planPotTransferEdit, type PotReturn } from '../services/potTransfers';
import { activityEditProblemText, potTransferProblemText } from '../services/problemText';
import { goneShareCents, type GoneShareChoice } from '../services/ledger';
import { CATEGORIES, categoryOf } from '../services/categories';
import { formatMoney, fromCents, toCents } from '../services/money';
import {
  buildActivityEdit,
  buildPotEdit,
  debtPreview,
  formFromActivity,
  goalPreview,
  hasChanges,
  landedLines,
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
  'inline-flex min-h-[52px] items-center justify-center rounded-[14px] bg-card px-3 font-figtree text-[15px] font-bold text-neg active:opacity-80 disabled:opacity-40';

/** The footer both editors share: any message, then Save beside Delete. */
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
      <div className="grid grid-cols-[2fr_1fr] gap-2">
        <Button loading={busy} disabled={!canSave} onClick={onSave}>
          {t.entry.save}
        </Button>
        <button type="button" onClick={onDelete} disabled={busy} className={DELETE_BUTTON}>
          {t.entry.delete}
        </button>
      </div>
    </div>
  );
};

/** What is going on with the edit: a calm reason it cannot be saved, or what would change. */
const Outcome: React.FC<{ problem: string | null; changed: boolean; rows: PreviewRow[] }> = ({ problem, changed, rows }) => {
  const t = useT();
  if (problem) {
    return (
      <Tile tint="sun">
        <p role="status" className="text-[13.5px] font-semibold leading-snug">
          {problem}
        </p>
      </Tile>
    );
  }
  if (!changed) return <p className="text-center text-[12.5px] font-semibold text-mute">{t.entry.nothingChanged}</p>;
  if (rows.length === 0) return <p className="text-center text-[12.5px] font-semibold text-mute">{t.entry.noMoneyMoves}</p>;
  return <PlanPreview rows={rows} />;
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
  /** Which detail is being chosen, in a sheet over the page. */
  const [picking, setPicking] = useState<'category' | 'source' | 'target' | null>(null);
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
        ? (activity.wallet ?? 0) < 0
          ? t.history.undoOutgoingWallet(formatMoney(activity.amount))
          : t.history.undoOutgoing(formatMoney(activity.amount))
        : (activity.wallet ?? 0) > 0 && activity.distributions.length === 0
          ? t.history.undoIncomingWallet(formatMoney(activity.amount))
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
  const landed = landedLines(activity);
  const colorOf = (id: string) => ((Math.max(0, targets.findIndex((b) => b.id === id)) % 5) + 1) as ChartColor;

  const category = categoryOf(form.category);
  const target = form.target;
  const goesTo = !target ? t.entry.asItWas : target.mode === 'goal' ? (banks.find((b) => b.id === target.goalId)?.name ?? t.history.deletedGoal) : t.entry.byYourSplit;

  return (
    <>
    <PageSheet
      band={
        <PageBand title={t.entry.editTitle} onClose={() => !busy && onClose()}>
          <AmountFigure value={form.amount} onOpen={() => setTyping(true)} />
        </PageBand>
      }
      onClose={onClose}
      dismissible={!busy}
      footer={<EditFooter error={error} online={online} busy={busy} canSave={changed && !problem && !!plan} onSave={save} onDelete={remove} />}
    >
      {typing && <AmountKeys value={form.amount} onChange={(amount) => set({ amount })} onDone={() => setTyping(false)} />}

      <Group>
        {isWithdraw && (
          <DetailRow
            icon={<span className="material-symbols-rounded text-[20px] leading-none">{category.icon}</span>}
            tint="blue"
            round
            label={t.entry.category}
            onClick={() => setPicking('category')}
          >
            {category.label}
          </DetailRow>
        )}
        {isWithdraw &&
          ((activity.wallet ?? 0) < 0 ? (
            <DetailRow icon="wallet" tint="teal" label={t.entry.takenFrom}>
              {t.wallet.name}
            </DetailRow>
          ) : (
            <DetailRow icon="wallet" tint="teal" label={t.entry.takenFrom} onClick={() => setPicking('source')}>
              {banks.find((b) => b.id === form.source)?.name ?? t.entry.severalGoals}
            </DetailRow>
          ))}
        {isDeposit && (
          <DetailRow icon="target" tint="teal" label={t.entry.goesTo} onClick={() => setPicking('target')}>
            {goesTo}
          </DetailRow>
        )}
        <WhenFields day={form.day} time={form.time} notBefore={notBefore} onDay={(day) => set({ day })} onTime={(time) => set({ time })} />
        <NoteRow value={form.note} onChange={(note) => set({ note })} />
      </Group>

      {/* Once the amount changes these figures are out of date, and the preview below has the new ones. */}
      {isDeposit && form.target === null && edit.amount === undefined && !typing && landed.length > 0 && (
        <div className="rounded-3xl bg-card px-3.5 py-2 text-ink">
          <h2 className="flex min-h-9 items-center text-[15px] font-bold">{t.entry.landed}</h2>
          {(activity.repaid ?? 0) > 0 && <p className="text-[13px] font-bold text-info">{t.history.coveredSpentAhead(formatMoney(activity.repaid ?? 0))}</p>}
          <div className="divide-y divide-line/10">
            {landed.map((l) => (
              <div key={l.bankId ?? 'wallet'} className="flex min-h-11 items-center gap-2.5 text-[14.5px] font-bold tabular-nums">
                {l.bankId === null ? <Icon name="wallet" size={16} strokeWidth={2} className="text-tteal" /> : <Swatch color={colorOf(l.bankId)} />}
                <span className="min-w-0 flex-1 truncate">
                  {l.bankId === null ? t.wallet.name : (banks.find((b) => b.id === l.bankId)?.name ?? t.history.deletedGoal)}
                  {l.bankId !== null && activity.distributions.length > 1 && <span className="ml-1.5 text-[13px] font-semibold text-mute">{l.percentage}%</span>}
                </span>
                <span className="text-pos">+{money(l.cents)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {isWithdraw && !typing && <ReceiptStrip ownerId={activity.id} ids={activity.receipts ?? []} />}

      {!typing && <Outcome problem={problem ? activityEditProblemText(problem, t, banks) : null} changed={changed} rows={rows} />}

      <p className="px-1 text-[13px] font-medium leading-relaxed text-mute">{consequence}</p>

      {picking === 'category' && (
        <Sheet title={t.entry.category} z={60} onClose={() => setPicking(null)}>
          <div role="group" aria-label={t.entry.category} className="flex flex-wrap gap-2 pb-2">
            {CATEGORIES.map((c) => (
              <Chip
                key={c.key}
                selected={form.category === c.key}
                onClick={() => {
                  set({ category: c.key });
                  setPicking(null);
                }}
              >
                {c.label}
              </Chip>
            ))}
          </div>
        </Sheet>
      )}
      {picking === 'source' && (
        <Sheet title={t.entry.takenFrom} z={60} onClose={() => setPicking(null)}>
          {form.source === null && <p className="mb-2 text-[12.5px] font-semibold text-mute">{t.entry.severalGoals}</p>}
          <div className="pb-2">
            <GoalChips
              goals={sources}
              value={form.source}
              onChange={(source) => {
                set({ source });
                setPicking(null);
              }}
              ariaLabel={t.entry.takenFrom}
            />
          </div>
        </Sheet>
      )}
      {picking === 'target' && (
        <Sheet title={t.entry.goesTo} z={60} onClose={() => setPicking(null)}>
          <div className="pb-2">
            <GoalChips
              goals={targets}
              value={form.target?.mode === 'goal' ? form.target.goalId : null}
              onChange={(goalId) => {
                set({ target: { mode: 'goal', goalId } });
                setPicking(null);
              }}
              ariaLabel={t.entry.goesTo}
              lead={
                <>
                  <Chip
                    selected={form.target === null}
                    onClick={() => {
                      set({ target: null });
                      setPicking(null);
                    }}
                  >
                    {t.entry.asItWas}
                  </Chip>
                  <Chip
                    selected={form.target?.mode === 'split'}
                    onClick={() => {
                      set({ target: { mode: 'split' } });
                      setPicking(null);
                    }}
                  >
                    {t.entry.byYourSplit}
                  </Chip>
                </>
              }
            />
          </div>
        </Sheet>
      )}
    </PageSheet>
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
  const [pickingSource, setPickingSource] = useState(false);
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
    <PageSheet
      band={
        <PageBand title={t.entry.editPotTitle} onClose={() => !busy && onClose()}>
          <AmountFigure value={form.amount} onOpen={() => setTyping(true)} />
        </PageBand>
      }
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
      {typing && <AmountKeys value={form.amount} onChange={(amount) => set({ amount })} onDone={() => setTyping(false)} />}

      <Group>
        {toPot && (
          <DetailRow icon="wallet" tint="teal" label={t.entry.takenFrom} onClick={() => setPickingSource(true)}>
            {banks.find((b) => b.id === form.source)?.name ?? t.entry.severalGoals}
          </DetailRow>
        )}
        <WhenFields day={form.day} time={form.time} notBefore={notBefore} onDay={(day) => set({ day })} onTime={(time) => set({ time })} />
      </Group>

      {!typing && (
        <Outcome
          problem={problem ? potTransferProblemText(problem, t, banks) : null}
          changed={changed}
          rows={plan ? rowsOf(plan) : []}
        />
      )}

      <div className="space-y-1 px-1 text-[13px] font-medium leading-relaxed text-mute">
        {effects.map((line) => (
          <p key={line}>{line}</p>
        ))}
        {removalProblem && <p>{removalProblem}</p>}
      </div>

      {pickingSource && (
        <Sheet title={t.entry.takenFrom} z={60} onClose={() => setPickingSource(false)}>
          <div className="pb-2">
            <GoalChips
              goals={pickableGoals(banks, sourceOf(activity))}
              value={form.source}
              onChange={(source) => {
                set({ source });
                setPickingSource(false);
              }}
              ariaLabel={t.entry.takenFrom}
            />
          </div>
        </Sheet>
      )}
    </PageSheet>
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
        <div className="grid grid-cols-[2fr_1fr] gap-2">
          <Button onClick={onClose}>{t.ui.close}</Button>
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

/** A payment on a debt: what it did is read here, and it can only be deleted (which puts everything back). */
const LoanPaymentEntry: React.FC<EntrySheetProps> = ({ activity, banks, onDelete, onClose }) => {
  const t = useT();
  return (
    <Sheet
      title={t.net.paymentTitle(activity.note || t.net.deletedDebt)}
      onClose={onClose}
      footer={
        <div className="grid grid-cols-[2fr_1fr] gap-2">
          <Button onClick={onClose}>{t.ui.close}</Button>
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
        </div>
      }
    >
      <Group>
        <EntryRow activity={activity} banks={banks} />
      </Group>
      <p className="mb-2 mt-4 px-1 text-[13.5px] font-medium leading-relaxed text-mute">{t.net.paymentBody}</p>
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
  if (type === 'loanPayment') return <LoanPaymentEntry {...props} />;
  if (type === 'manual' || type === 'auto-save' || type === 'withdraw' || type === 'borrow') return <MoneyEntry {...props} />;
  return <LockedEntry {...props} />;
};

export default EntrySheet;
