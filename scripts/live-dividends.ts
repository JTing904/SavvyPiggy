import { parseDividends, dividendCents } from '../services/dividends';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const day = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

for (const code of ['1155', '5258']) {
  const html = await (await fetch(`https://www.klsescreener.com/v2/stocks/view/${code}`, { headers: { 'User-Agent': UA } })).text();
  const rows = parseDividends(html, `${code}.KL`);
  console.log(`\n${code}.KL — ${rows.length} dividends parsed, newest 4:`);
  for (const d of rows.slice(0, 4)) {
    console.log(`  ${d.subject.padEnd(26)} ex ${day(d.exDate)}  pays ${day(d.payDate)}  RM${(d.perUnitPoints / 10000).toFixed(4)}  ->  100 units = RM${(dividendCents(100, d.perUnitPoints) / 100).toFixed(2)}`);
  }
}
