/** Quick entry: a line of text, a picture, or something shared from another app. */
export const quick = {
  lineLabel: 'Write a line',
  linePlaceholder: 'e.g. lunch 12.50 yesterday',
  examplesLabel: 'Try writing',
  examples: ['lunch 12.50', 'grab 8', 'salary 3200', 'angpow +50'],

  /** What the line was understood as, one small block each. */
  spend: 'Spending',
  income: 'Income',
  noCategory: 'No category: filed as Other',
  fromWallet: 'From the wallet',
  fromGoal: (name: string) => `From ${name}`,
  toWallet: 'Into the wallet',
  toGoal: (name: string) => `Into ${name}`,
  today: 'Today',
  noAmount: 'No amount found',
  manyAmounts: 'More than one amount. Tap the one you mean:',
  tooOld: 'That day is before the records the app keeps, so it was left as today.',
  badDay: 'That day does not exist, so it was left as today.',

  dupTitle: 'Already recorded?',
  dupBody: (amount: string, category: string) => `There is already a ${amount} ${category} entry on this day. Record another?`,
  recordAgain: 'Record another',

  /** Reading a picture. */
  readPicture: 'Read a picture',
  fromCamera: 'Take a photo',
  fromGallery: 'Choose a picture',
  reading: 'Reading the picture…',
  readFailed: 'Could not read that picture. Try another, or write it as a line.',
  readOnPhone: 'The picture is read on this phone only and is not uploaded or kept.',
  readHeading: 'Read from the picture',
  readAmountFrom: (line: string) => `Amount from: ${line}`,
  readDateFrom: (text: string) => `Date: ${text}`,
  readMerchant: (name: string) => `Paid to: ${name}`,
  readNoAmount: 'Could not tell the amount. The picture has several figures and it is not clear which one you paid.',
  readPick: 'Figures in the picture. Tap the one you paid:',
  readZero: 'The picture says RM0.00 was paid. That can mean points, coins or a voucher paid for it. Type what you actually spent, or record RM0 on purpose.',
  readNoDate: 'No date was read, so it is left as today.',
  readOldDate: 'The date in the picture is before the records the app keeps, so it was left as today.',
  readCategory: 'The use was not read. If you pick none, it is filed as Other.',
  readEmpty: 'Nothing readable in that picture.',

  sharedIn: 'Received from another app. Check it, then record.',
};
