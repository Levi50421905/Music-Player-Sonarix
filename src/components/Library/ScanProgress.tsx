/**
 * ScanProgress.tsx — v5 (Design Fix)
 *
 * PERUBAHAN vs v4:
 *   [FIX] Semua hardcode hex → CSS variable
 *   [FIX] Animasi indeterminate tetap sama, hanya warna yang diubah
 */

import { useEffect, useState } from "react";
import { useLibraryStore } from "../../store";

export default function ScanProgress() {
  const { scanProgress } = useLibraryStore();
  const [visible, setVisible]   = useState(false);
  const [justDone, setJustDone] = useState(false);

  useEffect(() => {
    if (scanProgress && !scanProgress.done) {
      setVisible(true);
      setJustDone(false);
    } else if (scanProgress?.done) {
      setJustDone(true);
      const t = setTimeout(() => { setVisible(false); setJustDone(false); }, 3000);
      return () => clearTimeout(t);
    }
  }, [scanProgress]);

  if (!visible && !justDone) return null;
  if (!scanProgress) return null;

  const pct = scanProgress.total > 0
    ? Math.round((scanProgress.current / scanProgress.total) * 100)
    : 0;

  const phase = scanProgress.phase ?? (scanProgress.done ? "completed" : "scanning");

  const cfg = {
    scanning:  { label: "Scanning folder…",  color: "var(--accent)",   pulse: true  },
    indexing:  { label: "Indexing files…",    color: "var(--info)",     pulse: true  },
    completed: { label: "Scan complete",      color: "var(--success)",  pulse: false },
  }[phase] ?? { label: "Scanning…", color: "var(--accent)", pulse: true };

  return (
    <div style={{
      position: "fixed",
      bottom: 100, left: 20,
      zIndex: 200,
      background: "var(--bg-overlay)",
      border: `1px solid color-mix(in srgb, ${cfg.color} 27%, transparent)`,
      borderRadius: "var(--radius-xl)",
      padding: "13px 15px",
      width: 290,
      boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
      transform: visible ? "translateY(0)" : "translateY(16px)",
      opacity: visible ? 1 : 0,
      transition: "transform 0.3s ease, opacity 0.3s ease",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
        {cfg.pulse ? (
          <div style={{
            width: 16, height: 16, flexShrink: 0, borderRadius: "50%",
            border: `2px solid ${cfg.color}`,
            borderTopColor: "transparent",
            animation: "scan-spin 0.7s linear infinite",
          }} />
        ) : (
          <div style={{
            width: 16, height: 16, flexShrink: 0, borderRadius: "50%",
            background: "var(--success)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 9, color: "white", fontWeight: 700,
          }}>✓</div>
        )}

        <div style={{ flex: 1 }}>
          <p style={{ fontWeight: 600, fontSize: 12, color: "var(--text-primary)" }}>
            {cfg.label}
          </p>
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
            {scanProgress.done
              ? `${scanProgress.total} files processed`
              : `${scanProgress.current} / ${scanProgress.total > 0 ? scanProgress.total : "?"} files`}
          </p>
        </div>

        {!scanProgress.done && scanProgress.current > 0 && (
          <div style={{
            background: "var(--accent-dim)",
            border: "1px solid var(--accent-border)",
            borderRadius: "var(--radius-sm)",
            padding: "2px 7px",
            fontSize: 11, color: "var(--accent-light)",
            fontFamily: "'Space Mono', monospace", fontWeight: 700,
          }}>
            {pct}%
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div style={{
        background: "var(--bg-muted)", borderRadius: 4,
        height: 4, overflow: "hidden", marginBottom: 7,
      }}>
        <div style={{
          height: "100%", borderRadius: 4,
          background: scanProgress.done
            ? "linear-gradient(to right, var(--accent), var(--success))"
            : "linear-gradient(to right, var(--accent), var(--accent-pink))",
          width: scanProgress.done ? "100%" : scanProgress.total > 0 ? `${pct}%` : "30%",
          transition: "width 0.3s ease",
          animation: !scanProgress.done && scanProgress.total === 0
            ? "indeterminate 1.5s ease-in-out infinite"
            : "none",
        }} />
      </div>

      {/* Current file */}
      {scanProgress.currentFile && !scanProgress.done && (
        <p style={{
          fontSize: 10, color: "var(--text-muted)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          fontFamily: "'Space Mono', monospace",
        }}>
          {scanProgress.currentFile}
        </p>
      )}

      {/* Current folder */}
      {scanProgress.currentFolder && !scanProgress.done && (
        <p style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 2 }}>
          {scanProgress.currentFolder}
        </p>
      )}

      <style>{`
        @keyframes scan-spin { to { transform: rotate(360deg); } }
        @keyframes indeterminate {
          0%   { transform: translateX(-100%); width: 40%; }
          100% { transform: translateX(350%); width: 40%; }
        }
      `}</style>
    </div>
  );
}

// ── Empty Library State ────────────────────────────────────────────────────────
export function EmptyLibraryState({
  onScanFolder, onAddFiles,
}: {
  onScanFolder: () => void;
  onAddFiles: () => void;
}) {
  return (
    <div style={{
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      height: "100%", gap: 0, padding: 40,
    }}>
      <div style={{
        width: 80, height: 80, borderRadius: "var(--radius-xl)",
        background: "linear-gradient(135deg, var(--accent-dim), rgba(236,72,153,0.1))",
        border: "1px solid var(--accent-border)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 36, marginBottom: 22,
        animation: "float 3s ease-in-out infinite",
      }}>
        ♪
      </div>

      <h2 style={{
        fontWeight: 700, fontSize: 19,
        color: "var(--text-primary)", letterSpacing: "-0.4px",
        marginBottom: 8, textAlign: "center",
      }}>
        Library is empty
      </h2>

      <p style={{
        fontSize: 13, color: "var(--text-muted)",
        textAlign: "center", lineHeight: 1.7, maxWidth: 320, marginBottom: 28,
      }}>
        Add your music to get started. Resonance supports MP3, FLAC, WAV, OGG, and more.
      </p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
        <button
          onClick={onScanFolder}
          style={{
            padding: "10px 22px", borderRadius: "var(--radius-lg)", fontSize: 13,
            fontWeight: 600,
            background: "var(--accent-dim)",
            border: "1px solid var(--accent-border)",
            color: "var(--accent-light)",
            cursor: "pointer", fontFamily: "inherit",
            display: "flex", alignItems: "center", gap: 7, transition: "all 0.2s",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = "var(--accent)";
            e.currentTarget.style.color = "white";
            e.currentTarget.style.borderColor = "var(--accent)";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = "var(--accent-dim)";
            e.currentTarget.style.color = "var(--accent-light)";
            e.currentTarget.style.borderColor = "var(--accent-border)";
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 4.5A1.5 1.5 0 012.5 3h3l2 2h6A1.5 1.5 0 0115 6.5v6a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12V4.5z"/>
          </svg>
          Scan folder
        </button>

        <button
          onClick={onAddFiles}
          style={{
            padding: "10px 22px", borderRadius: "var(--radius-lg)", fontSize: 13,
            fontWeight: 600,
            background: "transparent",
            border: "1px solid var(--border-medium)",
            color: "var(--text-secondary)",
            cursor: "pointer", fontFamily: "inherit",
            display: "flex", alignItems: "center", gap: 7, transition: "all 0.2s",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = "var(--accent-border)";
            e.currentTarget.style.color = "var(--accent-light)";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = "var(--border-medium)";
            e.currentTarget.style.color = "var(--text-secondary)";
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M8 3v10M3 8h10"/>
          </svg>
          Add files
        </button>
      </div>

      <div style={{ marginTop: 28, display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "center" }}>
        {["MP3","FLAC","WAV","OGG","AAC","ALAC","OPUS"].map(f => (
          <span key={f} style={{
            fontSize: 10, padding: "2px 7px", borderRadius: 4,
            background: "var(--bg-overlay)",
            color: "var(--text-muted)",
            border: "1px solid var(--border)",
            fontFamily: "monospace",
          }}>
            {f}
          </span>
        ))}
      </div>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50%       { transform: translateY(-8px); }
        }
      `}</style>
    </div>
  );
}