import { backupFileName, buildBackup, countDocs, plainValue } from '../services/backupFormat';
import { eq, report } from './harness';

const stamp = { toDate: () => new Date('2026-09-01T02:00:00Z') };
const bytes = { toUint8Array: () => new Uint8Array([1, 2]) };

eq('a timestamp becomes ISO text', plainValue(stamp), '2026-09-01T02:00:00.000Z');
eq('binary is left out', plainValue(bytes), null);
eq('a stored photo is left out', plainValue('data:image/jpeg;base64,AAAA'), null);
eq('ordinary text is kept', plainValue('Car'), 'Car');
eq('numbers are kept', plainValue(1231.5), 1231.5);
eq('nested values are cleaned', plainValue({ a: [{ at: stamp, n: 2 }], photo: 'data:image/png;base64,X' }), { a: [{ at: '2026-09-01T02:00:00.000Z', n: 2 }], photo: null });
eq('undefined becomes null', plainValue(undefined), null);

const backup = buildBackup({
  appVersion: '1.4',
  exportedAt: new Date('2026-10-07T14:30:00Z'),
  collections: { banks: [{ id: 'b1', data: { name: 'Car', currentAmount: 1231, imageUrl: 'data:image/jpeg;base64,ZZ' } }], activities: [] },
  settings: { savings: { retentionMonths: 12 } },
});
eq('names the app', backup.app, 'SavvyPiggy');
eq('keeps the document id beside its fields', backup.collections.banks[0], { id: 'b1', name: 'Car', currentAmount: 1231, imageUrl: null });
eq('settings are included', backup.settings.savings, { retentionMonths: 12 });
eq('counts documents across collections', countDocs(backup), 1);
eq('the time is written out', backup.exportedAt, '2026-10-07T14:30:00.000Z');

eq('file name uses the date', backupFileName('data', new Date('2026-10-07T04:00:00Z')), 'SavvyPiggy-data-2026-10-07.json');
eq('file name uses Malaysian time near midnight', backupFileName('data', new Date('2026-10-07T17:00:00Z')), 'SavvyPiggy-data-2026-10-08.json');
eq('file name carries the language word', backupFileName('数据', new Date('2026-10-07T04:00:00Z')), 'SavvyPiggy-数据-2026-10-07.json');

report();
