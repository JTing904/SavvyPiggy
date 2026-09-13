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
    rowGone: 'This sale’s entry has been cleared from History, so its split can no longer be undone exactly.',
    insufficient: 'That goal doesn’t hold enough for this trade.',
    nothingToSplit: 'No goal is taking a share of deposits, so there is nowhere to split this.',
  },
};
