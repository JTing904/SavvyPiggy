import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { readReceipt, type ReadLine, type ReceiptRead } from './receipt';

/**
 * The phone side of quick entry: pick or take a picture, read the text in it,
 * and take what another app shared. The recognizer lives in the Android
 * project (QuickReadPlugin) and runs on the phone with no network.
 */

/** Something to open quick entry with: a line of text, or a picture to read. `at` tells a new one from the last. */
export interface QuickDraft {
  text?: string;
  imageUri?: string;
  at: number;
}

export type Shared = { kind: 'none' } | { kind: 'image'; uri: string } | { kind: 'text'; text: string };

interface QuickReadPlugin {
  getShared(): Promise<Shared>;
  clearShared(): Promise<void>;
  pick(options: { source: 'camera' | 'gallery' }): Promise<{ uri?: string; cancelled?: boolean }>;
  recognize(options: { uri: string }): Promise<{ lines: ReadLine[] }>;
  addListener(event: 'shared', listener: (shared: Shared) => void): Promise<PluginListenerHandle>;
}

const plugin = registerPlugin<QuickReadPlugin>('QuickRead');

/** Whether this build can read pictures at all (the browser build cannot). */
export const canReadPictures = () => Capacitor.isNativePlatform();

/** Opens the camera or the photo picker; null when the person backed out. */
export const pickPicture = async (source: 'camera' | 'gallery'): Promise<string | null> => {
  const picked = await plugin.pick({ source });
  return picked.cancelled || !picked.uri ? null : picked.uri;
};

/** Reads one picture into what an entry needs. Throws when it cannot be read at all. */
export const readPicture = async (uri: string, now: Date = new Date()): Promise<ReceiptRead> => {
  const { lines } = await plugin.recognize({ uri });
  return readReceipt(lines ?? [], now);
};

/** What another app shared and has not been taken yet. */
export const takeShared = async (): Promise<Shared> => {
  if (!canReadPictures()) return { kind: 'none' };
  try {
    return await plugin.getShared();
  } catch {
    return { kind: 'none' };
  }
};

export const clearShared = () => (canReadPictures() ? plugin.clearShared().catch(() => undefined) : Promise.resolve());

/** Something shared while the app is open. Returns the way to stop listening. */
export const onShared = (listener: (shared: Shared) => void): (() => void) => {
  if (!canReadPictures()) return () => undefined;
  let handle: PluginListenerHandle | null = null;
  let stopped = false;
  void plugin.addListener('shared', listener).then((h) => {
    if (stopped) void h.remove();
    else handle = h;
  });
  return () => {
    stopped = true;
    void handle?.remove();
  };
};
