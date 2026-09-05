import React, { useState } from 'react';
import type { User } from 'firebase/auth';
import { useAuth } from '../contexts/AuthContext';
import { redeemInvite } from '../services/invites';

const RedeemInvite: React.FC<{ user: User }> = ({ user }) => {
  const { logout } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await redeemInvite(user, code);
      // The membership listener flips the app over; nothing to do here.
    } catch (err) {
      setError((err as Error).message || 'Could not redeem that code.');
      setBusy(false);
    }
  };

  return (
    <div className="min-h-full flex flex-col justify-center px-6 py-12 safe-pt safe-pb">
      <div className="w-full max-w-md mx-auto">
        <div className="flex flex-col items-center mb-10">
          <div className="size-20 rounded-[1.75rem] bg-primary/10 flex items-center justify-center mb-6">
            <span className="material-symbols-rounded text-primary text-4xl">key</span>
          </div>
          <h1 className="text-white text-3xl font-black tracking-tight text-center">Invite only</h1>
          <p className="text-slate-500 font-medium mt-2 text-center leading-relaxed">
            SavvyPiggy is not open to the public yet. Enter the invite code you were given to
            unlock your account.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className="w-full h-16 px-6 rounded-3xl bg-surface border border-white/5 text-xl font-black tracking-[0.2em] text-center text-white focus:outline-none focus:border-primary/50 transition-all placeholder:text-slate-700 placeholder:tracking-normal shadow-xl"
            placeholder="INVITE CODE"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
          />

          {error && (
            <div className="flex items-start gap-3 rounded-2xl bg-red-500/10 border border-red-500/20 px-5 py-4">
              <span className="material-symbols-rounded text-red-400 text-lg">error</span>
              <p className="text-red-300 text-xs font-bold leading-relaxed">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={!code.trim() || busy}
            className={`w-full h-16 rounded-[2rem] font-black text-lg transition-all shadow-2xl ${
              code.trim() && !busy
                ? 'bg-primary text-black shadow-primary/20 active:scale-95'
                : 'bg-white/5 text-slate-700 cursor-not-allowed'
            }`}
          >
            {busy ? 'Checking...' : 'Unlock Account'}
          </button>
        </form>

        <p className="text-center text-slate-600 text-xs font-medium mt-8 leading-relaxed">
          Signed in as <span className="text-slate-400 font-bold">{user.email ?? user.uid}</span>
          <br />
          <button onClick={() => void logout()} className="text-primary font-black mt-2">
            Sign out
          </button>
        </p>
      </div>
    </div>
  );
};

export default RedeemInvite;
