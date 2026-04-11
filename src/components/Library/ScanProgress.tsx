/**
 * ScanProgress.tsx — v3 (contrast & spinner fixes)
 *
 * FIXES:
 *   - Scan icon: emoji 🔍 spin → CSS div spinner (renders consistently on all OS/fonts)
 *   - "files" count text: #6b7280 already ok, kept
 *   - currentFile / currentFolder: #4b5563 → #6b7280
 */

import { useEffect, useState } from "react";
import { useLibraryStore } from "../../store";

export default function ScanProgress() {
  const { scanProgress } = useLibraryStore();
  const [visible, setVisible] = useState(false);
  const [justDone, setJustDone] = useState(false);

  useEffect(() => {
    if (scanProgress && !scanProgress.done) {
      setVisible(true);
      setJustDone(false);
    } else if (scanProgress?.done) {
      setJustDone(true);
      const t = setTimeout(() => {
        setVisible(false);
        setJustDone(false);
      }, 3000);
      return () => clearTimeout(t);
    }
  }, [scanProgress]);

  if (!visible && !justDone) return null;
  if (!scanProgress) return null;

  const pct = scanProgress.total > 0
    ? Math.round((scanProgress.current / scanProgress.total) * 100)
    : 0;

  const phase = scanProgress.phase ?? (
    scanProgress.done ? "completed" : "scanning"
  );

  const phaseConfig = {
    scanning: {
      label: "Scanning folder...",
      color: "#7C3AED",
      pulse: true,
    },
    indexing: {
      label: "Indexing files...",
      color: "#3B82F6",
      pulse: true,
    },
    completed: {
      label: "Scan complete!",
      color: "#10B981",
      pulse: false,
    },
  }[phase] ?? {
    label: "Scanning...",
    color: "#7C3AED",
    pulse: true,
  };

  return (
    <div style={{
      position: "fixed",
      bottom: 100,
      left: 20,
      zIndex: 200,
      background: "#0d0d1f",
      border: `1px solid ${phaseConfig.color}60`,
      borderRadius: 14,
      padding: "14px 16px",
      width: 300,
      boxShadow: `0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px ${phaseConfig.color}20`,
      transform: visible ? "translateY(0)" : "translateY(16px)",
      opacity: visible ? 1 : 0,
      transition: "transform 0.3s ease, opacity 0.3s ease",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>

        {/* FIX: CSS spinner instead of spinning emoji (unreliable on Windows) */}
        {phaseConfig.pulse ? (
          <div style={{
            width: 18, height: 18, flexShrink: 0,
            borderRadius: "50%",
            border: `2px solid ${phaseConfig.color}`,
            borderTopColor: "transparent",
            animation: "scan-spin 0.7s linear infinite",
          }} />
        ) : (
          <div style={{
            width: 18, height: 18, flexShrink: 0,
            borderRadius: "50%",
            background: "#10B981",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, color: "white", fontWeight: 700,
          }}>✓</div>
        )}

        <div style={{ flex: 1 }}>
          <p style={{ fontWeight: 600, fontSize: 13, color: "#e2e8f0" }}>
            {phaseConfig.label}
          </p>
          <p style={{ fontSize: 11, color: "#6b7280", marginTop: 1 }}>
            {scanProgress.done
              ? `${scanProgress.total} files processed`
              : `${scanProgress.current} / ${scanProgress.total > 0 ? scanProgress.total : "?"} files`
            }
          </p>
        </div>

        {!scanProgress.done && scanProgress.current > 0 && (
          <div style={{
            background: `${phaseConfig.color}20`,
            border: `1px solid ${phaseConfig.color}40`,
            borderRadius: 8,
            padding: "2px 8px",
            fontSize: 11,
            color: phaseConfig.color,
            fontFamily: "monospace",
            fontWeight: 700,
          }}>
            {pct}%
          </div>
        )}
      </div>

      {/* Progress bar */}
      {!scanProgress.done && (
        <div style={{
          background: "#2a2a3e",
          borderRadius: 6,
          height: 5,
          overflow: "hidden",
          marginBottom: 8,
        }}>
          <div style={{
            height: "100%",
            borderRadius: 6,
            background: `linear-gradient(to right, ${phaseConfig.color}, #EC4899)`,
            width: scanProgress.total > 0 ? `${pct}%` : "30%",
            transition: "width 0.3s ease",
            animation: scanProgress.total === 0 ? "indeterminate 1.5s ease-in-out infinite" : "none",
          }} />
        </div>
      )}

      {scanProgress.done && (
        <div style={{
          background: "#2a2a3e",
          borderRadius: 6,
          height: 5,
          overflow: "hidden",
          marginBottom: 8,
        }}>
          <div style={{
            height: "100%",
            borderRadius: 6,
            background: `linear-gradient(to right, #10B981, #06B6D4)`,
            width: "100%",
            transition: "width 0.5s ease",
          }} />
        </div>
      )}

      {/* Current file — FIX: #4b5563 → #6b7280 */}
      {scanProgress.currentFile && !scanProgress.done && (
        <p style={{
          fontSize: 10,
          color: "#6b7280",          /* FIX */
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          fontFamily: "monospace",
        }}>
          {scanProgress.currentFile}
        </p>
      )}

      {/* Folder info — FIX: #3f3f5a → #6b7280 */}
      {scanProgress.currentFolder && !scanProgress.done && (
        <p style={{
          fontSize: 10,
          color: "#6b7280",          /* FIX: was #3f3f5a */
          marginTop: 2,
        }}>
          📁 {scanProgress.currentFolder}
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

// ── Empty Library State ───────────────────────────────────────────────────────
export function EmptyLibraryState({
  onScanFolder,
  onAddFiles,
}: {
  onScanFolder: () => void;
  onAddFiles: () => void;
}) {
  const [hoverScan, setHoverScan] = useState(false);
  const [hoverAdd, setHoverAdd] = useState(false);

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      gap: 0,
      padding: 40,
    }}>
      <div style={{
        width: 88,
        height: 88,
        borderRadius: 24,
        background: "linear-gradient(135deg, rgba(124,58,237,0.15), rgba(236,72,153,0.1))",
        border: "1px solid rgba(124,58,237,0.2)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 40,
        marginBottom: 24,
        animation: "float 3s ease-in-out infinite",
      }}>
        🎵
      </div>

      <h2 style={{
        fontWeight: 700,
        fontSize: 20,
        color: "#e2e8f0",
        letterSpacing: "-0.4px",
        marginBottom: 8,
        textAlign: "center",
      }}>
        Library is empty
      </h2>

      <p style={{
        fontSize: 13,
        color: "#6b7280",
        textAlign: "center",
        lineHeight: 1.7,
        maxWidth: 320,
        marginBottom: 32,
      }}>
        Add your music to get started. Resonance supports MP3, FLAC, WAV, OGG, and more.
      </p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
        <button
          onClick={onScanFolder}
          onMouseEnter={() => setHoverScan(true)}
          onMouseLeave={() => setHoverScan(false)}
          style={{
            padding: "12px 24px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            background: hoverScan
              ? "linear-gradient(135deg, #7C3AED, #EC4899)"
              : "rgba(124,58,237,0.15)",
            border: "1px solid rgba(124,58,237,0.4)",
            color: hoverScan ? "white" : "#a78bfa",
            cursor: "pointer",
            fontFamily: "inherit",
            display: "flex",
            alignItems: "center",
            gap: 8,
            transition: "all 0.2s",
            boxShadow: hoverScan ? "0 4px 20px rgba(124,58,237,0.4)" : "none",
          }}
        >
          <span style={{ fontSize: 16 }}>📁</span>
          Scan Folder
        </button>

        <button
          onClick={onAddFiles}
          onMouseEnter={() => setHoverAdd(true)}
          onMouseLeave={() => setHoverAdd(false)}
          style={{
            padding: "12px 24px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            background: "transparent",
            border: `1px solid ${hoverAdd ? "#7C3AED" : "#2a2a3e"}`,
            color: hoverAdd ? "#a78bfa" : "#6b7280",
            cursor: "pointer",
            fontFamily: "inherit",
            display: "flex",
            alignItems: "center",
            gap: 8,
            transition: "all 0.2s",
          }}
        >
          <span style={{ fontSize: 16 }}>➕</span>
          Add Files
        </button>
      </div>

      <div style={{ marginTop: 32, display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
        {["MP3", "FLAC", "WAV", "OGG", "AAC", "ALAC", "OPUS"].map((fmt) => (
          <span key={fmt} style={{
            fontSize: 10,
            padding: "2px 8px",
            borderRadius: 4,
            background: "#1a1a2e",
            color: "#6b7280",         /* FIX: was #4b5563 */
            fontFamily: "monospace",
          }}>
            {fmt}
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