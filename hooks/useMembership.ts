import { useEffect, useState } from 'react';
import { subscribeToMembership } from '../services/invites';

const KEY = 'savvypiggy.member';

/**
 * Whether this account has redeemed an invite. `null` while genuinely unknown.
 *
 * Offline the server cannot answer, and an unanswered question used to look
 * exactly like a refusal: a member opening the app on a train was shown the
 * invite wall and asked for a code they had already burned. So a confirmed
 * membership is remembered on the device and stood in for until the server
 * speaks again.
 *
 * This only decides what the screen shows. Every read and write is still
 * gated by the security rules, which this cannot influence — remembering a
 * `true` here grants nothing.
 */
const remembered = (uid: string) => {
  try {
    return localStorage.getItem(KEY) === uid;
  } catch {
    return false;
  }
};

const remember = (uid: string, isMember: boolean) => {
  try {
    if (isMember) localStorage.setItem(KEY, uid);
    else if (localStorage.getItem(KEY) === uid) localStorage.removeItem(KEY);
  } catch {
    // Storage can be unavailable; the app simply waits for the server instead.
  }
};

export const useMembership = (uid: string | undefined) => {
  const [isMember, setIsMember] = useState<boolean | null>(null);

  useEffect(() => {
    if (!uid) {
      setIsMember(null);
      return;
    }
    setIsMember(remembered(uid) ? true : null);

    return subscribeToMembership(uid, (answer) => {
      // Only the server's answer is worth remembering, either way.
      if (answer !== null) remember(uid, answer);
      setIsMember((current) => (answer === null ? current : answer));
    });
  }, [uid]);

  return isMember;
};
