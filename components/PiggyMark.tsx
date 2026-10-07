import React from 'react';

/**
 * The SavvyPiggy mark: a piggy bank facing right, one soft silhouette. It is the
 * only place the app uses its pink. The same shapes are drawn in
 * scripts/make-icons.mjs for the launcher icon; change one, change both.
 */
type Style = React.CSSProperties;

const OUTLINE: { id: string; node: (props: Record<string, unknown>) => React.ReactNode; delay: string; time: string }[] = [
  { id: 'body', node: (p) => <ellipse cx="74" cy="66" rx="44" ry="34" {...p} />, delay: '0s', time: '.7s' },
  { id: 'ear', node: (p) => <path d="M92 38 L100 17 Q114 21 116 44 Z" {...p} />, delay: '.3s', time: '.5s' },
  { id: 'snout', node: (p) => <rect x="112" y="55" width="28" height="24" rx="11" {...p} />, delay: '.4s', time: '.5s' },
  { id: 'legL', node: (p) => <rect x="44" y="92" width="17" height="21" rx="6.5" {...p} />, delay: '.55s', time: '.4s' },
  { id: 'legR', node: (p) => <rect x="88" y="92" width="17" height="21" rx="6.5" {...p} />, delay: '.62s', time: '.4s' },
];
const TAIL = 'M31 57 Q14 54 18 41 Q21 32 11 30';

interface PiggyMarkProps {
  /** `draw` plays the launch animation; `still` is the finished mark. */
  mode?: 'still' | 'draw';
  /** `tile` is the cream piggy for a pink square (icon, sign-in); `brand` is pink on the page. */
  tone?: 'brand' | 'tile';
  /** Seconds of the animation already played, so a remount carries on. */
  elapsed?: number;
  className?: string;
}

export const PiggyMark: React.FC<PiggyMarkProps> = ({ mode = 'still', tone = 'brand', elapsed = 0, className }) => {
  const fill = tone === 'tile' ? '#FFF6F0' : 'rgb(var(--brand))';
  const detail = tone === 'tile' ? '#6E1230' : 'rgb(var(--page))';
  const drawing = mode === 'draw';
  return (
    <svg
      viewBox="4 6 144 112"
      aria-hidden="true"
      focusable="false"
      className={`${drawing ? 'pig-draw' : ''} overflow-visible ${className ?? ''}`}
      style={drawing ? ({ '--el': `${elapsed}s` } as Style) : undefined}
    >
      {drawing && (
        <g>
          {OUTLINE.map((s) => (
            <React.Fragment key={s.id}>{s.node({ className: 'o', pathLength: 1, style: { '--dl': s.delay, '--t': s.time } as Style })}</React.Fragment>
          ))}
          <path className="o tl" pathLength={1} d={TAIL} style={{ '--dl': '.7s', '--t': '.5s' } as Style} />
        </g>
      )}
      <g className="solid" fill={fill} stroke={fill} strokeWidth={3} strokeLinejoin="round">
        {OUTLINE.map((s) => (
          <React.Fragment key={s.id}>{s.node({})}</React.Fragment>
        ))}
        <path d={TAIL} fill="none" strokeWidth={5} strokeLinecap="round" />
      </g>
      <g className="det" fill={detail}>
        <rect x="56" y="41" width="34" height="7" rx="3.5" />
        <circle cx="101" cy="56" r="3.6" />
        <ellipse cx="133" cy="62.5" rx="2.1" ry="3.2" />
        <ellipse cx="133" cy="72" rx="2.1" ry="3.2" />
      </g>
    </svg>
  );
};

/** The pink rounded square with the cream piggy: the launcher icon, shown on the sign-in screens. */
export const PiggyTile: React.FC<{ size?: number }> = ({ size = 84 }) => (
  <span className="grid shrink-0 place-items-center rounded-[26%]" style={{ width: size, height: size, backgroundColor: '#F0436D' }}>
    <PiggyMark tone="tile" className="w-[64%]" />
  </span>
);
