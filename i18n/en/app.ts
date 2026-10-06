/** The app shell: splash screens, banners and the quick-action sheet. */
export const app = {
  splash: {
    syncing: 'Syncing your savings',
    startingUp: 'Starting up',
    checkingInvite: 'Checking your invite',
  },
  couldNotReach: 'Could not reach the server',
  tryAgain: 'Try again',
  comingSoon: 'Feature coming soon',
  offline: 'Offline — showing what was last synced to this phone',
  didNotSave: 'That did not save',

  quick: {
    moveMoney: 'Move money',
    recordTrade: 'Record a trade',
    deposit: 'Deposit',
    spend: 'Spend',
    buy: 'Buy',
    sell: 'Sell',
    saveHint:
      'Spending without picking a goal is recorded as spent ahead — your next deposits cover it before anything reaches your goals.',
    tradeHint:
      'Every trade keeps the day it was done. That date is what decides which dividends are yours, so enter the day you dealt, not the day you typed it in.',
  },
  toast: {
    deposited: (amount: string) => `${amount} deposited`,
    spent: (amount: string) => `${amount} spending recorded`,
    spentAhead: (amount: string) => `${amount} spent ahead`,
    movedToInvesting: (amount: string) => `${amount} moved to investing cash`,
    movedBack: (amount: string) => `${amount} moved back to your goals`,
    goalArchived: (name: string) => `${name} archived`,
    autoDepositSaved: 'Auto deposit saved',
    autoDepositOn: 'Auto deposit is on',
    autoDepositOff: 'Auto deposit is paused',
    autoDepositDeleted: 'Auto deposit deleted',
    goalCreated: 'Goal created',
    samplesAdded: 'Three sample goals added',
    entrySaved: 'Entry updated',
    entryDeleted: 'Entry deleted',
    potMoveSaved: 'Move updated',
    potMoveDeleted: 'Move deleted',
    deleteFailed: 'Could not delete that entry. It is back in the list.',
  },
};
