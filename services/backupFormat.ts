/**
 * The shape of the "export everything" file, kept free of Firebase so it can be
 * tested on its own. Fetching lives in backup.ts.
 */

/** Anything Firestore hands back, made into plain JSON: timestamps as ISO text, photos and binary left out. */
export const plainValue = (value: unknown): unknown => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    // A goal photo kept inside its document is hundreds of KB of text.
    return value.startsWith('data:image') ? null : value;
  }
  if (typeof value !== 'object') return value;
  const v = value as { toDate?: () => Date; toUint8Array?: () => Uint8Array };
  if (typeof v.toDate === 'function') return v.toDate().toISOString();
  if (typeof v.toUint8Array === 'function') return null;
  if (Array.isArray(value)) return value.map(plainValue);
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, x]) => [k, plainValue(x)]));
};

export interface BackupInput {
  appVersion: string;
  exportedAt: Date;
  /** Collection name → its documents, each with its id. */
  collections: Record<string, Array<{ id: string; data: unknown }>>;
  /** Settings documents by name. */
  settings: Record<string, unknown>;
}

export const buildBackup = ({ appVersion, exportedAt, collections, settings }: BackupInput) => ({
  app: 'SavvyPiggy',
  appVersion,
  exportedAt: exportedAt.toISOString(),
  note: 'Amounts are in ringgit as stored. Receipt photos and goal photos are not included.',
  settings: Object.fromEntries(Object.entries(settings).map(([k, v]) => [k, plainValue(v)])),
  collections: Object.fromEntries(
    Object.entries(collections).map(([name, docs]) => [name, docs.map((d) => ({ id: d.id, ...(plainValue(d.data) as object) }))])
  ),
});

/** `SavvyPiggy-data-2026-10-07.json`, the date in Malaysian time so it matches the app's days. */
export const backupFileName = (word: string, now: Date): string => {
  const day = new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
  return `SavvyPiggy-${word}-${day}.json`;
};

export const countDocs = (backup: ReturnType<typeof buildBackup>): number =>
  Object.values(backup.collections).reduce((sum, docs) => sum + docs.length, 0);
