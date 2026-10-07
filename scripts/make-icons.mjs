// Regenerates assets/ source images, then run: npx capacitor-assets generate --android
// (or `npm run icons`, which does both).
//
// The piggy is the same drawing as components/PiggyMark.tsx: change one, change both.
import sharp from 'sharp';

const PINK = '#F0436D';
const CREAM = '#FFF6F0';
const PLUM = '#6E1230';
const PAGE_LIGHT = '#F3F5F1';
const PAGE_DARK = '#0E1311';

/** The piggy facing right in a 144 x 112 box (viewBox "4 6 144 112"), drawn in `ink` with `cut` for the details. */
const piggy = (ink, cut) => `
  <g fill="${ink}" stroke="${ink}" stroke-width="3" stroke-linejoin="round">
    <ellipse cx="74" cy="66" rx="44" ry="34"/>
    <path d="M92 38 L100 17 Q114 21 116 44 Z"/>
    <rect x="112" y="55" width="28" height="24" rx="11"/>
    <rect x="44" y="92" width="17" height="21" rx="6.5"/>
    <rect x="88" y="92" width="17" height="21" rx="6.5"/>
    <path d="M31 57 Q14 54 18 41 Q21 32 11 30" fill="none" stroke-width="5" stroke-linecap="round"/>
  </g>
  <g fill="${cut}">
    <rect x="56" y="41" width="34" height="7" rx="3.5"/>
    <circle cx="101" cy="56" r="3.6"/>
    <ellipse cx="133" cy="62.5" rx="2.1" ry="3.2"/>
    <ellipse cx="133" cy="72" rx="2.1" ry="3.2"/>
  </g>`;

/** Places the piggy, centred, `width` px wide on a 1024 canvas. */
const placed = (ink, cut, width) => {
  const scale = width / 144;
  // The box's centre is (76, 62); move it to the canvas centre.
  return `<g transform="translate(512 512) scale(${scale}) translate(-76 -62)">${piggy(ink, cut)}</g>`;
};

const svg1024 = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${body}</svg>`;

const files = {
  // Square launcher icon: pink tile, cream piggy.
  'icon.png': svg1024(`<rect width="1024" height="1024" fill="${PINK}"/>${placed(CREAM, PLUM, 640)}`),
  // Adaptive icon: the launcher masks this to a circle, so the mark sits smaller.
  'icon-foreground.png': svg1024(placed(CREAM, PLUM, 420)),
  'icon-background.png': svg1024(`<rect width="1024" height="1024" fill="${PINK}"/>`),
  // The system's own first moment: just the page colour. The piggy then draws itself
  // in the app (components/Splash.tsx), so there is nothing here to jump when it starts.
  'splash.png': `<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732" viewBox="0 0 2732 2732"><rect width="2732" height="2732" fill="${PAGE_LIGHT}"/></svg>`,
  'splash-dark.png': `<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732" viewBox="0 0 2732 2732"><rect width="2732" height="2732" fill="${PAGE_DARK}"/></svg>`,
};

for (const [name, svg] of Object.entries(files)) {
  await sharp(Buffer.from(svg)).png().toFile(`assets/${name}`);
  console.log('wrote assets/' + name);
}
