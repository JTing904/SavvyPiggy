import { useEffect } from 'react';
import { SystemBars, SystemBarsStyle } from '@capacitor/core';
import { lookOf, type Look, type ScreenState } from '../services/lookOf';

/**
 * Applies the look of the screen on top: screens that have not been redesigned
 * are forced dark (they only know how to be), redesigned ones follow the
 * user's choice. The choice is 'light' | 'dark' | 'system' in localStorage,
 * and index.html applies it before first paint.
 */
export type ThemePreference = 'light' | 'dark' | 'system';

const KEY = 'savvypiggy.theme';

/** Remembered in memory too, for when storage is blocked. */
let chosen: ThemePreference | null = null;

export const getThemePreference = (): ThemePreference => {
  if (chosen) return chosen;
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
};

let currentLook: Look = 'legacy';

const apply = (look: Look) => {
  currentLook = look;
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const pref = getThemePreference();
  root.dataset.look = look;

  // Legacy is dark whatever the user chose; 'system' means no attribute, so
  // the phone's own setting decides through prefers-color-scheme.
  const theme = look === 'legacy' ? 'dark' : pref;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;

  // Status and navigation bar icons: light icons on a dark screen and back.
  try {
    const style = theme === 'dark' ? SystemBarsStyle.Dark : theme === 'light' ? SystemBarsStyle.Light : SystemBarsStyle.Default;
    void SystemBars.setStyle({ style }).catch(() => {});
  } catch {
    // Not on the phone (or an old shell without the plugin): the page still works.
  }
};

export const setThemePreference = (pref: ThemePreference) => {
  chosen = pref;
  try {
    if (pref === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    // Storage blocked: the choice lasts until the page closes.
  }
  apply(currentLook);
};

export const useScreenLook = (state: ScreenState) => {
  const look = lookOf(state);
  useEffect(() => {
    apply(look);
  }, [look]);
};
