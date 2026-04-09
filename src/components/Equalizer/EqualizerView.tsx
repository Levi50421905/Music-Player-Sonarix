/**
 * EqualizerView.tsx — 10-Band Equalizer UI
 *
 * WHY vertical sliders:
 *   - Mirip hardware EQ fisik → lebih intuitif
 *   - Mudah lihat "shape" EQ secara visual
 *
 * Setiap slider langsung call audioEngine.setEqBand() saat digeser,
 * sehingga perubahan terdengar real-time tanpa delay.
 */

import { useState, useCallback } from "react";
import { audioEngine, EQ_FREQUENCIES } from "../../lib/audioEngine";
import { useSettingsStore } from "../../store";

// Preset EQ dalam dB per band (32Hz → 16kHz)
const EQ_PRESETS: Record<string, number[]> = {
  "Flat":        [ 0,  0,  0,  0,  0,  0,  0,  0,  0,  0],
  "Bass Boost":  [ 7,  6,  4,  2,  0,  0,  0,  0,  0,  0],
  "Treble Boost":[ 0,  0,  0,  0,  0,  1,  2,  4,  6,  7],
  "Vocal":       [-2, -2,  0,  2,  4,  4,  3,  2,  1,  0],
  "Rock":        [ 5,  4,  2,  0, -1, -1,  0,  2,  4,  5],
  "Electronic":  [ 5,  4,  1,  0, -2, -1,  1,  3,  4,  5],
  "Jazz":        [ 3,  2,  1,  2,  0, -1, -1,  0,  2,  3],
  "Classical":   [ 4,  3,  2,  1,  0,  0, -1, -1,  2,  3],
  "Pop":         [-1,  0,  2,  3,  3,  2,  0, -1, -1, -1],
  "Hip-Hop":     [ 5,  4,  2,  3,  0, -1,  0,  1,  2,  3],
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
  }, []);

  const handleBandChange = useCallback((index: number, value: number) => {
    const next = [...gains];
    next[index] = value;
    setGains(next);
    setEqGains(next);
    setEqPreset("Custom");
    audioEngine.setEqBand(index, value); // real-time effect
  }, [gains]);

  const resetAll = () => applyPreset("Flat");

  // Warna bar EQ berdasarkan nilai gain
  const barColor = (gain: number) => {
    if (gain > 6)  return "#10B981"; // hijau: boost besar
    if (gain > 0)  return "#7C3AED"; // ungu: boost
    if (gain < -6) return "#EF4444"; // merah: cut besar
    if (gain < 0)  return "#6366F1"; // indigo: cut
    return "#4B5563";                // abu: flat
  };

  return (
    <div style={{ padding: "0 4px" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontWeight: 700, fontSize: 18, letterSpacing: "-0.4px" }}>Equalizer</h2>
          <p style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
            Preset aktif: <span style={{ color: "#a78bfa" }}>{eqPreset}</span>
          </p>
        </div>
        <button onClick={resetAll} style={{
          padding: "6px 14px", borderRadius: 20, fontSize: 12,
          border: "1px solid #3f3f5a", background: "transparent",
          color: "#9ca3af", cursor: "pointer", fontFamily: "inherit",
          transition: "all 0.2s",
        }}>Reset</button>
      </div>

      {/* Presets */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 28 }}>
        {Object.keys(EQ_PRESETS).map(name => (
          <button key={name} onClick={() => applyPreset(name)} style={{
            padding: "5px 12px", borderRadius: 20, fontSize: 11,
            cursor: "pointer", border: "1px solid", fontFamily: "inherit",
            fontWeight: eqPreset === name ? 600 : 400,
            background: eqPreset === name ? "rgba(124,58,237,0.25)" : "transparent",
            borderColor: eqPreset === name ? "#7C3AED" : "#2a2a3e",
            color: eqPreset === name ? "#a78bfa" : "#6b7280",
            transition: "all 0.2s",
          }}>{name}</button>
        ))}
        {eqPreset === "Custom" && (
          <button style={{
            padding: "5px 12px", borderRadius: 20, fontSize: 11,
            background: "rgba(99,102,241,0.2)", border: "1px solid #6366F1",
            color: "#818CF8", fontFamily: "inherit",
          }}>Custom</button>
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
        background: "#0d0d1f",
        borderRadius: 12,
        padding: "20px 16px",
        border: "1px solid #1a1a2e",
      }}>
        {BAND_LABELS.map((label, i) => (
          <div key={label} style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
          }}>
            {/* dB value */}
            <span style={{
              fontSize: 10, fontFamily: "Space Mono, monospace",
              color: barColor(gains[i]),
              fontWeight: gains[i] !== 0 ? 700 : 400,
              minWidth: 28, textAlign: "center",
            }}>
              {gains[i] > 0 ? `+${gains[i]}` : gains[i]}
            </span>

            {/* Vertical slider */}
            <div style={{ position: "relative", height: 100 }}>
              {/* Zero line */}
              <div style={{
                position: "absolute", left: "50%", top: "50%",
                transform: "translate(-50%, -50%)",
                width: 18, height: 1, background: "#2a2a3e",
                pointerEvents: "none",
              }} />
              <input
                type="range"
                min={-12} max={12} step={0.5}
                value={gains[i]}
                onChange={e => handleBandChange(i, parseFloat(e.target.value))}
                style={{
                  writingMode: "vertical-lr",
                  direction: "rtl",
                  height: 100,
                  width: 28,
                  cursor: "pointer",
                  accentColor: barColor(gains[i]),
                }}
              />
            </div>

            {/* Frequency label */}
            <span style={{
              fontSize: 9, color: "#6b7280",
              fontFamily: "Space Mono, monospace",
            }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Info */}
      <p style={{ fontSize: 11, color: "#4b5563", marginTop: 12, textAlign: "center" }}>
        Perubahan langsung terdengar • Range: -12dB sampai +12dB
      </p>
    </div>
  );
}

// ── EQ Curve SVG ─────────────────────────────────────────────────────────────
// Visualisasi bentuk EQ sebagai kurva smooth (bukan bar)
function EQCurve({ gains }: { gains: number[] }) {
  const W = 500, H = 80;
  const midY = H / 2;
  const step = W / (gains.length - 1);

  // Konversi gain ke Y coordinate
  const points = gains.map((g, i) => ({
    x: i * step,
    y: midY - (g / 12) * (midY - 8),
  }));

  // Buat path smooth menggunakan cubic bezier
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpX = (prev.x + curr.x) / 2;
    d += ` C ${cpX} ${prev.y}, ${cpX} ${curr.y}, ${curr.x} ${curr.y}`;
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 80, display: "block" }}>
      {/* Grid lines */}
      {[-6, 0, 6].map(db => {
        const y = midY - (db / 12) * (midY - 8);
        return (
          <g key={db}>
            <line x1={0} y1={y} x2={W} y2={y} stroke="#1a1a2e" strokeWidth={1} />
            <text x={4} y={y - 2} fill="#3f3f5a" fontSize={8} fontFamily="monospace">
              {db > 0 ? `+${db}` : db}dB
            </text>
          </g>
        );
      })}

      {/* Fill area under/over curve */}
      <defs>
        <linearGradient id="curve-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7C3AED" stopOpacity={0.3} />
          <stop offset="100%" stopColor="#7C3AED" stopOpacity={0.02} />
        </linearGradient>
        <clipPath id="above-mid">
          <rect x={0} y={0} width={W} height={midY} />
        </clipPath>
      </defs>

      {/* Filled area */}
      <path
        d={`${d} L ${W} ${midY} L 0 ${midY} Z`}
        fill="url(#curve-grad)"
        clipPath="url(#above-mid)"
      />

      {/* Curve line */}
      <path d={d} fill="none" stroke="#7C3AED" strokeWidth={2} strokeLinecap="round" />

      {/* Control points */}
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3}
          fill={gains[i] !== 0 ? "#a78bfa" : "#3f3f5a"}
          stroke="#0a0a14" strokeWidth={1}
        />
      ))}
    </svg>
  );
}