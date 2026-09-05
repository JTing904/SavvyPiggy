import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/** Base64 without blowing the call stack on multi-megabyte pages. */
export const toBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

/**
 * Hands a generated file to the user. On Android it lands in the app cache and
 * the system share sheet opens (Drive, WhatsApp, Files…); in a browser it is a
 * plain download.
 */
export const saveFile = async (name: string, mime: string, data: Uint8Array | string) => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;

  if (Capacitor.isNativePlatform()) {
    const { uri } = await Filesystem.writeFile({
      path: name,
      data: toBase64(bytes),
      directory: Directory.Cache,
    });
    await Share.share({ title: name, files: [uri] });
    return;
  }

  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};
