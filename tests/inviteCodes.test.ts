import { ADMIN_EMAIL, formatLeft, INVITE_TTL_MS, isAdminUser, makeInviteCode, msLeft, normalizeCode, randomInviteCode, shareLeft } from '../services/inviteCodes';
import { eq, report } from './harness';

// --- the shape the rules insist on
const SHAPE = /^SAVVY-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
eq('all-zero bytes still make a well-formed code', SHAPE.test(makeInviteCode(new Uint8Array(12))), true);
eq('all-255 bytes still make a well-formed code', SHAPE.test(makeInviteCode(new Uint8Array(12).fill(255))), true);
eq('bytes map onto the alphabet', makeInviteCode(Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])), 'SAVVY-ABCD-EFGH-JKLM');
eq('high bits are ignored, so every byte value is equally likely', makeInviteCode(Uint8Array.from([32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43])), 'SAVVY-ABCD-EFGH-JKLM');

// --- no look-alike characters
let clean = true;
for (let i = 0; i < 256; i++) {
  const code = makeInviteCode(new Uint8Array(12).fill(i));
  if (/[01OI]/.test(code.slice(6))) clean = false;
}
eq('a code never contains 0, 1, O or I', clean, true);

// --- random ones are well formed and different
const seen = new Set<string>();
let allWellFormed = true;
for (let i = 0; i < 200; i++) {
  const c = randomInviteCode();
  if (!SHAPE.test(c)) allWellFormed = false;
  seen.add(c);
}
eq('random codes are well formed', allWellFormed, true);
eq('200 random codes are all different', seen.size, 200);

// --- typing it back in: case and spaces do not matter
eq('a typed code is normalised', normalizeCode(' savvy-abcd-efgh-jklm '), 'SAVVY-ABCD-EFGH-JKLM');
eq('a pasted code with line breaks is normalised', normalizeCode('SAVVY-ABCD-\nEFGH-JKLM'), 'SAVVY-ABCD-EFGH-JKLM');

// --- who may mint
eq('the admin, verified', isAdminUser({ email: ADMIN_EMAIL, emailVerified: true }), true);
eq('the admin in capitals, verified', isAdminUser({ email: 'KengTingTan@Gmail.com', emailVerified: true }), true);
eq('the admin address, unverified', isAdminUser({ email: ADMIN_EMAIL, emailVerified: false }), false);
eq('someone else, verified', isAdminUser({ email: 'friend@gmail.com', emailVerified: true }), false);
eq('no email at all', isAdminUser({ email: null, emailVerified: true }), false);
eq('signed out', isAdminUser(null), false);

// --- the countdown
eq('ten minutes reads 10:00', formatLeft(INVITE_TTL_MS), '10:00');
eq('nine minutes forty-one', formatLeft(9 * 60_000 + 41_000), '9:41');
eq('a part second rounds up', formatLeft(500), '0:01');
eq('nothing left reads 0:00', formatLeft(0), '0:00');
eq('time left is never negative', msLeft(1000, 5000), 0);
eq('time left counts down', msLeft(10_000, 4_000), 6_000);
eq('a full code fills the bar', shareLeft(INVITE_TTL_MS), 1);
eq('half the time is half the bar', shareLeft(INVITE_TTL_MS / 2), 0.5);
eq('an expired code empties the bar', shareLeft(-5), 0);

report();
