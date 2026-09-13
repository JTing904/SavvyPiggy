/** Signing in, redeeming an invite, and the notice shown before Firebase is set up. */
export const auth = {
  /* ----------------------------------------------------------------- Login */

  errors: {
    invalidCredentials: 'Email or password is incorrect.',
    emailInUse: 'That email already has an account. Try signing in.',
    weakPassword: 'Password needs at least 6 characters.',
    invalidEmail: 'That email address looks wrong.',
    googleAccount: 'That email already signs in with Google. Use “Continue with Google”.',
    tooManyRequests: 'Too many attempts. Wait a few minutes and try again.',
    offline: 'No connection. This one needs the internet.',
    popupClosed: 'Sign-in window was closed.',
    notEnabled: 'That sign-in method is not enabled in the Firebase console yet.',
    unauthorizedDomain: 'This domain is not in the Firebase authorised domains list.',
    networkProblem: 'Network problem. Check your connection.',
    /** Anything unmapped: Firebase's own message, when it gave one. */
    unknown: (raw: string | undefined) => raw ?? 'Something went wrong.',
  },
  typeEmailFirst: 'Type your email address first, then tap this again.',

  signUpHint: 'Create an account to start saving.',
  signInHint: 'Welcome back. Sign in to your goals.',
  yourName: 'Your name',
  email: 'Email',
  password: 'Password',
  forgotPassword: 'Forgot your password?',
  resetSent: 'If that address has an account, a reset link is on its way. Check your spam folder too.',
  pleaseWait: 'Please wait…',
  createAccount: 'Create Account',
  signIn: 'Sign In',
  or: 'or',
  continueWithGoogle: 'Continue with Google',
  haveAccount: 'Already have an account?',
  noAccount: "Don't have an account?",
  signInLink: 'Sign in',
  signUpLink: 'Sign up',

  /* --------------------------------------------------------- Redeem invite */

  redeemFailed: 'Could not redeem that code.',
  inviteOnly: 'Invite only',
  inviteIntro: 'SavvyPiggy is not open to the public yet. Enter the invite code you were given to unlock your account.',
  inviteCode: 'INVITE CODE',
  checking: 'Checking...',
  unlockAccount: 'Unlock Account',
  signedInAs: 'Signed in as ',
  signOut: 'Sign out',

  /* ---------------------------------------------------------- Setup notice */

  setupTitle: 'Firebase not configured',
  setupLead: 'Follow ',
  setupTail: ' in the project root, or the short version below.',
  setupSteps: [
    'Create a project at console.firebase.google.com',
    'Add a Web app and copy its firebaseConfig values',
    'Paste them into .env.local (see .env.local.example)',
    'Restart the dev server with npm run dev',
  ],
};
