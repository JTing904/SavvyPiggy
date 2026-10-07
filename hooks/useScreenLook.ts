import { useEffect } from 'react';
import { registerPlugin, SystemBars, SystemBarsStyle } from '@capacitor/core';
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

/** The native side that paints the bars behind the page (see BarsPlugin.java). */
const Bars = registerPlugin<{ setColor(options: { color: string }): Promise<void> }>('Bars');

/** Whether the phone itself is in dark mode, for the 'system' choice. */
const phoneIsDark = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

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

  // The bars take the page's colour, so their icons stay readable on it.
  const dark = theme === 'dark' || (theme === 'system' && phoneIsDark());
  void Bars.setColor({ color: look === 'legacy' ? '#0A0F0D' : dark ? '#0E1311' : '#F3F5F1' }).catch(() => {});

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
  // With 'same as phone', the phone going dark or light at sunset has to repaint the bars too.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply(look);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [look]);
};
