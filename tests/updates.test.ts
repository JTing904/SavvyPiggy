import { isNewer, parseRelease, shouldOffer, sizeMb } from '../services/updates';
import { eq, report } from './harness';

const apk = 'https://github.com/JTing904/SavvyPiggy/releases/download/v2.1/SavvyPiggy-2.1.apk';
const release = (over: object = {}) => ({
  tag_name: 'v2.1',
  body: '## 2.1\r\n- New look\r\n* **Daily** chart\r\n\r\nSplit on arrival',
  assets: [{ name: 'SavvyPiggy-2.1.apk', browser_download_url: apk, size: 49_900_000 }],
  ...over,
});

eq('reads the version, notes, link and size', parseRelease(release()), {
  version: '2.1',
  notes: ['2.1', 'New look', 'Daily chart', 'Split on arrival'],
  apkUrl: apk,
  sizeBytes: 49_900_000,
});
eq('a draft is not a release', parseRelease(release({ draft: true })), null);
eq('a prerelease is not offered', parseRelease(release({ prerelease: true })), null);
eq('no APK, nothing to install', parseRelease(release({ assets: [{ browser_download_url: 'https://github.com/JTing904/SavvyPiggy/releases/download/v2.1/notes.txt' }] })), null);
eq('an APK from anywhere else is ignored', parseRelease(release({ assets: [{ browser_download_url: 'https://evil.example/SavvyPiggy.apk' }] })), null);
eq('another repository is ignored', parseRelease(release({ assets: [{ browser_download_url: 'https://github.com/someone/else/releases/download/v9/a.apk' }] })), null);
eq('nonsense is null', parseRelease({ message: 'rate limited' }), null);

eq('2.1 is newer than 2.0', isNewer('2.1', '2.0'), true);
eq('2.10 is newer than 2.9', isNewer('2.10', '2.9'), true);
eq('the same version is not newer', isNewer('2.0', '2.0.0'), false);
eq('an older release is not newer', isNewer('1.9', '2.0'), false);

const r = parseRelease(release());
eq('a newer version is offered', shouldOffer(r, '2.0', null), true);
eq('one the person skipped is not', shouldOffer(r, '2.0', '2.1'), false);
eq('a later one after a skip is', shouldOffer(r, '2.0', '2.0.5'), true);
eq('nothing found is not', shouldOffer(null, '2.0', null), false);
eq('sizes are not rounded up', sizeMb(49_900_000), 49);

report();
