/**
 * Reads the text found in a picture of a receipt or a payment screen (a
 * screenshot from an e-wallet, a bank app, or a paper receipt) into what an
 * entry needs. Pure: the text comes from the phone's own recognizer.
 *
 * It only fills in what it can stand behind. The amount is read from a line
 * that says what was paid ("您已支付", "Total Paid"), because a payment screen
 * also shows the basket's value and the coins or vouchers taken off it, and
 * those are not what left the wallet. A date is read only when it is written
 * out in full. Anything else is left empty for the person to fill in.
 */

/** One line of recognised text, with where it sat in the picture. */
export interface ReadLine {
  text: string;
  top: number;
  left: number;
  height: number;
}

export interface ReceiptRead {
  /** What was paid, in cents; null when the picture does not say clearly. */
  cents: number | null;
  /** Money in, not out: the amount is written with a "+" or on a "received" line. */
  income: boolean;
  /** The picture says RM0.00 was paid (points, coins or a voucher paid it all). */
  zeroPaid: boolean;
  /** Every distinct amount in the picture, in cents, in reading order. */
  candidates: number[];
  /** The day, as local midnight, when one is written out in full. */
  day: Date | null;
  /** Who was paid, when a line says so. */
  merchant: string | null;
  /** The lines the figures came from, so the screen can show where they were read. */
  evidence: { amount: string | null; date: string | null };
}

const PAID = [
  '您已支付', '已支付', '付款总额', '付款金额', '支付金额', '实付', '实际支付', '实际付款',
  'total paid', 'amount paid', 'you paid', 'paid amount', 'payment amount', 'total payment', 'amount charged',
  'jumlah dibayar', 'jumlah bayaran', 'anda telah bayar',
];
const TOTAL = ['总计', '合计', '总额', 'grand total', 'total', 'jumlah'];
const RECEIVED = ['收到', '收款', '已收', '转入', 'received', 'money in', 'diterima'];
const PAID_TO = ['付款给', '收款方', '商家', '商户', 'paid to', 'pay to', 'merchant', 'payee', 'kepada'];

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** Lines that sit on the same row of the picture, joined left to right into one row of text. */
export const groupRows = (lines: ReadLine[]): string[] => {
  const sorted = [...lines].filter((l) => l.text.trim()).sort((a, b) => a.top - b.top || a.left - b.left);
  const rows: { mid: number; height: number; parts: ReadLine[] }[] = [];
  for (const line of sorted) {
    const mid = line.top + line.height / 2;
    const row = rows[rows.length - 1];
    if (row && Math.abs(mid - row.mid) < Math.max(line.height, row.height) * 0.6) {
      row.parts.push(line);
      row.mid = (row.mid * (row.parts.length - 1) + mid) / row.parts.length;
      row.height = Math.max(row.height, line.height);
    } else {
      rows.push({ mid, height: line.height, parts: [line] });
    }
  }
  return rows.map((r) =>
    r.parts
      .sort((a, b) => a.left - b.left)
      .map((p) => p.text.trim())
      .join(' ')
  );
};

const has = (text: string, words: string[]) => {
  const t = text.toLowerCase();
  return words.some((w) => t.includes(w));
};

interface Found {
  cents: number;
  plus: boolean;
}

/** Amounts written as RM12.50 (or, where `bare`, as 12.50) in one row. */
const amountsIn = (row: string, bare: boolean): Found[] => {
  const out: Found[] = [];
  const re = bare
    ? /(\+)?\s*(?:RM|MYR)?\s*(\d{1,3}(?:,\d{3})*|\d+)\.(\d{2})(?!\d)/gi
    : /(\+)?\s*(?:RM|MYR)\s*(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{2}))?(?![\d])/gi;
  for (const m of row.matchAll(re)) {
    const whole = Number(m[2].replace(/,/g, ''));
    if (!Number.isFinite(whole) || m[2].length > 9) continue;
    out.push({ cents: whole * 100 + (m[3] ? Number(m[3]) : 0), plus: Boolean(m[1]) });
  }
  return out;
};

const midnight = (y: number, m: number, d: number) => {
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
};

const readDate = (rows: string[], now: Date): { day: Date; text: string } | null => {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const ok = (d: Date | null) => (d && d.getFullYear() >= 2000 && d.getTime() <= today.getTime() ? d : null);
  for (const row of rows) {
    let m: RegExpExecArray | null;
    // 06/10/2026 or 06-10-2026: day first, as the Malaysian wallets write it.
    if ((m = /(?<!\d)(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?!\d)/.exec(row))) {
      const d = ok(midnight(Number(m[3]), Number(m[2]), Number(m[1])));
      if (d) return { day: d, text: m[0] };
    }
    if ((m = /(?<!\d)(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})(?!\d)/.exec(row))) {
      const d = ok(midnight(Number(m[1]), Number(m[2]), Number(m[3])));
      if (d) return { day: d, text: m[0] };
    }
    if ((m = /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/.exec(row))) {
      const d = ok(midnight(Number(m[1]), Number(m[2]), Number(m[3])));
      if (d) return { day: d, text: m[0] };
    }
    if ((m = /(?<!\d)(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})(?!\d)/.exec(row))) {
      const d = ok(midnight(Number(m[3]), MONTHS[m[2].slice(0, 3).toLowerCase()] ?? 0, Number(m[1])));
      if (d) return { day: d, text: m[0] };
    }
    if ((m = /([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})(?!\d)/.exec(row))) {
      const d = ok(midnight(Number(m[3]), MONTHS[m[1].slice(0, 3).toLowerCase()] ?? 0, Number(m[2])));
      if (d) return { day: d, text: m[0] };
    }
  }
  return null;
};

const readMerchant = (rows: string[]): string | null => {
  for (let i = 0; i < rows.length; i++) {
    const lower = rows[i].toLowerCase();
    const word = PAID_TO.find((w) => lower.includes(w));
    if (!word) continue;
    const after = rows[i].slice(lower.indexOf(word) + word.length).replace(/^[\s:：-]+/, '').trim();
    const text = after || rows[i + 1]?.trim() || '';
    // A name, not a figure or a date.
    if (text && !/^[\d\s.,/:RM+-]+$/i.test(text) && text.length <= 40) return text;
  }
  return null;
};

export const readReceipt = (lines: ReadLine[], now: Date = new Date()): ReceiptRead => {
  const rows = groupRows(lines);
  const candidates: number[] = [];
  for (const row of rows) {
    for (const f of amountsIn(row, false)) if (f.cents > 0 && !candidates.includes(f.cents)) candidates.push(f.cents);
  }

  // The line that says what was paid, with the figure on it or on the line below.
  const pick = (words: string[]): { found: Found; row: string }[] => {
    const hits: { found: Found; row: string }[] = [];
    rows.forEach((row, i) => {
      if (!has(row, words)) return;
      const here = amountsIn(row, true);
      const found = here.length > 0 ? here : amountsIn(rows[i + 1] ?? '', true);
      if (found.length > 0) hits.push({ found: found[found.length - 1], row: here.length > 0 ? row : `${row} ${rows[i + 1]}` });
    });
    return hits;
  };

  const distinct = (hits: { found: Found }[]) => [...new Set(hits.map((h) => h.found.cents))];
  let chosen: { found: Found; row: string } | null = null;
  const strong = pick(PAID);
  // The first kind of line that says anything decides: if its figures disagree there is no answer, not a guess.
  const pluses = rows.flatMap((row) => amountsIn(row, false).filter((f) => f.plus).map((found) => ({ found, row })));
  for (const hits of [strong, pick(TOTAL), pick(RECEIVED), pluses]) {
    if (hits.length === 0) continue;
    if (distinct(hits).length === 1) chosen = hits[0];
    break;
  }

  const zeroPaid = strong.some((h) => h.found.cents === 0) && !chosen?.found.cents;
  const cents = chosen && chosen.found.cents > 0 ? chosen.found.cents : null;
  const income = Boolean(chosen && (chosen.found.plus || has(chosen.row, RECEIVED)));
  const date = readDate(rows, now);

  return {
    cents,
    income: cents !== null && income,
    zeroPaid,
    candidates: candidates.slice(0, 6),
    day: date?.day ?? null,
    merchant: readMerchant(rows),
    evidence: { amount: chosen ? chosen.row : null, date: date?.text ?? null },
  };
};
