import React, { useMemo } from 'react';
import qrcode from 'qrcode-generator';

/**
 * A QR code drawn as one SVG path. Always black on white, whatever the theme:
 * scanners need the contrast, and a dark-mode inversion would not read.
 */
export const QrCode: React.FC<{ value: string; size?: number; dim?: boolean; label: string }> = ({ value, size = 176, dim, label }) => {
  const { count, path } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
      }
    }
    return { count: n, path: d };
  }, [value]);

  const quiet = 3;
  const box = count + quiet * 2;
  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`${-quiet} ${-quiet} ${box} ${box}`}
      shapeRendering="crispEdges"
      className={`rounded-[18px] bg-white ${dim ? 'opacity-20 grayscale' : ''}`}
    >
      <rect x={-quiet} y={-quiet} width={box} height={box} fill="#ffffff" />
      <path d={path} fill="#111111" />
    </svg>
  );
};
