import React, { useState } from 'react';
import type { User } from 'firebase/auth';
import { useAuth } from '../contexts/AuthContext';
import { redeemInvite } from '../services/invites';
import { canScanCodes, scanCode } from '../services/quickRead';
import { useT } from '../contexts/LanguageContext';
import { PiggyTile } from './PiggyMark';
import { Button } from './ui/Button';
import { Field } from './ui/Field';
import { Icon } from './ui/Icon';

const RedeemInvite: React.FC<{ user: User }> = ({ user }) => {
  const { logout } = useAuth();
  const t = useT();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const join = async (value: string) => {
    if (!value.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await redeemInvite(user, value);
      // The membership listener flips the app over; nothing to do here.
    } catch (err) {
      setError((err as Error).message || t.auth.redeemFailed);
      setBusy(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void join(code);
  };

  // Scanning fills the box and joins in one go; there is nothing left to press.
  const scan = async () => {
    if (busy) return;
    setError(null);
    try {
      const value = await scanCode();
      if (!value) return;
      setCode(value.trim().toUpperCase());
      await join(value);
    } catch {
      setError(t.invite.scanFailed);
    }
  };

  return (
    <div className="flex min-h-full flex-col justify-center px-5 py-12 safe-pt safe-pb font-figtree text-ink">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <PiggyTile size={84} />
          <h1 className="mt-5 text-[28px] font-extrabold leading-tight tracking-tight">{t.auth.inviteOnly}</h1>
          <p className="mt-2 text-[14px] font-medium leading-relaxed text-mute">{t.auth.inviteIntro}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Field
            autoFocus
            label={t.auth.inviteCode}
            value={code}
            onChange={(v) => setCode(v.toUpperCase())}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            hint={canScanCodes() ? t.invite.scanHint : undefined}
            suffix={
              canScanCodes() && (
                <button
                  type="button"
                  onClick={() => void scan()}
                  aria-label={t.invite.scan}
                  className="-mr-2 grid size-11 place-items-center rounded-[14px] bg-cta text-cta-fg active:opacity-80"
                >
                  <Icon name="scan" size={24} />
                </button>
              )
            }
          />

          {error && (
            <div role="alert" className="rounded-3xl bg-peach px-5 py-4">
              <p className="text-[13px] font-bold leading-relaxed text-neg">{error}</p>
            </div>
          )}

          <Button type="submit" disabled={!code.trim()} loading={busy}>
            {busy ? t.auth.checking : t.auth.unlockAccount}
          </Button>
        </form>

        <p className="mt-6 text-center text-[12.5px] font-medium leading-relaxed text-mute">
          {t.auth.signedInAs}
          <span className="font-bold text-ink">{user.email ?? user.uid}</span>
          <br />
          <button type="button" onClick={() => void logout()} className="mt-1 min-h-11 px-2 font-extrabold text-ink">
            {t.auth.signOut}
          </button>
        </p>
      </div>
    </div>
  );
};

export default RedeemInvite;
