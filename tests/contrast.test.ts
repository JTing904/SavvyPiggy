import { readFileSync } from 'node:fs';
import { eq, report } from './harness';

/**
 * The design tokens in index.css, read back and checked against WCAG 2.x.
 * Text pairs need 4.5:1; the toggle and the primary button need 3:1 / 4.5:1 as
 * stated below. Reading the CSS (rather than repeating the numbers here) means
 * a token edited later is judged, not a stale copy of it.
 */
const css = readFileSync('index.css', 'utf8').replace(/\r\n/g, '\n');

type Tokens = Record<string, [number, number, number]>;

const parseBlock = (block: string): Tokens => {
  const out: Tokens = {};
  for (const m of block.matchAll(/--([\w-]+):\s*(\d+)\s+(\d+)\s+(\d+);/g)) {
    out[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])];
  }
  return out;
};

// `:root,\n[data-theme="light"] {` ... and `[data-theme="dark"] {` ...
const blockAfter = (opener: string) => {
  const start = css.indexOf(opener);
  if (start < 0) throw new Error(`index.css has no ${opener}`);
  return css.slice(start, css.indexOf('}', start));
};
const light = parseBlock(blockAfter(':root,\n[data-theme="light"] {'));
const dark = parseBlock(blockAfter('\n[data-theme="dark"] {'));

const channel = (c: number) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]: [number, number, number]) =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const contrast = (a: [number, number, number], b: [number, number, number]) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const TINTS = ['peach', 'mint', 'lav', 'sun'];
const SURFACES = ['page', 'card', 'sheet', 'hero', 'field', ...TINTS];

for (const [theme, t] of [['light', light], ['dark', dark]] as const) {
  for (const name of ['page', 'card', 'sheet', 'ink', 'mute', 'cta', 'cta-fg', 'pos', 'neg', 'info', ...TINTS, 'hero', 'field', 'tog']) {
    eq(`${theme}: token --${name} exists`, name in t, true);
  }

  // Ink is the body text: it has to read on everything.
  for (const bg of SURFACES) {
    const c = contrast(t.ink, t[bg]);
    eq(`${theme}: ink on ${bg} >= 4.5 (${c.toFixed(2)})`, c >= 4.5, true);
  }
  // Muted, money-in green, spending red, moved-to-investing blue are all body-size text.
  for (const fg of ['mute', 'pos', 'neg', 'info']) {
    for (const bg of SURFACES) {
      const c = contrast(t[fg], t[bg]);
      eq(`${theme}: ${fg} on ${bg} >= 4.5 (${c.toFixed(2)})`, c >= 4.5, true);
    }
  }
  // The primary button: label on the ink fill.
  const cta = contrast(t['cta-fg'], t.cta);
  eq(`${theme}: cta label on cta >= 4.5 (${cta.toFixed(2)})`, cta >= 4.5, true);
  // The ink button is drawn on the page and on a sheet, so it must stand out from them.
  for (const bg of ['page', 'card', 'sheet']) {
    const c = contrast(t.cta, t[bg]);
    eq(`${theme}: cta fill vs ${bg} >= 3 (${c.toFixed(2)})`, c >= 3, true);
  }
  // A switched-on toggle (non-text, 3:1) against the card it sits on, with its knob on top.
  const on = contrast(t.pos, t.card);
  eq(`${theme}: toggle on-track vs card >= 3 (${on.toFixed(2)})`, on >= 3, true);
  const knob = contrast(t['cta-fg'], t.pos);
  eq(`${theme}: toggle on-knob vs on-track >= 3 (${knob.toFixed(2)})`, knob >= 3, true);
}

report();
