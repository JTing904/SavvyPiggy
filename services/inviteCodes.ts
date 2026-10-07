/**
 * Invite codes minted inside the app: how they look, how long they live, and
 * who may make them. The rules in firestore.rules enforce the same three
 * things on the server; this is only the phone's side of it.
 */

/** Codes are case-insensitive to type but stored as upper-case document IDs. */
export const normalizeCode = (raw: string) => raw.trim().toUpperCase().replace(/\s+/g, '');

/** The one account that may mint invites. Must match firestore.rules. */
export const ADMIN_EMAIL = 'kengtingtan@gmail.com';

/** How long a minted code works. The rules allow a minute of clock drift on top. */
export const INVITE_TTL_MS = 10 * 60 * 1000;

/** No 0/O or 1/I, so a code read aloud or off a screen is not misheard. Exactly 32, so no byte is wasted or skewed. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** `SAVVY-XXXX-XXXX-XXXX`: twelve random characters, 60 bits. */
export const makeInviteCode = (bytes: Uint8Array): string => {
  const chars = Array.from(bytes.subarray(0, 12), (b) => ALPHABET[b & 31]);
  return `SAVVY-${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8, 12).join('')}`;
};

export const randomInviteCode = (): string => makeInviteCode(crypto.getRandomValues(new Uint8Array(12)));

/** Whether a signed-in person is the admin. The email has to be a verified one, as the rules also require. */
export const isAdminUser = (user: { email?: string | null; emailVerified?: boolean } | null | undefined): boolean =>
  !!user && user.emailVerified === true && (user.email ?? '').toLowerCase() === ADMIN_EMAIL;

/** What is left of a code's life, never below zero. */
export const msLeft = (expiresAt: number, now: number): number => Math.max(0, expiresAt - now);

/** `9:41`, rounded up so the last second still reads 0:01 rather than 0:00. */
export const formatLeft = (ms: number): string => {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

/** How much of the ten minutes remains, 0–1, for the bar. */
export const shareLeft = (ms: number): number => Math.min(1, Math.max(0, ms / INVITE_TTL_MS));
