import { deleteDoc, doc, getDoc, onSnapshot, serverTimestamp, setDoc, Timestamp, writeBatch, type Unsubscribe } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db } from '../lib/firebase';
import { m } from '../i18n';
import { INVITE_TTL_MS, normalizeCode, randomInviteCode } from './inviteCodes';

export { normalizeCode };

const VALID_CODE = /^[A-Z0-9_-]{4,64}$/;

const memberRef = (uid: string) => doc(db, 'members', uid);

/**
 * Live membership.
 *
 * `null` means "not known yet", and it stays null when the answer could only
 * have come from an empty cache. That distinction is the whole point: a
 * member opening the app offline used to be told their account was
 * invite-only and asked for a code they had already burned, because a
 * cache miss and a real refusal looked identical here.
 */
export const subscribeToMembership = (
  uid: string,
  onChange: (isMember: boolean | null) => void
): Unsubscribe =>
  onSnapshot(
    memberRef(uid),
    { includeMetadataChanges: true },
    (snap) => {
      // A just-redeemed invite appears in the local cache before the server has
      // committed it. Unlocking on that optimistic echo would race the security
      // rules — every read fired in between is rejected — so wait for the ack.
      const { fromCache, hasPendingWrites } = snap.metadata;
      if (snap.exists()) {
        onChange(!hasPendingWrites);
        return;
      }
      // Absent from the server is a real answer. Absent from a cache that has
      // never spoken to the server is not an answer at all.
      onChange(fromCache ? null : false);
    },
    /*
      Only a refusal is an answer.

      This used to treat every listener error as "not a member", which is true
      of `permission-denied` and of nothing else. The realistic failure on a
      free project is `resource-exhausted` — the daily read quota, the very
      ceiling the retention system exists to stay under — with `unavailable`
      and `unauthenticated` close behind on a flaky connection or a token
      refresh. Any of them locked a paid-up member behind the invite wall and
      asked for a code they had already burned, and because the answer was
      remembered, it survived a restart.
    */
    (error) => onChange(error.code === 'permission-denied' ? false : null)
  );

/**
 * Burns an invite code and records membership in one batched write, so the
 * security rules can tie the two together with getAfter(). Either both land or
 * neither does — a code can never be spent without granting access.
 */
export const redeemInvite = async (user: User, rawCode: string) => {
  const code = normalizeCode(rawCode);
  if (!VALID_CODE.test(code)) throw new Error(m().errors.inviteInvalid);

  const inviteRef = doc(db, 'invites', code);
  const snap = await getDoc(inviteRef);

  if (!snap.exists()) throw new Error(m().errors.inviteMissing);
  if (snap.data().claimedBy) throw new Error(m().errors.inviteUsed);
  // A code minted in the app is good for ten minutes; the server checks this
  // too, this just says so in words rather than as a refused write.
  const expiresAt = snap.data().expiresAt;
  if (expiresAt && typeof expiresAt.toMillis === 'function' && expiresAt.toMillis() <= Date.now()) {
    throw new Error(m().errors.inviteExpired);
  }

  const batch = writeBatch(db);
  batch.update(inviteRef, { claimedBy: user.uid, claimedAt: Date.now() });
  batch.set(memberRef(user.uid), { code, joinedAt: Date.now() });

  try {
    await batch.commit();
  } catch {
    // Almost always a rules rejection from someone claiming it a moment earlier.
    throw new Error(m().errors.inviteJustClaimed);
  }
};

/* ------------------------------------------------------ minting (the admin) */

const LAST_KEY = 'savvypiggy.lastInvite';

const lastMinted = (): string | null => {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
};

const remember = (code: string | null) => {
  try {
    if (code) localStorage.setItem(LAST_KEY, code);
    else localStorage.removeItem(LAST_KEY);
  } catch {
    // Only used to tidy up the previous code; the expiry covers it anyway.
  }
};

/**
 * Makes a fresh code that works for ten minutes. The one made before it, if it
 * was never used, is withdrawn first, so only one is ever live.
 */
export const mintInvite = async (uid: string): Promise<{ code: string; expiresAt: number }> => {
  const previous = lastMinted();
  if (previous) {
    // It may already be used or gone; neither matters.
    await deleteDoc(doc(db, 'invites', previous)).catch(() => undefined);
  }
  const code = randomInviteCode();
  const expiresAt = Date.now() + INVITE_TTL_MS;
  await setDoc(doc(db, 'invites', code), {
    createdBy: uid,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(expiresAt),
  });
  remember(code);
  return { code, expiresAt };
};

/** Tells the admin's screen when someone has used the code. */
export const subscribeToInviteUse = (code: string, onUsed: () => void): Unsubscribe =>
  onSnapshot(
    doc(db, 'invites', code),
    (snap) => {
      if (snap.exists() && snap.data().claimedBy) onUsed();
    },
    () => undefined
  );
