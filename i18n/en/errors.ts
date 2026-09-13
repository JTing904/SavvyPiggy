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
};
