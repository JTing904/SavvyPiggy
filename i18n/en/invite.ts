/** Inviting a friend: the admin's sheet, and scanning the code on the sign-in side. */
export const invite = {
  rowTitle: 'Invite a friend',
  rowSub: 'Make a code that works for 10 minutes',
  title: 'Invite a friend',

  idleIntro: 'One tap makes a code that works once, for 10 minutes.',
  generate: 'Make an invite code',
  replaceNote: 'Making a new one cancels the last one if it has not been used.',
  making: 'Making…',
  failed: 'Could not make a code. Check your connection and try again.',

  liveIntro: 'Ask your friend to scan this on the sign-in screen, or type the code. It works once.',
  timeLeft: (time: string) => `${time} left`,
  copy: 'Copy',
  copied: 'Copied',
  share: 'Share',
  liveNote: 'After that it stops working. Make a new one if you need it.',
  qrLabel: 'QR code for the invite',
  shareText: (code: string) => `Join me on SavvyPiggy. Invite code: ${code} (works once, for 10 minutes)`,

  expiredIntro: 'This code has expired.',
  expired: 'Expired',
  makeNew: 'Make a new invite code',

  usedIntro: 'Your friend has joined.',
  usedTitle: 'Your friend has joined SavvyPiggy',
  usedBody: 'The code has been used and will not work again.',
  makeAnother: 'Make another',

  /* -------------------------------------------------- the sign-in side */
  scan: 'Scan a QR code',
  scanHint: 'Type the code, or tap the scan icon.',
  scanFailed: 'Could not open the scanner. Type the code instead.',
};
