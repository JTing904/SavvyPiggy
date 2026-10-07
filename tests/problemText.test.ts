import { en } from '../i18n/en';
import { zh } from '../i18n/zh';
import {
  activityEditProblemText,
  bankEditProblemText,
  dateProblemText,
  dividendProblemText,
  potTransferProblemText,
  type DateProblemKind,
  type Strings,
} from '../services/problemText';
import type { ActivityEditProblem } from '../services/activityEdit';
import type { GoalEditProblem } from '../services/bankEdit';
import type { PiggyBank } from '../types';
import { eq, report } from './harness';

const banks: PiggyBank[] = [
  { id: 'a', name: 'Car', targetAmount: 0, currentAmount: 0, splitPercentage: 0, icon: 'savings', imageUrl: '', isLocked: false, autoSplit: true, createdAt: 0 },
];

const languages: [string, Strings][] = [['en', en], ['zh', zh]];

const activityKinds: ActivityEditProblem[] = [
  'notEditable', 'amountPositive', 'dateFuture', 'dateTooOld', 'goalGone', 'goalArchived', 'staleRow', 'staleDebt',
  'loanGone', 'legacyBorrow', 'borrowBelowCovered', 'dateBeforeDebt', 'unknownCategory', 'noDestination',
];
const bankKinds: GoalEditProblem[] = ['nameEmpty', 'nameTooLong', 'targetInvalid', 'iconUnknown'];
const dateKinds: DateProblemKind[] = ['future', 'beforeAllowed', 'dateFuture', 'dateTooOld'];
const potKinds = ['potShort', 'goalShort', 'needsChoice', 'noDestination', 'notPotRow', 'dateFuture', 'dateTooOld', 'goalGone', 'amountPositive'];
const dividendKinds = ['notDividend', 'notPot', 'outOfSync', 'amountPositive', 'potShort'];

const check = (label: string, texts: string[]) => {
  eq(`${label}: every kind has words`, texts.every((s) => typeof s === 'string' && s.trim().length > 0), true);
  eq(`${label}: no two kinds share a sentence`, new Set(texts).size, texts.length);
};

for (const [name, t] of languages) {
  check(`${name} activity`, activityKinds.map((kind) => activityEditProblemText({ kind, cents: 1250, goalId: 'a' }, t, banks)));
  check(`${name} bank`, bankKinds.map((kind) => bankEditProblemText(kind, t)));
  check(`${name} date`, dateKinds.map((kind) => dateProblemText(kind, t)));
  check(`${name} pot transfer`, potKinds.map((problem) => potTransferProblemText({ problem, availableCents: 500, neededCents: 900, goalId: 'a' }, t, banks)));
  check(`${name} dividend`, dividendKinds.map((problem) => dividendProblemText({ problem, availableCents: 500, neededCents: 900 }, t)));

  eq(`${name}: an archived goal is named`, activityEditProblemText({ kind: 'goalArchived', goalId: 'a' }, t, banks).includes('Car'), true);
  eq(`${name}: a goal that cannot be found still reads`, activityEditProblemText({ kind: 'goalArchived', goalId: 'zz' }, t, banks).includes(t.errors.problems.thatGoal), true);
  eq(`${name}: the covered amount is shown`, activityEditProblemText({ kind: 'borrowBelowCovered', cents: 12345 }, t).includes('RM123.45'), true);
  eq(`${name}: the pot shortfall shows both figures`, potTransferProblemText({ problem: 'potShort', availableCents: 500, neededCents: 900 }, t).includes('RM9.00'), true);
  eq(`${name}: an unknown pot problem falls back to the generic words`, potTransferProblemText({ problem: 'mystery' }, t), t.errors.recordGone);
  eq(`${name}: an unknown dividend problem falls back to the generic words`, dividendProblemText({ problem: 'mystery' }, t), t.errors.recordGone);
}

eq('the two languages differ', activityEditProblemText({ kind: 'staleRow' }, en) !== activityEditProblemText({ kind: 'staleRow' }, zh), true);
eq('dateFuture reads as asked', dateProblemText('dateFuture', zh).startsWith('不能把记录改到未来'), true);

report();
