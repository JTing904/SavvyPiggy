import type { Activity, PiggyBank } from '../types';
import type { Summary } from './analytics';
import { A4, buildImagePdf, type PdfPage } from './pdf';

/**
 * Draws the statement onto A4-shaped canvases with the browser's own text
 * rendering, then packs them into a PDF. Layout is a single downward cursor
 * that starts a new page whenever the next block would not fit.
 */

const SCALE = 2; // canvas pixels per PDF point: crisp on screen, ~200 KB a page
const W = Math.round(A4.width * SCALE);
const H = Math.round(A4.height * SCALE);
const MARGIN = 48 * SCALE;
const FOOTER = 40 * SCALE;
const FONT = '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Sans CJK SC", sans-serif';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e2e8f0';
const GREEN = '#15803d';
const RED = '#b91c1c';
const PANEL = '#f1f5f9';

const TYPE_LABEL: Record<Activity['type'], string> = {
  'auto-save': 'Scheduled deposit',
  manual: 'Deposit',
  withdraw: 'Withdrawal',
  borrow: 'Borrowed',
};

const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toFixed(2)}`;
const signed = (n: number) => `${n < 0 ? '-' : '+'}$${Math.abs(n).toFixed(2)}`;
const pad = (n: number) => String(n).padStart(2, '0');
const dateTime = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

type Align = 'left' | 'right';

interface Column {
  title: string;
  width: number;
  align?: Align;
}

class Doc {
  pages: HTMLCanvasElement[] = [];
  ctx!: CanvasRenderingContext2D;
  y = 0;

  constructor() {
    this.newPage();
  }

  newPage() {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = 'alphabetic';
    this.pages.push(canvas);
    this.ctx = ctx;
    this.y = MARGIN;
  }

  /** Starts a new page unless `height` more pixels still fit on this one. */
  ensure(height: number) {
    if (this.y + height > H - FOOTER - MARGIN / 2) this.newPage();
  }

  font(size: number, weight: 400 | 600 | 800 = 400) {
    this.ctx.font = `${weight} ${size * SCALE}px ${FONT}`;
  }

  text(s: string, x: number, y: number, color = INK, align: Align = 'left') {
    this.ctx.fillStyle = color;
    this.ctx.textAlign = align;
    this.ctx.fillText(s, x, y);
  }

  /** Greedy word wrap; CJK has no spaces, so it also breaks inside long words. */
  wrap(s: string, maxWidth: number): string[] {
    const lines: string[] = [];
    let line = '';
    const push = () => {
      if (line) lines.push(line);
      line = '';
    };
    for (const word of s.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (this.ctx.measureText(candidate).width <= maxWidth) {
        line = candidate;
        continue;
      }
      push();
      let chunk = '';
      for (const ch of word) {
        if (this.ctx.measureText(chunk + ch).width > maxWidth && chunk) {
          lines.push(chunk);
          chunk = '';
        }
        chunk += ch;
      }
      line = chunk;
    }
    push();
    return lines.length ? lines : [''];
  }

  rule(y: number, color = LINE) {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = SCALE;
    this.ctx.beginPath();
    this.ctx.moveTo(MARGIN, y);
    this.ctx.lineTo(W - MARGIN, y);
    this.ctx.stroke();
  }

  heading(title: string) {
    this.ensure(40 * SCALE);
    this.y += 10 * SCALE;
    this.font(13, 800);
    this.text(title.toUpperCase(), MARGIN, this.y + 12 * SCALE, GREEN);
    this.y += 22 * SCALE;
  }

  /** A table whose header repeats on every page it spills onto. */
  table(columns: Column[], rows: (string | { text: string; color?: string })[][]) {
    const rowFont = 9.5;
    const lineHeight = 13 * SCALE;
    const cellPad = 5 * SCALE;
    const xs: number[] = [];
    let x = MARGIN;
    for (const c of columns) {
      xs.push(x);
      x += c.width;
    }

    const header = () => {
      this.ensure(lineHeight * 3);
      this.ctx.fillStyle = PANEL;
      this.ctx.fillRect(MARGIN, this.y, W - MARGIN * 2, lineHeight + cellPad * 2);
      this.font(8.5, 800);
      columns.forEach((c, i) => {
        const right = c.align === 'right';
        this.text(c.title.toUpperCase(), right ? xs[i] + c.width - cellPad : xs[i] + cellPad, this.y + cellPad + 10 * SCALE, MUTED, right ? 'right' : 'left');
      });
      this.y += lineHeight + cellPad * 2;
    };

    header();
    for (const row of rows) {
      this.font(rowFont, 400);
      const cells = row.map((cell, i) => {
        const value = typeof cell === 'string' ? { text: cell } : cell;
        return { ...value, lines: this.wrap(value.text, columns[i].width - cellPad * 2) };
      });
      const height = Math.max(...cells.map((c) => c.lines.length)) * lineHeight + cellPad * 2;
      if (this.y + height > H - FOOTER - MARGIN / 2) {
        this.newPage();
        header();
        this.font(rowFont, 400);
      }
      cells.forEach((c, i) => {
        const col = columns[i];
        const right = col.align === 'right';
        c.lines.forEach((line, n) => {
          this.text(line, right ? xs[i] + col.width - cellPad : xs[i] + cellPad, this.y + cellPad + 10 * SCALE + n * lineHeight, c.color ?? INK, right ? 'right' : 'left');
        });
      });
      this.y += height;
      this.rule(this.y);
    }
    this.y += 6 * SCALE;
  }

  /** Page numbers go on last, once the count is known. */
  footers(label: string) {
    this.pages.forEach((canvas, i) => {
      const ctx = canvas.getContext('2d')!;
      ctx.font = `400 ${8.5 * SCALE}px ${FONT}`;
      ctx.fillStyle = MUTED;
      ctx.textAlign = 'left';
      ctx.fillText(label, MARGIN, H - FOOTER);
      ctx.textAlign = 'right';
      ctx.fillText(`Page ${i + 1} of ${this.pages.length}`, W - MARGIN, H - FOOTER);
    });
  }
}

export interface StatementInput {
  summary: Summary;
  activities: Activity[];
  banks: PiggyBank[];
  owner: string;
  now?: Date;
}

/** Renders the pages; exported separately so a preview could reuse them. */
export const renderStatement = ({ summary, activities, banks, owner, now = new Date() }: StatementInput) => {
  const doc = new Doc();
  const contentWidth = W - MARGIN * 2;

  // Masthead
  doc.font(11, 800);
  doc.text('SAVVYPIGGY', MARGIN, doc.y + 10 * SCALE, GREEN);
  doc.font(24, 800);
  doc.text('Savings Statement', MARGIN, doc.y + 38 * SCALE);
  doc.font(9.5, 400);
  doc.text(owner, W - MARGIN, doc.y + 12 * SCALE, MUTED, 'right');
  doc.text(`Generated ${dateTime(now)}`, W - MARGIN, doc.y + 26 * SCALE, MUTED, 'right');
  doc.text(summary.range.label, W - MARGIN, doc.y + 40 * SCALE, INK, 'right');
  doc.y += 52 * SCALE;
  doc.rule(doc.y, INK);
  doc.y += 8 * SCALE;

  // Summary panels
  const panels = [
    { label: 'Saved into goals', value: money(summary.distributed), color: GREEN },
    { label: 'Spent from goals', value: money(summary.spent), color: INK },
    { label: 'Debt repaid', value: money(summary.repaid), color: INK },
    { label: 'Borrowed', value: money(summary.borrowed), color: summary.borrowed > 0 ? RED : INK },
  ];
  const gap = 8 * SCALE;
  const panelWidth = (contentWidth - gap * (panels.length - 1)) / panels.length;
  const panelHeight = 52 * SCALE;
  doc.y += 8 * SCALE;
  panels.forEach((p, i) => {
    const x = MARGIN + i * (panelWidth + gap);
    doc.ctx.fillStyle = PANEL;
    doc.ctx.fillRect(x, doc.y, panelWidth, panelHeight);
    doc.font(8, 600);
    doc.text(p.label.toUpperCase(), x + 10 * SCALE, doc.y + 16 * SCALE, MUTED);
    doc.font(16, 800);
    doc.text(p.value, x + 10 * SCALE, doc.y + 40 * SCALE, p.color);
  });
  doc.y += panelHeight + 12 * SCALE;
  doc.font(9.5, 400);
  doc.text(
    `Daily average ${money(summary.dailyAverage)}  ·  ${summary.transactions} transactions  ·  ${summary.range.days} days  ·  ${summary.activeDays} days with savings`,
    MARGIN,
    doc.y + 4 * SCALE,
    MUTED
  );
  doc.y += 14 * SCALE;

  // Goals
  doc.heading('Goals');
  const goalCol = contentWidth - (90 + 80 + 80 + 60) * SCALE;
  doc.table(
    [
      { title: 'Goal', width: goalCol },
      { title: 'Credited', width: 90 * SCALE, align: 'right' },
      { title: 'Balance', width: 80 * SCALE, align: 'right' },
      { title: 'Target', width: 80 * SCALE, align: 'right' },
      { title: 'Funded', width: 60 * SCALE, align: 'right' },
    ],
    summary.banks.map((b) => [
      b.name,
      money(b.credited),
      { text: money(b.current), color: b.current < 0 ? RED : INK },
      b.target > 0 ? money(b.target) : 'Open-ended',
      b.funded === null ? '—' : `${b.funded}%`,
    ])
  );
  doc.font(8.5, 400);
  doc.text('Balances are live as of the moment this statement was generated.', MARGIN, doc.y + 6 * SCALE, MUTED);
  doc.y += 12 * SCALE;

  // Transactions
  const nameOf = (id: string) => banks.find((b) => b.id === id)?.name ?? 'Deleted goal';
  const inPeriod = activities
    .filter((a) => {
      const d = new Date(a.date);
      return d >= summary.range.start && d < summary.range.end;
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  doc.heading(`Transactions (${inPeriod.length})`);
  if (inPeriod.length === 0) {
    doc.font(9.5, 400);
    doc.text('No transactions in this period.', MARGIN, doc.y + 8 * SCALE, MUTED);
    doc.y += 16 * SCALE;
  } else {
    const fixed = (95 + 90 + 75) * SCALE;
    const flexible = contentWidth - fixed;
    doc.table(
      [
        { title: 'Date', width: 95 * SCALE },
        { title: 'Type', width: 90 * SCALE },
        { title: 'Amount', width: 75 * SCALE, align: 'right' },
        { title: 'Goals', width: Math.round(flexible * 0.6) },
        { title: 'Note', width: flexible - Math.round(flexible * 0.6) },
      ],
      inPeriod.map((a) => {
        const parts = a.distributions.map((d) => `${nameOf(d.bankId)} ${signed(d.amount)}`);
        if (a.repaid) parts.unshift(`Debt repaid ${money(a.repaid)}`);
        const outgoing = a.type === 'withdraw' || a.type === 'borrow';
        return [
          dateTime(new Date(a.date)),
          TYPE_LABEL[a.type] ?? a.type,
          { text: `${outgoing ? '-' : '+'}${money(a.amount)}`, color: outgoing ? RED : GREEN },
          parts.join(', ') || '—',
          a.note ?? '',
        ];
      })
    );
  }

  doc.footers(`SavvyPiggy · ${owner} · ${summary.range.label}`);
  return doc.pages;
};

const jpegBytes = (canvas: HTMLCanvasElement): Uint8Array => {
  const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
  const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
};

export const buildStatementPdf = (input: StatementInput): Uint8Array => {
  const pages: PdfPage[] = renderStatement(input).map((canvas) => ({
    jpeg: jpegBytes(canvas),
    width: canvas.width,
    height: canvas.height,
  }));
  return buildImagePdf(pages);
};
