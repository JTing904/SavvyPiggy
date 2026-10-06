import type { Activity, Loan, PiggyBank } from '../types';
import { outstandingCents } from './ledger';
import type { ActivityEdit } from './activityEdit';
import { dayKey } from './analytics';
import { categoryOf } from './categories';
import { fromCents, toCents } from './money';
import { amountToCents } from './keypad';

/**
 * The edit sheet's form, and how it becomes the smallest possible edit.
 *
 * Pure, so what the sheet sends is tested without drawing it. The rule that
 * matters: only what the person actually changed goes into the edit. A
 * deposit's target in particular is never sent unless they picked one, because
 * sending "split" for a row that went to one goal would quietly re-split it.
 */

export interface EntryForm {
  /** The amount as typed on the keypad: "", "12", "12.5". */
  amount: string;
  /** "YYYY-MM-DD", local. */
  day: string;
  /** "HH:MM", local, 24-hour. */
  time: string;
  /** Withdraw / pot move: the goal the money comes out of. Null when the row drew on several goals. */
  source: string | null;
  /** Deposit: what the person picked. Null means untouched, so the row keeps its distributions. */
  target: ActivityEdit['target'] | null;
  category: string;
  note: string;
}

export interface PotEdit {
  amount?: number;
  date?: string;
  goalId?: string | null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "HH:MM" of an ISO instant, in the phone's time zone. */
export const timeOf = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** "YYYY-MM-DD" of an ISO instant, in the phone's time zone. */
export const dayOf = (iso: string) => dayKey(new Date(iso));

/** An amount as the keypad would show it typed: no trailing zeros, at most two decimals. */
export const amountText = (amount: number) => String(fromCents(toCents(amount)));

/** The one goal a row drew on, or null when it drew on none or several. */
export const sourceOf = (a: Activity): string | null => (a.distributions.length === 1 ? a.distributions[0].bankId : null);

export const formFromActivity = (a: Activity): EntryForm => ({
  amount: amountText(a.amount),
  day: dayOf(a.date),
  time: timeOf(a.date),
  source: sourceOf(a),
  target: null,
  category: categoryOf(a.category).key,
  note: a.note ?? '',
});

/** The local moment a day and a time name, seconds dropped. */
export const composeDate = (day: string, time: string): Date => {
  const [y, mo, d] = day.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return new Date(y, (mo || 1) - 1, d || 1, h || 0, mi || 0, 0, 0);
};

/** Whether the person moved the entry to another minute. Seconds never count. */
export const dateChanged = (a: Activity, form: Pick<EntryForm, 'day' | 'time'>) =>
  form.day !== dayOf(a.date) || form.time !== timeOf(a.date);

/** The edit for a deposit, spend or spend-ahead: only the fields that differ from the row. */
export const buildActivityEdit = (a: Activity, form: EntryForm): ActivityEdit => {
  const edit: ActivityEdit = {};

  const cents = amountToCents(form.amount);
  if (cents !== toCents(a.amount)) edit.amount = fromCents(cents);

  if (dateChanged(a, form)) edit.date = composeDate(form.day, form.time).toISOString();

  if (form.note.trim() !== (a.note ?? '').trim()) edit.note = form.note.trim();

  if (a.type === 'withdraw') {
    if (form.category !== categoryOf(a.category).key) edit.category = form.category;
    if (form.source !== null && form.source !== sourceOf(a)) edit.source = form.source;
  }

  if ((a.type === 'manual' || a.type === 'auto-save') && form.target) edit.target = form.target;

  return edit;
};

/** The edit for a move to or from the investment pot: its amount, its date, and (to the pot) the goal. */
export const buildPotEdit = (a: Activity, form: EntryForm): PotEdit => {
  const edit: PotEdit = {};

  const cents = amountToCents(form.amount);
  if (cents !== toCents(a.amount)) edit.amount = fromCents(cents);

  if (dateChanged(a, form)) edit.date = composeDate(form.day, form.time).toISOString();

  if (a.type === 'toInvest' && form.source !== null && form.source !== sourceOf(a)) edit.goalId = form.source;

  return edit;
};

/** Whether an edit carries anything at all. */
export const hasChanges = (edit: object) => Object.values(edit).some((v) => v !== undefined);

/** One goal's balance before and after an edit, in cents. */
export interface PreviewLine {
  id: string;
  name: string;
  beforeCents: number;
  afterCents: number;
  deltaCents: number;
}

/** A balance in whole cents, signed: toCents alone floors a negative the wrong way. */
export const signedCents = (amount: number) => (amount < 0 ? -toCents(-amount) : toCents(amount));

/**
 * The goals an edit moves money in, in the order the goals are listed, each
 * with what it holds now and what it would hold. A delta for a goal that is
 * not in `banks` is left out (the planner refuses those before they get here).
 */
export const goalPreview = (deltas: Record<string, number>, banks: PiggyBank[]): PreviewLine[] =>
  banks
    .filter((b) => (deltas[b.id] ?? 0) !== 0)
    .map((b) => {
      const beforeCents = signedCents(b.currentAmount);
      const deltaCents = deltas[b.id];
      return { id: b.id, name: b.name, beforeCents, afterCents: beforeCents + deltaCents, deltaCents };
    });

/**
 * The goals a person can pick as a source or target: the active ones, plus the
 * goal the row already uses (an archived goal a row drew on may stay).
 */
export const pickableGoals = (banks: PiggyBank[], keep: string | null): PiggyBank[] =>
  banks.filter((b) => !b.archivedAt || b.id === keep);

/** One debt's balance before and after an edit, in cents. */
export interface DebtLine {
  id: string;
  note: string;
  beforeCents: number;
  afterCents: number;
}

/**
 * The debts an edit changes. `outstanding` is what each changed loan owes
 * afterwards (the plan's `loanOutstanding`); a debt left as it was is omitted.
 */
export const debtPreview = (outstanding: Record<string, number>, loans: Loan[]): DebtLine[] =>
  loans
    .filter((l) => outstanding[l.id] !== undefined && outstanding[l.id] !== outstandingCents(l))
    .map((l) => ({ id: l.id, note: l.note, beforeCents: outstandingCents(l), afterCents: outstanding[l.id] }));
