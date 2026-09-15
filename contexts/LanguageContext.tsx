import React, { createContext, useContext, useEffect, useState } from 'react';
import { getLang, messagesFor, onLangChange, setLang, type Lang, type Messages } from '../i18n';

/**
 * The language, as React state.
 *
 * `i18n/index.ts` owns the value so code outside components can read it; this
 * only mirrors it, so every screen re-renders the moment it changes — no
 * restart, and nothing half in one language and half in the other.
 */

interface LanguageValue {
  lang: Lang;
  t: Messages;
  setLanguage: (lang: Lang) => void;
}

const LanguageContext = createContext<LanguageValue | null>(null);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setState] = useState<Lang>(getLang);

  useEffect(() => onLangChange(setState), []);

  return (
    <LanguageContext.Provider value={{ lang, t: messagesFor(lang), setLanguage: (next) => setLang(next) }}>
      {children}
    </LanguageContext.Provider>
  );
};

const useLanguageValue = () => {
  const value = useContext(LanguageContext);
  if (!value) throw new Error('useT must be used inside a LanguageProvider.');
  return value;
};

/** The words for the current language: `const t = useT(); t.nav.home`. */
export const useT = () => useLanguageValue().t;

export const useLanguage = () => {
  const { lang, setLanguage } = useLanguageValue();
  return { lang, setLanguage };
};
