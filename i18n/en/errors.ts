/** Errors thrown by services and shown on screen as they are, plus names the app writes for people. */
export const errors = {
  chooseImage: 'Please choose an image file.',
  imageTooLarge: 'Image must be smaller than 5 MB.',
  imageUnreadable: 'Could not read that image.',
  imageUnprocessable: 'Could not process that image.',
  imageTooDetailed: 'That image is too detailed to store. Try a smaller one.',
  canvasUnavailable: 'Canvas is not available.',

  inviteInvalid: 'That does not look like a valid code.',
  inviteMissing: 'No such invite code.',
  inviteUsed: 'That invite code has already been used.',
  inviteJustClaimed: 'That invite code was just claimed by someone else.',
  googleCancelled: 'Google sign-in was cancelled.',

  nothingToDepositInto: 'Nothing to deposit into.',
  enterWithdrawAmount: 'Enter an amount to spend.',
  enterSpendAmount: 'Enter an amount to spend.',
  editRepaidDebt: 'This one repaid a debt. Delete it and record it again instead.',
  editDeletedGoal: 'One of the goals this went into has been deleted, so it cannot be corrected.',
  editAmountPositive: 'A corrected amount has to be more than RM0.00. To take the entry back, delete it instead.',
  scheduleGoalGone: (count: number) =>
    `${count} auto deposit${count === 1 ? '' : 's'} still point${count === 1 ? 's' : ''} at a deleted or archived goal and ${count === 1 ? 'was' : 'were'} not posted. Choose another goal for ${count === 1 ? 'it' : 'them'} in Auto deposits.`,
  coveredNowhere: 'This spent ahead was already covered by a deposit, and undoing it would put that money back — but no goal takes a full share of deposits right now. Set your split to 100% first.',
  enterAmount: 'Enter an amount.',
  potShort: 'Your investing cash doesn’t hold that much.',
  potFromShort: (goal: string) => `${goal} doesn’t hold that much.`,
  goneShare: 'Part of this went through a goal that has since been deleted. Choose where that part is settled.',
  recordGone: 'This record was already changed or removed on another device. Reopen the page.',
  coveringUnavailable:
    'The deposits that covered this spent ahead couldn’t be loaded — you may be offline. Nothing was deleted. Try again when you are online.',

  potRowUseOwnUndo: 'Money moved to or from your investing cash is taken back from the Investing screen, not by deleting the entry here.',
  transferLocked: 'This entry records money moved when a goal was deleted, so it can’t be changed or deleted.',

  /** Why a correction, a move or a date was refused. Every screen shows these through services/problemText.ts. */
  problems: {
    thatGoal: 'that goal',
    activity: {
      notEditable: 'This kind of entry can’t be changed here. Delete it and record it again instead.',
      amountPositive: 'The amount has to be more than RM0.00. To take the entry back, delete it instead.',
      goalGone: 'A goal this entry used has been deleted, so it can’t be corrected. Delete it and record it again instead.',
      goalArchived: (goal: string) => `${goal} is put away and takes no new money. Pick another goal, or bring it back first.`,
      staleRow: 'This entry was changed on another device. Close it and open it again.',
      staleDebt: 'A debt this entry touches was changed on another device. Close it and open it again.',
      loanGone: 'The debt this entry created has been removed, so the entry can’t be corrected. Delete it instead.',
      legacyBorrow: 'This older borrow took money out of goals, so its amount can’t be changed. Delete it and record it again instead.',
      borrowBelowCovered: (covered: string) =>
        `${covered} of this debt has already been repaid, so the amount can’t be less than that. Enter ${covered} or more.`,
      dateBeforeDebt: 'This deposit repaid a debt that didn’t exist yet on that day. Pick a day on or after the debt, or delete the entry and record it again.',
      unknownCategory: 'That spending category doesn’t exist. Pick one from the list.',
      noDestination: 'No goal takes a share of deposits and there is no debt to repay, so this money would have nowhere to go. Set your split first.',
    },
    bank: {
      nameEmpty: 'Give the goal a name.',
      nameTooLong: (max: number) => `Keep the name to ${max} characters or fewer.`,
      targetInvalid: 'The target has to be a number, RM0 or more. Use 0 for a goal with no target.',
      iconUnknown: 'That icon isn’t available. Pick one from the list.',
    },
    date: {
      future: 'You can’t record something on a future day. Pick today or an earlier day.',
      beforeAllowed: 'That day is before the earliest day the app can record. Pick a later day.',
      dateFuture: 'You can’t move this to a future day. Pick today or an earlier day.',
      dateTooOld: 'You can’t move this to a day before the earliest day the app keeps. Pick a later day.',
    },
    potTransfer: {
      goalShort: (goal: string, available: string, needed: string) => `${goal} holds ${available}; this needs ${needed}. Move money into it first.`,
      needsChoice: 'A goal this move involved has been deleted. Choose where the money goes.',
      noDestination: 'There is no goal to put this money into.',
      notPotRow: 'This entry isn’t a move to or from your investing cash.',
      goalGone: 'A goal this move involved has been deleted, so it can’t be corrected. Delete the entry and choose where the money goes.',
      amountPositive: 'The amount has to be more than RM0.00. To take the move back, delete it instead.',
    },
    dividend: {
      notDividend: 'This entry isn’t a dividend.',
      notPot: 'This dividend wasn’t paid into your investing cash, so it can’t be corrected here.',
      outOfSync: 'This dividend no longer matches what was paid into the pot, so nothing was changed. Close it and open it again.',
      amountPositive: 'The amount received has to be more than RM0.00. To take the dividend back, remove it instead.',
    },
  },

  /** Names written into new goals, in the language chosen when they were made. */
  newGoal: 'New Goal',
  sampleGoals: {
    vacation: 'Vacation',
    emergencyFund: 'Emergency Fund',
    newTech: 'New Tech',
  },
  /** Why a trade's money could not move. The sheet usually asks instead of showing these. */
  goalRemoval: {
    needsChoice: 'This goal still holds money. Choose where it goes before deleting it.',
    noDestination: 'There is no other goal to move this money into.',
    negativeSplit: 'An overspent goal can only hand its shortfall to one goal.',
  },
  tradeMoney: {
    goalGone: 'The goal this was paid from no longer exists. Choose where the money goes back.',
    saleGoalGone: 'Part of this sale went into a goal that has since been deleted. Choose where it is taken back from.',
    rowGone: 'This sale’s entry has been cleared from History, so its split can no longer be undone exactly.',
    insufficient: 'That goal doesn’t hold enough for this trade.',
    nothingToSplit: 'No goal is taking a share of deposits, so there is nowhere to split this.',
    saleBelowFees: 'The fees are bigger than this sale. Choose the goal the difference comes out of.',
    potShort: 'Your investing cash doesn’t hold enough for this.',
  },
};
