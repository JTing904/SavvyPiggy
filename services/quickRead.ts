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
  scanCode(): Promise<{ value?: string; cancelled?: boolean }>;
  pick(options: { source: 'camera' | 'gallery' }): Promise<{ uri?: string; cancelled?: boolean }>;
  recognize(options: { uri: string }): Promise<{ lines: ReadLine[] }>;
  compress(options: { uri: string; maxSide?: number; quality?: number; discard?: boolean }): Promise<{ image: string }>;
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

/**
 * A picture as a small JPEG (base64), for a receipt that is kept. `discard: false`
 * leaves a photo just taken in place, for the reading that comes next.
 */
export const compressPicture = async (uri: string, discard = true): Promise<string> => (await plugin.compress({ uri, discard })).image;

/** Takes or chooses a picture and returns it already compressed; null when the person backed out. */
export const pickReceipt = async (source: 'camera' | 'gallery'): Promise<string | null> => {
  const uri = await pickPicture(source);
  return uri ? compressPicture(uri) : null;
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

/** Opens the QR scanner; the text it read, or null when the person backed out. Throws when it cannot open. */
export const scanCode = async (): Promise<string | null> => {
  const result = await plugin.scanCode();
  return result.cancelled || !result.value ? null : result.value;
};

/** Whether a scanner exists here (the browser build has none). */
export const canScanCodes = () => Capacitor.isNativePlatform();
