import { doc, getDoc, onSnapshot, writeBatch, type Unsubscribe } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db } from '../lib/firebase';
import { m } from '../i18n';

/** Codes are case-insensitive to type but stored as upper-case document IDs. */
export const normalizeCode = (raw: string) => raw.trim().toUpperCase().replace(/\s+/g, '');

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
