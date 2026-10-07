import React from 'react';
import SavingsHome from './SavingsHome';
import InvestHome from './InvestHome';
import type { Bill, Budgets, Liability, WalletSettings, PiggyBank, Activity, Loan, Holding, Trade, SavingsSettings, InvestSettings } from '../types';
import type { IncomeChoice } from '../services/moneySheet';
import type { WalletMove } from '../services/wallet';
import type { Quotes } from '../services/holdings';
import type { Mode as NavMode } from './Navigation';
import type { QuickDraft } from '../services/quickRead';

interface DashboardProps {
  totalBalance: number;
  savingsToday: number;
  banks: PiggyBank[];
  activities: Activity[];
  loans: Loan[];
  /** The wallet: money that has arrived and is not in a goal yet. */
  wallet: WalletSettings;
  bills: Bill[];
  onRecordBill: (bill: Bill, day: string, amount: number) => void | Promise<void>;
  onSkipBill: (bill: Bill, day: string) => void | Promise<void>;
  onOpenAuto: () => void;
  budgets: Budgets;
  onOpenBudgets: () => void;
  liabilities: Liability[];
  onConfirmDebt: (debt: Liability, payment: { totalCents: number; interestCents: number; source: string }, day?: string) => void | Promise<void>;
  onSkipDebt: (debt: Liability, day: string) => void | Promise<void>;
  /** `choice` is `rule`, `split`, `wallet` or a goal's id; `at` is only given for a day other than today. */
  onDeposit: (amount: number, choice: IncomeChoice, at?: Date) => void | Promise<void>;
  /** `source` is `wallet` or a goal's id. */
  onWithdraw: (amount: number, source: string, note: string, category: string, at?: Date, extras?: { receipts?: string[] }) => void | Promise<void>;
  onMoveWallet: (amount: number, move: WalletMove) => void | Promise<void>;
  onAddGoal: () => void;
  onViewAll: () => void;
  onSelectGoal: (id: string) => void;
  onOpenProfile: () => void;
  onOpenAlerts: () => void;
  /** Which half of the app is showing. The card swiped to here sets it. */
  mode: NavMode;
  onModeChange: (mode: NavMode) => void;
  onTrade: (holding: Holding, kind: 'buy' | 'sell') => void;
  onOpenTrades: () => void;
  holdings: Holding[];
  trades: Trade[];
  /** Prices are fetched once for the whole app and handed down. */
  quotes: Quotes;
  /** Needed for the split preview to match what the deposit will really do. */
  savings: SavingsSettings;
  unreadAlerts: number;
  /** Set from the nav's round button; cleared once the sheet is open. */
  quickAction: 'deposit' | 'withdraw' | null;
  quickDraft?: QuickDraft;
  onQuickDraftHandled?: () => void;
  onQuickActionHandled: () => void;
  /** For this month's pick card; without it (or the opener) the card is not shown. */
  investSettings?: InvestSettings;
  /** Opens moving money between savings and the investment pot. */
  onPotMove?: (direction: 'in' | 'out') => void;
  onOpenMonthlyBuy?: () => void;
  /** A trade's money row opens that trade, which is the only place it is edited. */
  onOpenTrade?: (tradeId: string) => void;
  /** Any other money row on Home opens that entry. */
  onOpenEntry?: (id: string) => void;
  /** Whose remembered deposit / spend choices the sheet uses. */
  uid: string;
  /** The earliest day an entry can be dated. */
  liveFrom: Date;
}

/**
 * Home: the savings half (the wallet first) or the investing half, whichever
 * the bar is on. Each is its own screen; this only hands them what they need.
 */
const Dashboard: React.FC<DashboardProps> = (props) =>
  props.mode === 'save' ? (
    <SavingsHome
      banks={props.banks}
      activities={props.activities}
      loans={props.loans}
      wallet={props.wallet}
      bills={props.bills}
      onRecordBill={props.onRecordBill}
      onSkipBill={props.onSkipBill}
      onOpenAuto={props.onOpenAuto}
      budgets={props.budgets}
      onOpenBudgets={props.onOpenBudgets}
      liabilities={props.liabilities}
      onConfirmDebt={props.onConfirmDebt}
      onSkipDebt={props.onSkipDebt}
      savings={props.savings}
      totalBalance={props.totalBalance}
      unreadAlerts={props.unreadAlerts}
      uid={props.uid}
      liveFrom={props.liveFrom}
      mode={props.mode}
      onModeChange={props.onModeChange}
      onDeposit={props.onDeposit}
      onWithdraw={props.onWithdraw}
      onMoveWallet={props.onMoveWallet}
      onViewAll={props.onViewAll}
      onSelectGoal={props.onSelectGoal}
      onAddGoal={props.onAddGoal}
      onOpenProfile={props.onOpenProfile}
      onOpenAlerts={props.onOpenAlerts}
      onOpenEntry={props.onOpenEntry}
      onOpenTrade={props.onOpenTrade}
      quickAction={props.quickAction}
      onQuickActionHandled={props.onQuickActionHandled}
      quickDraft={props.quickDraft}
      onQuickDraftHandled={props.onQuickDraftHandled}
    />
  ) : (
    <InvestHome
      holdings={props.holdings}
      trades={props.trades}
      quotes={props.quotes}
      investSettings={props.investSettings}
      unreadAlerts={props.unreadAlerts}
      onModeChange={props.onModeChange}
      onOpenProfile={props.onOpenProfile}
      onOpenAlerts={props.onOpenAlerts}
      onOpenTrades={props.onOpenTrades}
      onTrade={props.onTrade}
      onPotMove={props.onPotMove}
      onOpenMonthlyBuy={props.onOpenMonthlyBuy}
    />
  );

export default Dashboard;
