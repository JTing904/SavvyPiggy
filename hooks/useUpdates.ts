import { useCallback, useEffect, useRef, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { getJson } from '../services/quotes';
import { LATEST_RELEASE, parseRelease, shouldOffer, isNewer, type Release } from '../services/updates';

interface UpdaterPlugin {
  canInstall(): Promise<{ allowed: boolean }>;
  openInstallSettings(): Promise<void>;
  install(options: { url: string }): Promise<void>;
  addListener(event: 'progress', listener: (p: { percent: number; done: number; total: number }) => void): Promise<PluginListenerHandle>;
}
const Updater = registerPlugin<UpdaterPlugin>('Updater');

const CHECKED_KEY = 'savvypiggy.update.checked';
const SKIPPED_KEY = 'savvypiggy.update.skipped';
const DAY_MS = 86_400_000;

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked: it is only asked again.
  }
};

export type UpdateState =
  | { step: 'idle' }
  | { step: 'needsPermission' }
  | { step: 'downloading'; percent: number; doneBytes: number; totalBytes: number }
  | { step: 'failed' };

/**
 * New versions from GitHub: asked once a day when the app opens, or whenever
 * the person taps the row. `offer` opens the page; it only opens by itself for
 * a version nobody has said no to.
 */
export const useUpdates = () => {
  const [current, setCurrent] = useState('');
  const [release, setRelease] = useState<Release | null>(null);
  const [offer, setOffer] = useState(false);
  const [state, setState] = useState<UpdateState>({ step: 'idle' });
  const [checking, setChecking] = useState(false);
  /** The result of a check the person asked for: null until one finishes. */
  const [upToDate, setUpToDate] = useState<boolean | null>(null);
  /** A check the person asked for could not reach an answer. */
  const [checkFailed, setCheckFailed] = useState(false);
  const installed = useRef('');
  const installing = useRef(false);

  const check = useCallback(async (asked: boolean) => {
    if (!Capacitor.isNativePlatform() || !installed.current) return;
    setChecking(true);
    const payload = await getJson(LATEST_RELEASE, {});
    setChecking(false);
    const latest = payload ? parseRelease(payload) : null;
    // A release still waiting for its APK is no answer: asked again next time.
    if (latest) write(CHECKED_KEY, String(Date.now()));
    setRelease(latest);
    if (asked) {
      const newer = !!latest && isNewer(latest.version, installed.current);
      setUpToDate(latest ? !newer : null);
      setCheckFailed(!latest);
      if (newer) setOffer(true);
    } else if (shouldOffer(latest, installed.current, read(SKIPPED_KEY))) {
      setOffer(true);
    }
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    void CapacitorApp.getInfo().then((info) => {
      installed.current = info.version;
      setCurrent(info.version);
      const last = Number(read(CHECKED_KEY) ?? 0);
      if (Date.now() - last > DAY_MS) void check(false);
    });
    const listening = Updater.addListener('progress', (p) => setState({ step: 'downloading', percent: p.percent, doneBytes: p.done, totalBytes: p.total }));
    return () => {
      void listening.then((handle) => handle.remove());
    };
  }, [check]);

  const install = useCallback(async () => {
    // Asking Android takes a moment: a second tap in it must not start a second download.
    if (!release || installing.current) return;
    installing.current = true;
    try {
      const { allowed } = await Updater.canInstall();
      if (!allowed) {
        setState({ step: 'needsPermission' });
        // Should Android end the app while it is being allowed, the page comes back on the next start.
        write(CHECKED_KEY, '0');
        await Updater.openInstallSettings();
        return;
      }
      setState({ step: 'downloading', percent: 0, doneBytes: 0, totalBytes: release.sizeBytes });
      await Updater.install({ url: release.apkUrl });
      setState({ step: 'idle' });
    } catch {
      setState({ step: 'failed' });
    } finally {
      installing.current = false;
    }
  }, [release]);

  const skip = useCallback(() => {
    if (release) write(SKIPPED_KEY, release.version);
    setOffer(false);
  }, [release]);

  return { current, release, offer, state, checking, upToDate, checkFailed, check: () => check(true), install, skip, close: () => setOffer(false) };
};
