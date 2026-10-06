import React from 'react';

/**
 * Line icons, drawn inline so they follow `currentColor` and need no font.
 * The paths are the set approved in the mockups. An unknown name renders
 * nothing, so a goal saved with an icon this build lacks never breaks a screen.
 */
const PATHS: Record<string, string> = {
  home: '<path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z"/>',
  hist: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 2"/>',
  pie: '<path d="M12 3v9h9"/><path d="M21 12a9 9 0 1 1-9-9"/>',
  chart: '<path d="M5 20v-7M12 20V5M19 20v-10"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  coin: '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M9.5 10h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  dep: '<path d="M12 5v13m0 0l-5-5m5 5l5-5"/>',
  out: '<path d="M12 19V6m0 0l-5 5m5-5l5 5"/>',
  swap: '<path d="M7 8h11l-3-3M17 16H6l3 3"/>',
  car: '<path d="M5 16v-5l2-5h10l2 5v5M3 16h18M7 19v-3M17 19v-3"/>',
  plane: '<path d="M3 12l18-8-6 17-3-7z"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  bell: '<path d="M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 21h4"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4m6-4v4"/>',
  wallet: '<path d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M4 7V6a2 2 0 0 1 2-2h10"/><circle cx="16" cy="13.5" r="1"/>',
  spark: '<path d="M12 3l2.2 6.3L21 12l-6.8 2.7L12 21l-2.2-6.3L3 12l6.8-2.7z"/>',
  repeat: '<path d="M17 3l3 3-3 3M20 6H8a4 4 0 0 0-4 4M7 21l-3-3 3-3M4 18h12a4 4 0 0 0 4-4"/>',
  doc: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  archive: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10h14V9M10 13h4"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>',
  more: '<path d="M5 12h.01M12 12h.01M19 12h.01"/>',
  flame: '<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z"/>',
  logout: '<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".5"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M3 17l5-5 4 4 3-3 6 6"/>',
  calx: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4m6-4v4M8 14h2M12 14h2M16 14h.01M8 17h2"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  ser: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4-4"/>',
  undo: '<path d="M9 7L4 12l5 5M4 12h11a5 5 0 0 1 0 10h-3"/>',
  pencil: '<path d="M4 20l4-1 11-11-3-3L5 16z"/>',
  // Not in the mockup table: the sheet's close button needs one.
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
};

export const ICON_NAMES = Object.keys(PATHS);

interface IconProps {
  name: string;
  size?: number;
  className?: string;
  strokeWidth?: number;
}

export const Icon: React.FC<IconProps> = ({ name, size = 22, className, strokeWidth = 1.7 }) => {
  const paths = PATHS[name];
  if (!paths) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className ?? ''}`}
      dangerouslySetInnerHTML={{ __html: paths }}
    />
  );
};
