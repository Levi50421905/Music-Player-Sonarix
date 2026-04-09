/**
 * ScanProgress.tsx — Scan folder progress overlay
 * Muncul sebagai floating card saat sedang scan folder musik
 */

import { useLibraryStore } from "../../store";

export default function ScanProgress() {
  const { scanProgress } = useLibraryStore();
  if (!scanProgress || scanProgress.done) return null;

  const pct = scanProgress.total > 0
    ? Math.round((scanProgress.current / scanProgress.total) * 100)
    : 0;

  return (
    <div style={{
      position: "fixed", bottom: 96, right: 20, zIndex: 200,
      background: "#1a1a2e", border: "1px solid #7C3AED",
      borderRadius: 12, padding: 16, width: 280,
      boxShadow: "0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(124,58,237,0.3)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 18 }}>🔍</span>
        <div>
          <p style={{ fontWeight: 600, fontSize: 13 }}>Scanning folder...</p>
          <p style={{ fontSize: 11, color: "#6b7280" }}>
            {scanProgress.current} / {scanProgress.total} files
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ background: "#2a2a3e", borderRadius: 4, height: 4, overflow: "hidden" }}>
        <div style={{
          height: "100%", borderRadius: 4,
          background: "linear-gradient(to right, #7C3AED, #EC4899)",
          width: `${pct}%`,
          transition: "width 0.3s ease",
        }} />
      </div>

      {/* Current file */}
      {scanProgress.currentFile && (
        <p style={{
          fontSize: 10, color: "#6b7280", marginTop: 8,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          fontFamily: "monospace",
        }}>
          {scanProgress.currentFile}
        </p>
      )}
    </div>
  );
}