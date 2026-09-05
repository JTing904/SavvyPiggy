import React from 'react';

export interface DonutSlice {
  id: string;
  /** Whole percentage points. */
  value: number;
  color: string;
}

interface DonutChartProps {
  slices: DonutSlice[];
  /** Sum of the slices, shown in the middle. Over 100 turns the centre red. */
  total: number;
  size?: number;
  thickness?: number;
  /** Replaces the default percentage readout in the middle. */
  center?: React.ReactNode;
}

/** Colours cycle through this, so up to eight goals stay visually distinct. */
export const SLICE_COLORS = [
  '#4ADE80', // primary
  '#2DD4BF', // accent
  '#FBBF24',
  '#A78BFA',
  '#F472B6',
  '#60A5FA',
  '#FB923C',
  '#A3E635',
];

const UNALLOCATED = 'rgba(255,255,255,0.08)';
const GAP = 1.2; // percentage points of ring left blank between slices

/**
 * A plain SVG ring: one stroked circle per slice, offset around the
 * circumference with dash arrays. No chart library, nothing to load.
 */
const DonutChart: React.FC<DonutChartProps> = ({ slices, total, size = 168, thickness = 22, center }) => {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  // Over-allocation still fills the ring exactly once, so the picture stays
  // readable and only the number in the middle raises the alarm.
  const scale = total > 100 ? 100 / total : 1;
  const drawn = slices.filter((s) => s.value > 0);
  const remainder = Math.max(0, 100 - total);

  let cursor = 0;
  const arcs = [...drawn.map((s) => ({ ...s, value: s.value * scale }))];
  if (remainder > 0) arcs.push({ id: '__free', value: remainder, color: UNALLOCATED });

  const rendered = arcs.map((arc) => {
    const gap = arcs.length > 1 ? GAP : 0;
    const length = Math.max(0, arc.value - gap);
    const offset = cursor + gap / 2;
    cursor += arc.value;
    return { ...arc, length, offset };
  });

  const over = total > 100;
  const balanced = total === 100;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={UNALLOCATED}
          strokeWidth={thickness}
          opacity={arcs.length === 0 ? 1 : 0.35}
        />
        {rendered.map((arc) => (
          <circle
            key={arc.id}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={arc.color}
            strokeWidth={thickness}
            strokeDasharray={`${(arc.length / 100) * circumference} ${circumference}`}
            strokeDashoffset={-(arc.offset / 100) * circumference}
            className="transition-all duration-500"
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {center ?? (
          <>
            <p
              className={`text-3xl font-black tabular-nums leading-none ${
                over ? 'text-red-400' : balanced ? 'text-primary' : 'text-white'
              }`}
            >
              {total}%
            </p>
            <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest mt-1">
              {over ? 'Over' : 'Allocated'}
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default DonutChart;
