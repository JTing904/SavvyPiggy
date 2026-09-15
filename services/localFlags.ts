/**
 * Small per-account facts kept on the phone so an app open does not spend a
 * Firestore read re-learning them. Storage can be missing (tests, a private
 * window) or full; every helper then behaves as if nothing was remembered,
 * which only ever costs the read it was saving.
 */

export const localKey = (name: string, uid: string) => `savvypiggy.${name}.${uid}`;

export const readLocal = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

export const writeLocal = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Remembering is only a saving; the next open reads again.
  }
};
