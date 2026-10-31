/**
 * Whether GitHub has a newer release than the app on this phone. The public
 * releases API needs no key and costs no Firebase reads, and it is asked at
 * most once a day. Every failure is silent: not knowing about an update must
 * never get in the way of the app.
 */

export const LATEST_RELEASE = 'https://api.github.com/repos/JTing904/SavvyPiggy/releases/latest';
const DOWNLOADS = 'https://github.com/JTing904/SavvyPiggy/releases/download/';

export interface Release {
  /** "2.1", without the tag's "v". */
  version: string;
  notes: string[];
  apkUrl: string;
  sizeBytes: number;
}

/** The latest release, reduced to what the page shows. Null if it has no APK from this project. */
export const parseRelease = (payload: unknown): Release | null => {
  const raw = payload as { tag_name?: unknown; body?: unknown; draft?: unknown; prerelease?: unknown; assets?: { name?: unknown; browser_download_url?: unknown; size?: unknown }[] } | null;
  if (!raw || typeof raw.tag_name !== 'string' || raw.draft === true || raw.prerelease === true) return null;
  const apk = (raw.assets ?? []).find(
    (a) => typeof a.browser_download_url === 'string' && a.browser_download_url.startsWith(DOWNLOADS) && a.browser_download_url.endsWith('.apk')
  );
  if (!apk) return null;
  const notes = (typeof raw.body === 'string' ? raw.body : '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:#+|[-*•])\s*/, '').replace(/\*\*/g, '').trim())
    .filter(Boolean)
    .slice(0, 6);
  return {
    version: raw.tag_name.replace(/^v/i, ''),
    notes,
    apkUrl: apk.browser_download_url as string,
    sizeBytes: typeof apk.size === 'number' ? apk.size : 0,
  };
};

/** Compares "2.10" and "2.9" as versions, not as text. */
export const isNewer = (candidate: string, current: string) => {
  const parts = (v: string) => v.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const a = parts(candidate);
  const b = parts(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
};

/** Whether this release should open by itself: newer, and not one the person said no to. */
export const shouldOffer = (release: Release | null, current: string, skipped: string | null) =>
  !!release && isNewer(release.version, current) && release.version !== skipped;

/** Megabytes for the page, never rounded up. */
export const sizeMb = (bytes: number) => Math.floor(bytes / 1_000_000);
