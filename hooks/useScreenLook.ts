import { useEffect } from 'react';
import { registerPlugin, SystemBars, SystemBarsStyle, SystemBarType } from '@capacitor/core';
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
/** Whether a navy band runs under the status bar: everything but sign-in and setup. */
let currentBanded = false;

/** The native side that paints the bars behind the page (see BarsPlugin.java). */
const Bars = registerPlugin<{ setColor(options: { color: string; nav?: string }): Promise<void> }>('Bars');

/** Whether the phone itself is in dark mode, for the 'system' choice. */
const phoneIsDark = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

const apply = (look: Look, banded = currentBanded) => {
  currentLook = look;
  currentBanded = banded;
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const pref = getThemePreference();
  root.dataset.look = look;

  // Legacy is dark whatever the user chose; 'system' means no attribute, so
  // the phone's own setting decides through prefers-color-scheme.
  const theme = look === 'legacy' ? 'dark' : pref;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;

  // The status bar sits on the band, the navigation bar on the tab bar.
  const dark = theme === 'dark' || (theme === 'system' && phoneIsDark());
  const page = dark ? '#0E1622' : '#EEF1F5';
  const band = dark ? '#16233A' : '#12305C';
  const bar = dark ? '#182233' : '#FFFFFF';
  void Bars.setColor(look === 'legacy' ? { color: '#0A0F0D' } : banded ? { color: band, nav: bar } : { color: page }).catch(() => {});

  // Status and navigation bar icons: light icons on a dark ground and back.
  try {
    const style = theme === 'dark' ? SystemBarsStyle.Dark : theme === 'light' ? SystemBarsStyle.Light : SystemBarsStyle.Default;
    void SystemBars.setStyle({ style, bar: SystemBarType.NavigationBar }).catch(() => {});
    void SystemBars.setStyle({ style: banded ? SystemBarsStyle.Dark : style, bar: SystemBarType.StatusBar }).catch(() => {});
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
  const banded = !state.overlays.includes('auth');
  useEffect(() => {
    apply(look, banded);
  }, [look, banded]);
  // With 'same as phone', the phone going dark or light at sunset has to repaint the bars too.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply(look);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [look]);
};
