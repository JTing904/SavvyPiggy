import React, { useRef, useState } from 'react';

/**
 * The small charts, drawn as plain SVG so they need no library. Colours come
 * from the chart tokens (c1 to c5, checked for colour-blind separation) and a
 * series keeps its colour by what it is, not by where it ranks.
 */
export type ChartColor = 1 | 2 | 3 | 4 | 5;

const stroke = (c: ChartColor) => `rgb(var(--c${c}))`;
const TRACK = 'rgb(var(--track))';

interface RingProps {
  /** 0 to 100; null draws the empty track, for a goal with no target. */
  percent: number | null;
  color?: ChartColor;
  size?: number;
  width?: number;
  label: string;
  children?: React.ReactNode;
}

/** A progress ring with anything in its middle. */
export const Ring: React.FC<RingProps> = ({ percent, color = 1, size = 58, width = 6, label, children }) => {
  const r = (size - width) / 2;
  const c = 2 * Math.PI * r;
  const shown = percent === null ? 0 : Math.min(100, Math.max(0, percent));
  return (
    <span role="img" aria-label={label} className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="absolute inset-0">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={TRACK} strokeWidth={width} />
        {shown > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={stroke(color)}
            strokeWidth={width}
            strokeLinecap="round"
            strokeDasharray={`${(shown / 100) * c} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </svg>
      <span className="relative text-center">{children}</span>
    </span>
  );
};

export interface Slice {
  value: number;
  color: ChartColor;
}

interface DonutProps {
  slices: Slice[];
  size?: number;
  width?: number;
  label: string;
  children?: React.ReactNode;
}

/** Parts of a whole, with a surface gap between them and the total in the middle. */
export const Donut: React.FC<DonutProps> = ({ slices, size = 124, width = 16, label, children }) => {
  const r = (size - width) / 2;
  const c = 2 * Math.PI * r;
  const total = slices.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  const gap = slices.filter((s) => s.value > 0).length > 1 ? 2 : 0;
  let run = 0;
  return (
    <span role="img" aria-label={label} className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="absolute inset-0">
        {total <= 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={TRACK} strokeWidth={width} />}
        <g fill="none" strokeWidth={width} transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {total > 0 &&
            slices.map((s, i) => {
              if (s.value <= 0) return null;
              const len = (s.value / total) * c;
              const at = run;
              run += len;
              return (
                <circle
                  key={i}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  stroke={stroke(s.color)}
                  strokeDasharray={`${Math.max(0.5, len - gap)} ${c}`}
                  strokeDashoffset={-at}
                />
              );
            })}
        </g>
      </svg>
      <span className="relative text-center">{children}</span>
    </span>
  );
};

/** The colour swatch beside a legend line, so a slice is never told apart by colour alone. */
export const Swatch: React.FC<{ color: ChartColor }> = ({ color }) => (
  <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: stroke(color) }} aria-hidden="true" />
);

interface BarProps {
  /** 0 to 100, clipped. */
  percent: number;
  color?: ChartColor;
  /** Where today falls, 0 to 100: a mark across the bar. */
  mark?: number;
  height?: number;
  className?: string;
}

/** A progress bar, with the mark that says how far through the month it is. */
export const Bar: React.FC<BarProps> = ({ percent, color = 1, mark, height = 8, className }) => (
  <span className={`relative block rounded-full bg-track ${className ?? ''}`} style={{ height }}>
    <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, Math.max(0, percent))}%`, background: stroke(color) }} />
    {mark !== undefined && <span className="absolute w-0.5 bg-ink" style={{ left: `${mark}%`, top: -4, bottom: -4 }} />}
  </span>
);

/** Share of a stacked bar, with a surface gap between the parts. */
export const StackedBar: React.FC<{ slices: Slice[]; label: string; height?: number }> = ({ slices, label, height = 12 }) => {
  const total = slices.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  return (
    <span role="img" aria-label={label} className="flex gap-0.5 overflow-hidden rounded" style={{ height }}>
      {total > 0 &&
        slices
          .filter((s) => s.value > 0)
          .map((s, i) => <span key={i} style={{ width: `${(s.value / total) * 100}%`, background: stroke(s.color) }} />)}
    </span>
  );
};

/** Maps values to points inside a box, flat when they are all the same. */
const plot = (values: number[], w: number, h: number, pad: number) => {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo;
  return values.map((v, i) => ({
    x: values.length < 2 ? w / 2 : pad + (i / (values.length - 1)) * (w - pad * 2),
    y: span === 0 ? h / 2 : h - pad - ((v - lo) / span) * (h - pad * 2),
  }));
};
const path = (points: { x: number; y: number }[]) => points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

interface SparklineProps {
  values: number[];
  /** A token name for the line: a chart colour, or `band-sub` on the band. */
  color?: ChartColor | 'band-sub';
  width?: number;
  height?: number;
  /** Marks the latest point. */
  dot?: boolean;
  label?: string;
}

/** A line with no axes, for the shape of something beside its number. Needs at least two values. */
export const Sparkline: React.FC<SparklineProps> = ({ values, color = 1, width = 62, height = 30, dot = false, label }) => {
  if (values.length < 2) return null;
  const points = plot(values, width, height, dot ? 5 : 2);
  const last = points[points.length - 1];
  const line = typeof color === 'number' ? stroke(color) : `rgb(var(--${color}))`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} className="shrink-0">
      <path d={path(points)} fill="none" stroke={line} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {dot && <circle cx={last.x} cy={last.y} r={4} fill="rgb(var(--band-fg))" stroke="rgb(var(--band))" strokeWidth={2} />}
    </svg>
  );
};

export interface LinePoint {
  value: number;
  /** Under the crosshair, when the chart is touched. */
  label: string;
}

interface LineChartProps {
  points: LinePoint[];
  /** Along the bottom, spread evenly. */
  ticks: string[];
  color?: ChartColor;
  height?: number;
  format: (value: number) => string;
  label: string;
}

/**
 * A line with a recessive grid and the latest value on it. Dragging across it
 * reads any day back, since a line this size cannot carry a label per point.
 */
export const LineChart: React.FC<LineChartProps> = ({ points, ticks, color = 1, height = 118, format, label }) => {
  const W = 330;
  const H = height - 20;
  const box = useRef<SVGSVGElement>(null);
  const [touched, setTouched] = useState<number | null>(null);
  if (points.length < 2) return null;
  const plotted = plot(
    points.map((p) => p.value),
    W,
    H,
    10
  );
  const read = (e: React.PointerEvent) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const at = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    plotted.forEach((p, i) => {
      if (Math.abs(p.x - at) < Math.abs(plotted[best].x - at)) best = i;
    });
    setTouched(best);
  };
  const end = plotted.length - 1;
  // A shorter range can arrive under a finger still on the longer one.
  const shown = Math.min(touched ?? end, end);
  const dot = plotted[shown];
  const nearRight = dot.x > W * 0.7;
  return (
    <svg
      ref={box}
      viewBox={`0 0 ${W} ${height}`}
      role="img"
      aria-label={label}
      className="block w-full touch-pan-y select-none overflow-visible"
      onPointerDown={read}
      onPointerMove={(e) => e.buttons > 0 && read(e)}
      onPointerUp={() => setTouched(null)}
      onPointerCancel={() => setTouched(null)}
      onPointerLeave={() => setTouched(null)}
    >
      <g stroke="rgb(var(--track))" strokeWidth="1">
        {[0.1, 0.5, 0.9].map((f) => (
          <path key={f} d={`M0 ${H * f}H${W}`} />
        ))}
      </g>
      <path d={path(plotted)} fill="none" stroke={stroke(color)} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {touched !== null && <path d={`M${dot.x} 0V${H}`} stroke="rgb(var(--mute))" strokeWidth="1" />}
      <circle cx={dot.x} cy={dot.y} r={4.5} fill={stroke(color)} stroke="rgb(var(--card))" strokeWidth={2} />
      <text
        x={nearRight ? dot.x - 9 : dot.x + 9}
        y={Math.max(11, dot.y - 7)}
        textAnchor={nearRight ? 'end' : 'start'}
        fontSize="12"
        fontWeight="700"
        fill="rgb(var(--ink))"
      >
        {touched !== null ? `${points[shown].label}  ${format(points[shown].value)}` : format(points[shown].value)}
      </text>
      <g fontSize="11.5" fontWeight="600" fill="rgb(var(--mute))">
        {ticks.map((tick, i) => (
          <text
            key={tick + i}
            x={ticks.length < 2 ? 0 : (i / (ticks.length - 1)) * W}
            y={height - 4}
            textAnchor={i === 0 ? 'start' : i === ticks.length - 1 ? 'end' : 'middle'}
          >
            {tick}
          </text>
        ))}
      </g>
    </svg>
  );
};
