import React, { createContext, useContext, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithCredential,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  type User,
} from 'firebase/auth';
import { auth, googleProvider, isFirebaseConfigured } from '../lib/firebase';
import { m } from '../i18n';

interface AuthValue {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  /** Sends Firebase's own reset email. The only way back into an account. */
  resetPassword: (email: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(isFirebaseConfigured);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    // The Firestore profile is written later, once an invite has been
    // redeemed — the rules reject any write to users/{uid} before that.
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  const value: AuthValue = {
    user,
    loading,
    signInWithGoogle: async () => {
      // A WebView has no popup to open, so on device we run Google's native
      // sheet and hand the resulting ID token to the JS SDK.
      if (Capacitor.isNativePlatform()) {
        const { credential } = await FirebaseAuthentication.signInWithGoogle();
        if (!credential?.idToken) throw new Error(m().errors.googleCancelled);
        await signInWithCredential(auth, GoogleAuthProvider.credential(credential.idToken));
        return;
      }
      await signInWithPopup(auth, googleProvider);
    },
    signIn: async (email, password) => {
      await signInWithEmailAndPassword(auth, email, password);
    },
    resetPassword: async (email) => {
      await sendPasswordResetEmail(auth, email);
    },
    signUp: async (name, email, password) => {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      if (name) await updateProfile(cred.user, { displayName: name });
    },
    logout: async () => {
      // The native plugin keeps its own session; both have to be cleared.
      if (Capacitor.isNativePlatform()) await FirebaseAuthentication.signOut();
      await signOut(auth);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};
