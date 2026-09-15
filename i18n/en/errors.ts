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
  enterWithdrawAmount: 'Enter an amount to withdraw.',
  enterSpendAmount: 'Enter an amount to spend.',
  editRepaidDebt: 'This one repaid a debt. Delete it and record it again instead.',
  editDeletedGoal: 'One of the goals this went into has been deleted, so it cannot be corrected.',
  editAmountPositive: 'A corrected amount has to be more than RM0.00. To take the entry back, delete it instead.',
  scheduleGoalGone: (count: number) =>
    `${count} auto deposit${count === 1 ? '' : 's'} still point${count === 1 ? 's' : ''} at a deleted or archived goal and ${count === 1 ? 'was' : 'were'} not posted. Choose another goal for ${count === 1 ? 'it' : 'them'} in Auto deposits.`,
  coveredNowhere: 'This spent ahead was already covered by a deposit, and undoing it would put that money back — but no goal takes a full share of deposits right now. Set your split to 100% first.',
  enterAmount: 'Enter an amount.',
  potShort: 'The investment pot doesn’t hold that much.',
  potFromShort: (goal: string) => `${goal} doesn’t hold that much.`,
  goneShare: 'Part of this went through a goal that has since been deleted. Choose where that part is settled.',
  recordGone: 'This record was already changed or removed on another device. Reopen the page.',
  coveringUnavailable:
    'The deposits that covered this spent ahead couldn’t be loaded — you may be offline. Nothing was deleted. Try again when you are online.',

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
    potShort: 'The investment pot doesn’t hold enough for this.',
  },
};
