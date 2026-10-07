/** Editing a goal, picking its icon, the create-goal sheet and the goal's own page. */
export const goalEdit = {
  // The goal's page
  edit: 'Edit',
  editGoal: 'Edit goal',
  shareHint: 'Change it on the Split tab',

  // The edit sheet
  editTitle: 'Edit goal',
  nameLabel: 'Goal name',
  namePlaceholder: 'e.g. New phone',
  targetLabel: 'Target amount',
  noLimit: 'No limit',
  noLimitHint: 'No finish line. Keep saving as long as you like.',
  targetMissing: 'Type a target amount, or turn on No limit.',
  countsAsFull: 'This goal will count as full, because its balance is already at or above the target.',
  iconLabel: 'Icon',
  save: 'Save',
  saving: 'Saving...',
  saved: 'Goal updated',
  couldNotSave: 'Could not save your changes.',

  // The icon picker
  iconMore: 'More',
  chooseIcon: 'Choose an icon',
  searchIcons: 'Search icons',
  searchPlaceholder: 'Search, e.g. trip, cuti, 旅行',
  noIconFound: (query: string) => `No icon matches “${query}”.`,
  iconGroup: (group: string) => `Group: ${group}`,

  // Creating a goal
  createTitle: 'New goal',
  createCta: 'Create goal',
  coverPhoto: 'Cover photo',
  photoAdd: 'Add a photo',
  photoChange: 'Change photo',
  shareOfDeposits: 'Share of deposits',
  shareOn: 'Takes a share of every deposit',
  shareOff: 'Skipped when a deposit is split',
  startsAtZero: 'New goals start with a 0% split. Set their share on the Split tab.',
  onlyGoal: 'This is your only goal, so every deposit goes into it.',
};
