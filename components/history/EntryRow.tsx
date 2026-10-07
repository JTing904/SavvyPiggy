import React from 'react';
import type { Activity, ActivityType, PiggyBank } from '../../types';
import { Amount } from '../ui/Amount';
import { Row, type RowTone } from '../ui/Row';
import type { TileTint } from '../ui/Tile';
import { ledgerAmount } from '../../services/export';
import { formatMoney } from '../../services/money';
import { categoryOf } from '../../services/categories';
import { signedCents, timeOf } from '../../services/entryFields';
import { useT } from '../../contexts/LanguageContext';
import { noteText } from '../../i18n';

/**
 * How each kind of record looks in the list. Green is money in, red is
 * spending, blue is money moved to or from investing, which is neither.
 * The words say the same thing the colour does.
 */
interface Look {
  icon: string;
  tint: TileTint;
  tone: RowTone;
}

export const LOOK: Record<ActivityType, Look> = {
  manual: { icon: 'dep', tint: 'mint', tone: 'pos' },
  'auto-save': { icon: 'repeat', tint: 'mint', tone: 'pos' },
  withdraw: { icon: 'out', tint: 'peach', tone: 'neg' },
  borrow: { icon: 'wallet', tint: 'sun', tone: 'neg' },
  invest: { icon: 'trend', tint: 'lav', tone: 'info' },
  divest: { icon: 'trend', tint: 'lav', tone: 'info' },
  toInvest: { icon: 'swap', tint: 'lav', tone: 'info' },
  fromInvest: { icon: 'swap', tint: 'lav', tone: 'info' },
  transfer: { icon: 'swap', tint: 'sun', tone: 'ink' },
  walletMove: { icon: 'swap', tint: 'lav', tone: 'info' },
};

export const isTrade = (a: Activity) => a.type === 'invest' || a.type === 'divest';

const ACTIVITY_LABEL: Record<ActivityType, 'autoSave' | 'manual' | 'withdraw' | 'borrow' | 'invest' | 'divest' | 'transfer' | 'toInvest' | 'fromInvest' | 'walletMove'> = {
  'auto-save': 'autoSave',
  manual: 'manual',
  withdraw: 'withdraw',
  borrow: 'borrow',
  invest: 'invest',
  divest: 'divest',
  transfer: 'transfer',
  toInvest: 'toInvest',
  fromInvest: 'fromInvest',
  walletMove: 'walletMove',
};

interface EntryRowProps {
  activity: Activity;
  banks: PiggyBank[];
  /** Absent: the row is not a button (a trade that cannot be opened from here). */
  onOpen?: () => void;
}

/** One record: what it was, a line about it, and its amount, in the colour of what it means. */
export const EntryRow: React.FC<EntryRowProps> = ({ activity, banks, onOpen }) => {
  const t = useT();
  const look = LOOK[activity.type];
  const money = (ringgit: number) => formatMoney(Math.abs(ringgit));
  const label = t.common.activity[ACTIVITY_LABEL[activity.type]];
  const nameOf = (id: string) => banks.find((b) => b.id === id)?.name ?? t.history.deletedGoal;
  const goals = activity.distributions;
  const note = activity.note ? noteText(activity.note) : '';

  let title = note || label;
  const parts: string[] = [];

  switch (activity.type) {
    case 'manual':
    case 'auto-save':
      if (goals.length === 1) parts.push(nameOf(goals[0].bankId));
      else if (goals.length > 1) parts.push(t.history.splitAcross(goals.length));
      if ((activity.repaid ?? 0) > 0) parts.push(t.history.toDebt(money(activity.repaid ?? 0)));
      if ((activity.wallet ?? 0) > 0) parts.push(t.history.toWalletPart(money(activity.wallet ?? 0)));
      break;
    case 'withdraw':
      parts.push(categoryOf(activity.category).label);
      if ((activity.wallet ?? 0) < 0) parts.push(t.history.fromWallet);
      break;
    case 'walletMove':
      if (goals.length === 1) parts.push((activity.wallet ?? 0) < 0 ? t.history.walletToGoals(nameOf(goals[0].bankId)) : t.history.goalToWallet(nameOf(goals[0].bankId)));
      else if (goals.length > 1) parts.push(t.history.walletToGoals(t.history.splitAcross(goals.length)));
      parts.push(t.history.justMoved);
      break;
    case 'toInvest':
      if (goals.length > 0) parts.push(t.history.fromGoal(nameOf(goals[0].bankId)));
      parts.push(t.history.notSpending);
      break;
    case 'fromInvest':
      parts.push(t.history.notSaving);
      break;
    case 'invest':
    case 'divest':
      if (activity.counter) title = t.history.tradeTitle(label, activity.counter);
      if (activity.units) parts.push(t.common.units(activity.units.toLocaleString('en-US')));
      if (activity.type === 'invest' && goals.length > 0) parts.push(t.history.fromGoal(nameOf(goals[0].bankId)));
      if (activity.type === 'divest') {
        if (goals.length === 1) parts.push(t.history.intoGoal(nameOf(goals[0].bankId)));
        else if (goals.length > 1) parts.push(t.history.splitAcross(goals.length));
        if ((activity.repaid ?? 0) > 0) parts.push(t.history.coveredSpentAhead(money(activity.repaid ?? 0)));
      }
      break;
    case 'transfer':
      if (activity.fromGoal) title = t.common.movedFrom(label, activity.fromGoal);
      break;
    default:
      break;
  }
  parts.push(timeOf(activity.date));

  const cents = signedCents(ledgerAmount(activity));

  return (
    <Row
      icon={look.icon}
      tint={look.tint}
      title={title}
      sub={parts.join(' · ')}
      trailing={<Amount cents={cents} size="sm" signed={activity.type !== 'walletMove'} tone={look.tone} />}
      onClick={onOpen}
    />
  );
};
