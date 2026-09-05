// Regenerates assets/ source images, then run: npx capacitor-assets generate --android
import sharp from 'sharp';

const MINT = '#4ADE80';
const TEAL = '#2DD4BF';
const INK = '#0A0F0D';

/** A piggy bank facing left, drawn in `ink` with `cut` for the knocked-out bits. */
const piggy = (ink, cut, scale = 1) => `
  <g transform="translate(512 492) scale(${scale}) translate(-512 -520)">
    <path d="M357 447 q-44 -80 -122 -94 q4 76 54 124 z" fill="${ink}"/>
    <path d="M772 520 q54 22 54 74" stroke="${ink}" stroke-width="34" fill="none" stroke-linecap="round"/>
    <ellipse cx="512" cy="540" rx="268" ry="205" fill="${ink}"/>
    <rect x="300" y="700" width="86" height="112" rx="34" fill="${ink}"/>
    <rect x="638" y="700" width="86" height="112" rx="34" fill="${ink}"/>
    <ellipse cx="252" cy="566" rx="78" ry="66" fill="${ink}"/>
    <ellipse cx="232" cy="552" rx="13" ry="17" fill="${cut}"/>
    <ellipse cx="232" cy="590" rx="13" ry="17" fill="${cut}"/>
    <circle cx="392" cy="486" r="21" fill="${cut}"/>
    <rect x="455" y="392" width="160" height="36" rx="18" fill="${cut}"/>
  </g>`;

const gradient = `
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${MINT}"/>
      <stop offset="1" stop-color="${TEAL}"/>
    </linearGradient>
  </defs>`;

const svg1024 = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${body}</svg>`;

const files = {
  // Square launcher icon.
  'icon.png': svg1024(`${gradient}<rect width="1024" height="1024" fill="url(#g)"/>${piggy(INK, MINT, 0.92)}`),
  // Adaptive icon: the launcher masks this to a circle, so the mark sits smaller.
  'icon-foreground.png': svg1024(piggy(INK, MINT, 0.58)),
  'icon-background.png': svg1024(`${gradient}<rect width="1024" height="1024" fill="url(#g)"/>`),
  // Splash: mint mark on the app's own dark ground, so launch never flashes white.
  'splash.png': `<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732" viewBox="0 0 2732 2732">
    <rect width="2732" height="2732" fill="${INK}"/>
    <g transform="translate(1366 1366) scale(1.1) translate(-512 -520)">${piggy(MINT, INK, 1)}</g>
  </svg>`,
  'splash-dark.png': `<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732" viewBox="0 0 2732 2732">
    <rect width="2732" height="2732" fill="${INK}"/>
    <g transform="translate(1366 1366) scale(1.1) translate(-512 -520)">${piggy(MINT, INK, 1)}</g>
  </svg>`,
};

for (const [name, svg] of Object.entries(files)) {
  await sharp(Buffer.from(svg)).png().toFile(`assets/${name}`);
  console.log('wrote assets/' + name);
}
