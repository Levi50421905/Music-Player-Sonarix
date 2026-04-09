/**
 * StarRating.tsx — Reusable 1–5 star rating component
 * Click untuk set rating, hover untuk preview
 */

import { useState } from "react";

interface Props {
  stars: number;
  onChange: (stars: number) => void;
  size?: number;
  readonly?: boolean;
}

export default function StarRating({ stars, onChange, size = 13, readonly = false }: Props) {
  const [hover, setHover] = useState(0);
  const active = hover || stars;

  return (
    <div style={{ display: "flex", gap: 1 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <span
          key={n}
          onMouseEnter={() => !readonly && setHover(n)}
          onMouseLeave={() => !readonly && setHover(0)}
          onClick={e => {
            e.stopPropagation();
            if (!readonly) onChange(n === stars ? 0 : n); // click same star = unset
          }}
          style={{
            fontSize: size,
            cursor: readonly ? "default" : "pointer",
            color: n <= active ? "#F59E0B" : "#3f3f5a",
            transition: "color 0.12s, transform 0.1s",
            transform: !readonly && hover === n ? "scale(1.2)" : "scale(1)",
            display: "inline-block",
            lineHeight: 1,
          }}
        >
          {n <= active ? "★" : "☆"}
        </span>
      ))}
    </div>
  );
}