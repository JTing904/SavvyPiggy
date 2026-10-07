import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useT } from '../contexts/LanguageContext';
import type { Messages } from '../i18n';
import { PiggyTile } from './PiggyMark';
import { Button } from './ui/Button';
import { Field } from './ui/Field';

/** Turns a Firebase auth/* code into something worth showing a person. */
const friendlyError = (e: unknown, words: Messages['auth']['errors']) => {
  const code = (e as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return words.invalidCredentials;
    case 'auth/email-already-in-use':
      return words.emailInUse;
    case 'auth/weak-password':
      return words.weakPassword;
    case 'auth/invalid-email':
      return words.invalidEmail;
    // The likeliest collision: an account made with Google, then signed into
    // with a password. Without this it surfaced as a raw Firebase string.
    case 'auth/account-exists-with-different-credential':
      return words.googleAccount;
    case 'auth/too-many-requests':
      return words.tooManyRequests;
    case 'auth/network-request-failed':
      return words.offline;
    case 'auth/popup-closed-by-user':
      return words.popupClosed;
    case 'auth/operation-not-allowed':
      return words.notEnabled;
    case 'auth/unauthorized-domain':
      return words.unauthorizedDomain;
    default:
      return words.unknown((e as Error)?.message);
  }
};

const Login: React.FC = () => {
  const { signInWithGoogle, signIn, signUp, resetPassword } = useAuth();
  const t = useT();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(friendlyError(e, t.auth.errors));
    } finally {
      setBusy(false);
    }
  };

  const isSignUp = mode === 'signup';
  const canSubmit = email.length > 0 && password.length > 0 && (!isSignUp || name.length > 0);

  /**
   * The only way back into an account. An invite code is one-time and tied to
   * one uid, so a forgotten password with no reset is not an inconvenience —
   * it is the balances gone for good.
   *
   * It reports success even for an address with no account: telling a stranger
   * which emails are registered here is not ours to give away.
   */
  const handleReset = () => {
    if (busy) return;
    if (!email.trim()) {
      setError(t.auth.typeEmailFirst);
      return;
    }
    void run(async () => {
      await resetPassword(email.trim());
      setSent(true);
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || busy) return;
    void run(() => (isSignUp ? signUp(name, email, password) : signIn(email, password)));
  };

  return (
    <div className="flex min-h-full flex-col justify-center px-5 py-12 safe-pt safe-pb font-figtree text-ink">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <PiggyTile size={84} />
          <h1 className="mt-5 text-[34px] font-extrabold leading-none tracking-[-0.035em]">SavvyPiggy</h1>
          <p className="mt-2 text-[14px] font-medium text-mute">{isSignUp ? t.auth.signUpHint : t.auth.signInHint}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {isSignUp && <Field label={t.auth.yourName} value={name} onChange={setName} autoComplete="name" />}
          <Field label={t.auth.email} value={email} onChange={setEmail} type="email" autoComplete="email" />
          <Field label={t.auth.password} value={password} onChange={setPassword} type="password" autoComplete={isSignUp ? 'new-password' : 'current-password'} />

          {!isSignUp && (
            <button
              type="button"
              onClick={handleReset}
              disabled={busy}
              className="ml-auto flex min-h-11 items-center px-1 text-[13px] font-bold text-mute active:opacity-60 disabled:opacity-40"
            >
              {t.auth.forgotPassword}
            </button>
          )}

          {sent && (
            <div role="status" className="rounded-3xl bg-mint px-5 py-4">
              <p className="text-[13px] font-bold leading-relaxed">{t.auth.resetSent}</p>
            </div>
          )}

          {error && (
            <div role="alert" className="rounded-3xl bg-peach px-5 py-4">
              <p className="text-[13px] font-bold leading-relaxed text-neg">{error}</p>
            </div>
          )}

          <Button type="submit" disabled={!canSubmit} loading={busy}>
            {busy ? t.auth.pleaseWait : isSignUp ? t.auth.createAccount : t.auth.signIn}
          </Button>
        </form>

        <div className="my-5 flex items-center gap-4">
          <div className="h-px flex-1 bg-line/10" />
          <span className="text-[12px] font-bold text-mute">{t.auth.or}</span>
          <div className="h-px flex-1 bg-line/10" />
        </div>

        <Button variant="ghost" disabled={busy} onClick={() => void run(signInWithGoogle)}>
          {t.auth.continueWithGoogle}
        </Button>

        <p className="mt-6 text-center text-[14px] font-medium text-mute">
          {isSignUp ? t.auth.haveAccount : t.auth.noAccount}{' '}
          <button
            type="button"
            onClick={() => {
              setMode(isSignUp ? 'signin' : 'signup');
              setError(null);
            }}
            className="min-h-11 px-1 font-extrabold text-ink"
          >
            {isSignUp ? t.auth.signInLink : t.auth.signUpLink}
          </button>
        </p>
      </div>
    </div>
  );
};

export default Login;
