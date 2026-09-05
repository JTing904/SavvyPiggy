import { useEffect, useState } from 'react';
import { subscribeToMembership } from '../services/invites';

/** `null` while unknown, then true once the user has redeemed an invite code. */
export const useMembership = (uid: string | undefined) => {
  const [isMember, setIsMember] = useState<boolean | null>(null);

  useEffect(() => {
    if (!uid) {
      setIsMember(null);
      return;
    }
    setIsMember(null);
    return subscribeToMembership(uid, setIsMember);
  }, [uid]);

  return isMember;
};
