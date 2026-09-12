import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

/** Turns a Firebase auth/* code into something worth showing a person. */
const friendlyError = (e: unknown) => {
  const code = (e as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email or password is incorrect.';
    case 'auth/email-already-in-use':
      return 'That email already has an account. Try signing in.';
    case 'auth/weak-password':
      return 'Password needs at least 6 characters.';
    case 'auth/invalid-email':
      return 'That email address looks wrong.';
    // The likeliest collision: an account made with Google, then signed into
    // with a password. Without this it surfaced as a raw Firebase string.
    case 'auth/account-exists-with-different-credential':
      return 'That email already signs in with Google. Use “Continue with Google”.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a few minutes and try again.';
    case 'auth/network-request-failed':
      return 'No connection. This one needs the internet.';
    case 'auth/popup-closed-by-user':
      return 'Sign-in window was closed.';
    case 'auth/operation-not-allowed':
      return 'That sign-in method is not enabled in the Firebase console yet.';
    case 'auth/unauthorized-domain':
      return 'This domain is not in the Firebase authorised domains list.';
    case 'auth/network-request-failed':
      return 'Network problem. Check your connection.';
    default:
      return (e as Error)?.message ?? 'Something went wrong.';
  }
};

const Login: React.FC = () => {
  const { signInWithGoogle, signIn, signUp, resetPassword } = useAuth();
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
      setError(friendlyError(e));
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
      setError('Type your email address first, then tap this again.');
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

  const inputClass =
    'w-full h-16 px-6 rounded-3xl bg-surface border border-white/5 text-base font-bold text-white ' +
    'focus:outline-none focus:border-primary/50 transition-all placeholder:text-slate-700 shadow-xl';

  return (
    <div className="min-h-full flex flex-col justify-center px-6 py-12 safe-pt safe-pb">
      <div className="w-full max-w-md mx-auto">
        <div className="flex flex-col items-center mb-10">
          <div className="size-20 rounded-[1.75rem] bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-2xl shadow-primary/20 mb-6">
            <span className="material-symbols-rounded text-black text-4xl font-black">savings</span>
          </div>
          <h1 className="text-white text-4xl font-black tracking-tight">SavvyPiggy</h1>
          <p className="text-slate-500 font-medium mt-2 text-center">
            {isSignUp ? 'Create an account to start saving.' : 'Welcome back. Sign in to your goals.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              placeholder="Your name"
              autoComplete="name"
            />
          )}
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="Email"
            type="email"
            autoComplete="email"
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            placeholder="Password"
            type="password"
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
          />

          {!isSignUp && (
            <button
              type="button"
              onClick={handleReset}
              disabled={busy}
              className="w-full text-right text-slate-400 text-xs font-bold active:opacity-60 disabled:opacity-40"
            >
              Forgot your password?
            </button>
          )}

          {sent && (
            <div className="flex items-start gap-3 rounded-2xl bg-primary/10 border border-primary/25 px-5 py-4">
              <span className="material-symbols-rounded text-primary text-lg">mark_email_read</span>
              <p className="text-primary/90 text-xs font-bold leading-relaxed">
                If that address has an account, a reset link is on its way. Check your spam folder too.
              </p>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-2xl bg-red-500/10 border border-red-500/20 px-5 py-4"
            >
              <span className="material-symbols-rounded text-red-400 text-lg">error</span>
              <p className="text-red-300 text-xs font-bold leading-relaxed">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit || busy}
            className={`w-full h-16 rounded-[2rem] font-black text-lg transition-all shadow-2xl ${
              canSubmit && !busy
                ? 'bg-primary text-black shadow-primary/20 active:scale-95'
                : 'bg-white/5 text-slate-700 cursor-not-allowed'
            }`}
          >
            {busy ? 'Please wait…' : isSignUp ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <div className="flex items-center gap-4 my-7">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-slate-600 text-[10px] font-black uppercase tracking-widest">or</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <div>
          <button
            onClick={() => void run(signInWithGoogle)}
            disabled={busy}
            className="w-full h-16 rounded-[2rem] glass border border-white/10 text-white font-bold flex items-center justify-center gap-3 active:scale-95 transition-transform disabled:opacity-40"
          >
            <span className="material-symbols-rounded text-primary">login</span>
            Continue with Google
          </button>
        </div>

        <p className="text-center text-slate-500 text-sm font-medium mt-8">
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            onClick={() => {
              setMode(isSignUp ? 'signin' : 'signup');
              setError(null);
            }}
            className="text-primary font-black"
          >
            {isSignUp ? 'Sign in' : 'Sign up'}
          </button>
        </p>
      </div>
    </div>
  );
};

export default Login;
