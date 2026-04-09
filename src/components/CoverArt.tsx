/**
 * CoverArt.tsx — Reusable album art component
 * Tampilkan cover art dari base64 jika ada, fallback ke generated gradient art
 */

import React from "react";

const PALETTES = [
  ["#7C3AED", "#DB2777"], ["#0EA5E9", "#10B981"], ["#F59E0B", "#EF4444"],
  ["#6366F1", "#8B5CF6"], ["#14B8A6", "#3B82F6"], ["#EC4899", "#F97316"],
  ["#8B5CF6", "#06B6D4"], ["#10B981", "#84CC16"],
];

interface Props {
  id: number;
  coverArt: string | null | undefined;
  size?: number;
  style?: React.CSSProperties;
}

export default function CoverArt({ id, coverArt, size = 48, style }: Props) {
  const radius = Math.round(size * 0.14);

  if (coverArt) {
    return (
      <img
        src={coverArt}
        width={size} height={size}
        style={{ borderRadius: radius, objectFit: "cover", flexShrink: 0, display: "block", ...style }}
        alt=""
      />
    );
  }

  // Generated art fallback
  const [c1, c2] = PALETTES[id % PALETTES.length];
  const s = size;
  const circles = [
    { cx: s * 0.3, cy: s * 0.4, r: s * 0.22 },
    { cx: s * 0.65, cy: s * 0.55, r: s * 0.17 },
    { cx: s * 0.5, cy: s * 0.2, r: s * 0.12 },
  ];

  return (
    <svg width={s} height={s} style={{ borderRadius: radius, flexShrink: 0, display: "block", ...style }}>
      <defs>
        <linearGradient id={`cg${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={c1} />
          <stop offset="100%" stopColor={c2} />
        </linearGradient>
      </defs>
      <rect width={s} height={s} rx={radius} fill={`url(#cg${id})`} />
      {circles.map((c, i) => (
        <circle key={i} cx={c.cx} cy={c.cy} r={c.r} fill="rgba(255,255,255,0.1)" />
      ))}
      <circle cx={s / 2} cy={s / 2} r={s * 0.13} fill="rgba(0,0,0,0.4)" />
      <circle cx={s / 2} cy={s / 2} r={s * 0.055} fill="rgba(255,255,255,0.85)" />
    </svg>
  );
}