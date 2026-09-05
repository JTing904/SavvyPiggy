import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

/**
 * Android's back gesture, as a stack. Whatever registered last is on top, so a
 * sheet closes before the screen behind it, and the app only quits once the
 * bottom of the stack — the Home tab with nothing open — says there is nowhere
 * left to go back to.
 */
const stack: (() => void)[] = [];

export const pushBackHandler = (handler: () => void) => {
  stack.push(handler);
  return () => {
    const i = stack.lastIndexOf(handler);
    if (i >= 0) stack.splice(i, 1);
  };
};

export const goBack = () => {
  const top = stack[stack.length - 1];
  if (top) top();
  else void CapacitorApp.exitApp();
};

export const exitApp = () => void CapacitorApp.exitApp();

/** Starts listening; returns a way to stop. A no-op outside the phone app. */
export const listenForBack = () => {
  if (!Capacitor.isNativePlatform()) return () => {};
  const handle = CapacitorApp.addListener('backButton', goBack);
  return () => void handle.then((h) => h.remove());
};
