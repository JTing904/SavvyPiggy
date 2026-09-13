import { en } from './en';
import { zh } from './zh';

/**
 * Which language the app speaks, and the words it speaks it with.
 *
 * The dictionaries are plain objects rather than a library: `zh` is typed as
 * `Messages`, so a key added to English and not to Chinese — or a message that
 * takes a number in one and not the other — stops the build instead of
 * shipping a blank label.
 *
 * The language lives here as a module value as well as in React state, because
 * statements, exports and notifications are written outside any component and
 * still have to come out in the language the person chose.
 */

export type Lang = 'en' | 'zh';
export type Messages = typeof en;

const KEY = 'savvypiggy.language';

export interface LangChoice {
  lang: Lang;
  /** Epoch ms it was chosen, so the newer of phone and account wins. */
  at: number;
}

const readStored = (): LangChoice | null => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LangChoice>;
    return parsed.lang === 'en' || parsed.lang === 'zh' ? { lang: parsed.lang, at: Number(parsed.at) || 0 } : null;
  } catch {
    // No storage (tests, a private window): English, and ask again next time.
    return null;
  }
};

let choice: LangChoice | null = readStored();
const listeners = new Set<(lang: Lang) => void>();

const applyToDocument = (lang: Lang) => {
  if (typeof document !== 'undefined') document.documentElement.lang = lang === 'zh' ? 'zh-Hans' : 'en';
};
applyToDocument(choice?.lang ?? 'en');

/** False until someone has picked a language on this phone. */
export const hasChosenLanguage = () => choice !== null;

export const getLang = (): Lang => choice?.lang ?? 'en';

export const getChoice = () => choice;

export const setLang = (lang: Lang, at = Date.now()) => {
  const changed = lang !== getLang() || choice === null;
  choice = { lang, at };
  try {
    localStorage.setItem(KEY, JSON.stringify(choice));
  } catch {
    // Still switches for this session.
  }
  applyToDocument(lang);
  if (changed) listeners.forEach((listener) => listener(lang));
};

export const onLangChange = (listener: (lang: Lang) => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** The dictionary for the current language, for code outside React. */
export const m = (): Messages => (getLang() === 'zh' ? zh : en);

export const messagesFor = (lang: Lang): Messages => (lang === 'zh' ? zh : en);

/**
 * The locale for dates. English call sites keep the locale they always had —
 * "SEP 8" in one place, "8 Sep 2026" in another — and Chinese reads the
 * Chinese way everywhere: 9月8日.
 */
export const dateLocale = (english: 'en-US' | 'en-GB' = 'en-GB') => (getLang() === 'zh' ? 'zh-CN' : english);

/**
 * Notes the app wrote itself, in English, before the app spoke anything else.
 * A dividend credit is stored as "MAYBANK dividend"; it is read back in the
 * current language. Anything a person typed is theirs and is shown as typed.
 */
export const noteText = (note: string) => {
  const dividend = /^(.+) dividend$/.exec(note);
  return dividend ? m().common.dividendNote(dividend[1]) : note;
};
