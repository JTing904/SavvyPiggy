import { doc, getDoc, onSnapshot, writeBatch, type Unsubscribe } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db } from '../lib/firebase';

/** Codes are case-insensitive to type but stored as upper-case document IDs. */
export const normalizeCode = (raw: string) => raw.trim().toUpperCase().replace(/\s+/g, '');

const VALID_CODE = /^[A-Z0-9_-]{4,64}$/;

const memberRef = (uid: string) => doc(db, 'members', uid);

/** Live membership flag. `null` while the first read is still in flight. */
export const subscribeToMembership = (
  uid: string,
  onChange: (isMember: boolean) => void
): Unsubscribe =>
  onSnapshot(
    memberRef(uid),
    { includeMetadataChanges: true },
    (snap) => {
      // A just-redeemed invite appears in the local cache before the server has
      // committed it. Unlocking on that optimistic echo would race the security
      // rules — every read fired in between is rejected — so wait for the ack.
      onChange(snap.exists() && !snap.metadata.hasPendingWrites);
    },
    // A rules rejection here means "not a member" as far as the UI cares.
    () => onChange(false)
  );

/**
 * Burns an invite code and records membership in one batched write, so the
 * security rules can tie the two together with getAfter(). Either both land or
 * neither does — a code can never be spent without granting access.
 */
export const redeemInvite = async (user: User, rawCode: string) => {
  const code = normalizeCode(rawCode);
  if (!VALID_CODE.test(code)) throw new Error('That does not look like a valid code.');

  const inviteRef = doc(db, 'invites', code);
  const snap = await getDoc(inviteRef);

  if (!snap.exists()) throw new Error('No such invite code.');
  if (snap.data().claimedBy) throw new Error('That invite code has already been used.');

  const batch = writeBatch(db);
  batch.update(inviteRef, { claimedBy: user.uid, claimedAt: Date.now() });
  batch.set(memberRef(user.uid), { code, joinedAt: Date.now() });

  try {
    await batch.commit();
  } catch {
    // Almost always a rules rejection from someone claiming it a moment earlier.
    throw new Error('That invite code was just claimed by someone else.');
  }
};
