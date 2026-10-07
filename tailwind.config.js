import forms from '@tailwindcss/forms';
import containerQueries from '@tailwindcss/container-queries';

// Moved verbatim from the inline `tailwind.config` that index.html used to hand
// the Play CDN (cdn.tailwindcss.com?plugins=forms,container-queries, v3.4.17).
// The CDN built classes from the live DOM; this build scans the source instead,
// so every file that holds a class string must be listed in `content`.
// services/ is included because categories.ts carries the category tints.
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './types.ts',
    './components/**/*.{ts,tsx}',
    './contexts/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}',
    './i18n/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "primary": "#4ADE80",
        "accent": "#2DD4BF",
        "bg-dark": "#0A0F0D",
        "surface": "#141C19",
        "surface-light": "#1E2924",
        // New look: CSS-variable tokens (index.css) so one class follows the theme.
        // `line` is the hairline colour (ink in light, white in dark) at full
        // strength: always use it with an opacity, `border-line/10`, `divide-line/10`.
        ...Object.fromEntries(
          ['page', 'card', 'sheet', 'ink', 'mute', 'cta', 'cta-fg', 'pos', 'neg', 'info',
            'line', 'peach', 'mint', 'lav', 'sun', 'hero', 'field', 'dot1', 'dot2', 'dot3',
            'warn', 'brand', 'cat1', 'cat2', 'cat3', 'cat4', 'cat5', 'cat6',
          ].map((name) => [name, `rgb(var(--${name}) / <alpha-value>)`]),
        ),
      },
      fontFamily: {
        "sans": ["Plus Jakarta Sans", "sans-serif"],
        "figtree": ["Figtree", "system-ui", "Noto Sans SC", "sans-serif"]
      }
    },
  },
  plugins: [forms, containerQueries],
};
