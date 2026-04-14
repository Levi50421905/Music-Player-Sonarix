/**
 * EqualizerView.tsx — v2 (Design Fix)
 *
 * PERUBAHAN vs v1:
 *   [FIX] Semua hardcode hex (#0d0d1f, #1a1a2e, #2a2a3e, #3f3f5a, #a78bfa, #7C3AED, dll) → CSS variable
 *   [FIX] EQCurve SVG hardcode hex → CSS variable
 *   [FIX] Font size dB value: 10px → 11px
 *   [FIX] Frequency label: 9px → 11px
 */

import { useState, useCallback } from "react";
import { audioEngine, EQ_FREQUENCIES } from "../../lib/audioEngine";
import { useSettingsStore } from "../../store";

const EQ_PRESETS: Record<string, number[]> = {
  "Flat":         [ 0,  0,  0,  0,  0,  0,  0,  0,  0,  0],
  "Bass Boost":   [ 7,  6,  4,  2,  0,  0,  0,  0,  0,  0],
  "Treble Boost": [ 0,  0,  0,  0,  0,  1,  2,  4,  6,  7],
  "Vocal":        [-2, -2,  0,  2,  4,  4,  3,  2,  1,  0],
  "Rock":         [ 5,  4,  2,  0, -1, -1,  0,  2,  4,  5],
  "Electronic":   [ 5,  4,  1,  0, -2, -1,  1,  3,  4,  5],
  "Jazz":         [ 3,  2,  1,  2,  0, -1, -1,  0,  2,  3],
  "Classical":    [ 4,  3,  2,  1,  0,  0, -1, -1,  2,  3],
  "Pop":          [-1,  0,  2,  3,  3,  2,  0, -1, -1, -1],
  "Hip-Hop":      [ 5,  4,  2,  3,  0, -1,  0,  1,  2,  3],
};

const BAND_LABELS = ["32", "64", "125", "250", "500", "1K", "2K", "4K", "8K", "16K"];

export default function EqualizerView() {
  const { eqGains, eqPreset, setEqGains, setEqPreset } = useSettingsStore();
  const [gains, setGains] = useState<number[]>(eqGains);

  const applyPreset = useCallback((name: string) => {
    const preset = EQ_PRESETS[name];
    if (!preset) return;
    setGains(preset);
    setEqGains(preset);
    setEqPreset(name);
    audioEngine.setEqPreset(preset);
  }, [setEqGains, setEqPreset]);

  const handleBandChange = useCallback((index: number, value: number) => {
    const next = [...gains];
    next[index] = value;
    setGains(next);
    setEqGains(next);
    setEqPreset("Custom");
    audioEngine.setEqBand(index, value);
  }, [gains, setEqGains, setEqPreset]);

  const resetAll = () => applyPreset("Flat");

  /** Warna per-band menggunakan CSS variable agar theme-aware */
  const barColor = (gain: number): string => {
    if (gain > 6)  return "var(--success)";
    if (gain > 0)  return "var(--accent)";
    if (gain < -6) return "var(--danger)";
    if (gain < 0)  return "var(--info)";
    return "var(--text-faint)";
  };

  return (
    <div style={{ padding: "0 4px" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontWeight: 700, fontSize: 18, letterSpacing: "-0.4px", color: "var(--text-primary)" }}>
            Equalizer
          </h2>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
            Preset aktif: <span style={{ color: "var(--accent-light)" }}>{eqPreset}</span>
          </p>
        </div>
        <button
          onClick={resetAll}
          style={{
            padding: "6px 14px",
            borderRadius: "var(--radius-md)",
            fontSize: 12,
            border: "1px solid var(--border-medium)",
            background: "transparent",
            color: "var(--text-secondary)",
            cursor: "pointer",
            fontFamily: "inherit",
            transition: "all 0.15s",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent-border)"; e.currentTarget.style.color = "var(--accent-light)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border-medium)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
        >
          Reset
        </button>
      </div>

      {/* Presets */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 28 }}>
        {Object.keys(EQ_PRESETS).map(name => (
          <button key={name} onClick={() => applyPreset(name)} style={{
            padding: "5px 12px",
            borderRadius: 20,
            fontSize: 11,
            cursor: "pointer",
            border: "1px solid",
            fontFamily: "inherit",
            fontWeight: eqPreset === name ? 600 : 400,
            background: eqPreset === name ? "var(--accent-dim)" : "transparent",
            borderColor: eqPreset === name ? "var(--accent-border)" : "var(--border-medium)",
            color: eqPreset === name ? "var(--accent-light)" : "var(--text-muted)",
            transition: "all 0.15s",
          }}
            onMouseEnter={e => { if (eqPreset !== name) { e.currentTarget.style.borderColor = "var(--border-medium)"; e.currentTarget.style.color = "var(--text-secondary)"; } }}
            onMouseLeave={e => { if (eqPreset !== name) { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-muted)"; } }}
          >
            {name}
          </button>
        ))}
        {eqPreset === "Custom" && (
          <button style={{
            padding: "5px 12px",
            borderRadius: 20,
            fontSize: 11,
            background: "var(--info-dim, rgba(59,130,246,0.12))",
            border: "1px solid var(--info)",
            color: "var(--info)",
            fontFamily: "inherit",
          }}>
            Custom
          </button>
        )}
      </div>

      {/* EQ curve visualization */}
      <EQCurve gains={gains} />

      {/* Band sliders */}
      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${BAND_LABELS.length}, 1fr)`,
        gap: 8,
        marginTop: 24,
        background: "var(--bg-overlay)",
        borderRadius: "var(--radius-lg)",
        padding: "20px 16px",
        border: "1px solid var(--border)",
      }}>
        {BAND_LABELS.map((label, i) => (
          <div key={label} style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
          }}>
            {/* dB value — font size 11px minimum */}
            <span style={{
              fontSize: 11,
              fontFamily: "'Space Mono', monospace",
              color: barColor(gains[i]),
              fontWeight: gains[i] !== 0 ? 700 : 400,
              minWidth: 32,
              textAlign: "center",
            }}>
              {gains[i] > 0 ? `+${gains[i]}` : gains[i]}
            </span>

            {/* Vertical slider */}
            <div style={{ position: "relative", height: 100 }}>
              {/* Zero line indicator */}
              <div style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: "translate(-50%, -50%)",
                width: 20,
                height: 1,
                background: "var(--border-medium)",
                pointerEvents: "none",
                zIndex: 1,
              }} />
              <input
                type="range"
                min={-12}
                max={12}
                step={0.5}
                value={gains[i]}
                onChange={e => handleBandChange(i, parseFloat(e.target.value))}
                style={{
                  writingMode: "vertical-lr",
                  direction: "rtl",
                  height: 100,
                  width: 28,
                  cursor: "pointer",
                  accentColor: barColor(gains[i]),
                } as React.CSSProperties}
              />
            </div>

            {/* Frequency label — font size 11px minimum */}
            <span style={{
              fontSize: 11,
              color: "var(--text-muted)",
              fontFamily: "'Space Mono', monospace",
            }}>
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* Info */}
      <p style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 12, textAlign: "center" }}>
        Perubahan langsung terdengar · Range: -12dB sampai +12dB
      </p>
    </div>
  );
}

// ── EQ Curve SVG — pakai CSS variable, bukan hardcode hex ─────────────────────
function EQCurve({ gains }: { gains: number[] }) {
  const W = 500, H = 80;
  const midY = H / 2;

  const points = gains.map((g, i) => ({
    x: i * (W / (gains.length - 1)),
    y: midY - (g / 12) * (midY - 8),
  }));

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpX = (prev.x + curr.x) / 2;
    d += ` C ${cpX} ${prev.y}, ${cpX} ${curr.y}, ${curr.x} ${curr.y}`;
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 80, display: "block" }}>
      {/* Grid lines dengan CSS variable stroke */}
      {[-6, 0, 6].map(db => {
        const y = midY - (db / 12) * (midY - 8);
        return (
          <g key={db}>
            <line x1={0} y1={y} x2={W} y2={y} stroke="var(--border)" strokeWidth={1} />
            <text
              x={4} y={y - 2}
              fill="var(--text-faint)"
              fontSize={9}
              fontFamily="'Space Mono', monospace"
            >
              {db > 0 ? `+${db}` : db}dB
            </text>
          </g>
        );
      })}

      {/* Fill area */}
      <defs>
        <linearGradient id="eq-curve-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.3} />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
        </linearGradient>
        <clipPath id="eq-above-mid">
          <rect x={0} y={0} width={W} height={midY} />
        </clipPath>
      </defs>

      <path
        d={`${d} L ${W} ${midY} L 0 ${midY} Z`}
        fill="url(#eq-curve-grad)"
        clipPath="url(#eq-above-mid)"
      />

      {/* Curve line */}
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" />

      {/* Control points */}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={3}
          fill={gains[i] !== 0 ? "var(--accent-light)" : "var(--bg-subtle)"}
          stroke="var(--bg-overlay)"
          strokeWidth={1}
        />
      ))}
    </svg>
  );
}