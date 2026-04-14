/**
 * Onboarding.tsx — v2 (Design Fix)
 *
 * PERUBAHAN vs v1:
 *   [FIX] Semua hardcode hex (#070710, #0d0d1f, #9ca3af, #6b7280, #4b5563, #1a1a2e, #a78bfa, dll) → CSS variable
 *   [FIX] Emoji di tombol dihapus (📁 di "Pilih Folder") — tombol pakai SVG icon
 *   [FIX] Emoji dekoratif (🎉 di StepDone, format badges) dipertahankan karena bukan interaktif
 *   [FIX] Progress dots menggunakan accent color via CSS variable
 */

import { useState, useEffect, useCallback } from "react";
import { scanFolder } from "../../lib/scanner";
import { getDb, setSetting } from "../../lib/db";
import type { Song } from "../../lib/db";

interface Props {
  onComplete: (songs: Song[]) => void;
}

type Step = "welcome" | "pick" | "scan" | "done";

function IconFolder() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
    </svg>
  );
}

function IconArrowRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/>
      <polyline points="12 5 19 12 12 19"/>
    </svg>
  );
}

export default function Onboarding({ onComplete }: Props) {
  const [step, setStep] = useState<Step>("welcome");
  const [songs, setSongs] = useState<Song[]>([]);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0, file: "" });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  const handleScan = useCallback(async () => {
    setStep("scan");
    const result = await scanFolder((p) => {
      setScanProgress({ current: p.current, total: p.total, file: p.currentFile });
      if (p.done) setStep("done");
    });
    setSongs(result.songs);
  }, []);

  const handleFinish = useCallback(async () => {
    const db = await getDb();
    await setSetting(db, "onboarded", "true");
    onComplete(songs);
  }, [songs, onComplete]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 500,
      background: "var(--bg-base)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'DM Sans', sans-serif",
      overflow: "hidden",
    }}>
      {/* Animated background orbs */}
      <Orbs />

      {/* Card */}
      <div style={{
        width: 480,
        background: "var(--bg-overlay)",
        border: "1px solid var(--accent-border)",
        borderRadius: "var(--radius-xl)",
        overflow: "hidden",
        boxShadow: "0 32px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(124,58,237,0.1)",
        backdropFilter: "blur(24px)",
        transform: mounted ? "translateY(0) scale(1)" : "translateY(20px) scale(0.97)",
        opacity: mounted ? 1 : 0,
        transition: "transform 0.5s cubic-bezier(0.34,1.56,0.64,1), opacity 0.4s ease",
      }}>
        {/* Progress dots */}
        <div style={{ display: "flex", gap: 6, padding: "20px 24px 0", justifyContent: "center" }}>
          {(["welcome", "pick", "scan", "done"] as Step[]).map((s, i) => (
            <div key={s} style={{
              width: s === step ? 24 : 6,
              height: 6,
              borderRadius: 3,
              background: s === step
                ? "var(--accent)"
                : (["welcome", "pick", "scan", "done"].indexOf(step) > i)
                  ? "var(--accent-border)"
                  : "var(--bg-subtle)",
              transition: "all 0.3s ease",
            }} />
          ))}
        </div>

        {/* Step content */}
        <div style={{ padding: "32px 40px 40px" }}>
          {step === "welcome" && <StepWelcome onNext={() => setStep("pick")} />}
          {step === "pick"    && <StepPick onScan={handleScan} />}
          {step === "scan"    && <StepScan progress={scanProgress} />}
          {step === "done"    && <StepDone songs={songs} onFinish={handleFinish} />}
        </div>
      </div>
    </div>
  );
}

// ── Step 1: Welcome ───────────────────────────────────────────────────────────
function StepWelcome({ onNext }: { onNext: () => void }) {
  const [logoVisible, setLogoVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setLogoVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{ textAlign: "center" }}>
      <div style={{
        width: 80, height: 80, margin: "0 auto 28px",
        borderRadius: "var(--radius-xl)",
        background: "linear-gradient(135deg, var(--accent), var(--accent-pink))",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 36,
        transform: logoVisible ? "scale(1) rotate(0deg)" : "scale(0.5) rotate(-20deg)",
        opacity: logoVisible ? 1 : 0,
        transition: "all 0.6s cubic-bezier(0.34,1.56,0.64,1)",
        boxShadow: "0 0 40px rgba(124,58,237,0.5), 0 0 80px rgba(236,72,153,0.2)",
      }}>
        ♪
      </div>

      <h1 style={{
        fontWeight: 800, fontSize: 28,
        letterSpacing: "-0.8px", marginBottom: 10,
        background: "linear-gradient(135deg, var(--text-primary), var(--accent-light))",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
      }}>
        Welcome to Resonance
      </h1>

      <p style={{ color: "var(--text-muted)", fontSize: 14, lineHeight: 1.7, marginBottom: 32 }}>
        Music player lokal dengan kualitas tinggi.<br />
        Support FLAC, MP3, WAV, dan banyak lagi.
      </p>

      <div style={{ display: "flex", gap: 12, flexDirection: "column", alignItems: "center" }}>
        {[
          { icon: "🎵", text: "Smart shuffle berdasarkan rating & kebiasaan mendengarkan" },
          { icon: "🎚️", text: "Equalizer 10-band & 3 mode visualizer" },
          { icon: "🎤", text: "Lyrics sync otomatis dari file .lrc" },
        ].map(f => (
          <div key={f.text} style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "10px 16px",
            background: "var(--bg-muted)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border)",
            width: "100%", textAlign: "left",
          }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>{f.icon}</span>
            <span style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.4 }}>{f.text}</span>
          </div>
        ))}
      </div>

      <button onClick={onNext} style={primaryBtn}>
        <span>Mulai Setup</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="5" y1="12" x2="19" y2="12"/>
          <polyline points="12 5 19 12 12 19"/>
        </svg>
      </button>
    </div>
  );
}

// ── Step 2: Pick Folder ───────────────────────────────────────────────────────
function StepPick({ onScan }: { onScan: () => void }) {
  return (
    <div style={{ textAlign: "center" }}>
      {/* Ikon folder dekoratif (bukan tombol) */}
      <div style={{
        width: 64, height: 64, margin: "0 auto 16px",
        borderRadius: "var(--radius-xl)",
        background: "var(--accent-dim)",
        border: "1px solid var(--accent-border)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent-light)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
        </svg>
      </div>

      <h2 style={{ fontWeight: 700, fontSize: 22, letterSpacing: "-0.5px", marginBottom: 10, color: "var(--text-primary)" }}>
        Pilih Folder Musik
      </h2>
      <p style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.7, marginBottom: 32 }}>
        Resonance akan scan semua file audio di dalam folder<br />
        yang kamu pilih, termasuk subfolder.
      </p>

      <div style={{
        background: "var(--accent-dim)",
        border: "1px dashed var(--accent-border)",
        borderRadius: "var(--radius-lg)",
        padding: 20, marginBottom: 28,
      }}>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>Format yang didukung:</p>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
          {["MP3", "FLAC", "WAV", "OGG", "AAC", "ALAC", "M4A", "OPUS", "APE", "WMA"].map(f => (
            <span key={f} style={{
              fontSize: 10, padding: "3px 8px", borderRadius: 4,
              background: "var(--bg-muted)",
              color: "var(--text-muted)",
              border: "1px solid var(--border)",
              fontFamily: "'Space Mono', monospace",
            }}>
              {f}
            </span>
          ))}
        </div>
      </div>

      {/* Tombol pakai SVG icon, bukan emoji */}
      <button onClick={onScan} style={primaryBtn}>
        <IconFolder />
        <span>Pilih Folder &amp; Mulai Scan</span>
      </button>

      <p style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 12 }}>
        Kamu bisa menambah folder lain nanti di Settings
      </p>
    </div>
  );
}

// ── Step 3: Scanning ──────────────────────────────────────────────────────────
function StepScan({ progress }: { progress: { current: number; total: number; file: string } }) {
  const pct = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

  return (
    <div style={{ textAlign: "center" }}>
      {/* Spinning disc */}
      <div style={{
        width: 64, height: 64, margin: "0 auto 24px",
        borderRadius: "50%",
        background: "linear-gradient(135deg, var(--accent), var(--accent-pink))",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 24,
        animation: "spin 1.5s linear infinite",
      }}>
        ♪
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <h2 style={{ fontWeight: 700, fontSize: 20, letterSpacing: "-0.4px", marginBottom: 6, color: "var(--text-primary)" }}>
        Scanning Folder...
      </h2>
      <p style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 24 }}>
        {progress.current} / {progress.total > 0 ? progress.total : "?"} files
      </p>

      {/* Progress bar */}
      <div style={{
        background: "var(--bg-muted)",
        borderRadius: "var(--radius-sm)",
        height: 6, overflow: "hidden", marginBottom: 12,
      }}>
        <div style={{
          height: "100%", borderRadius: "var(--radius-sm)",
          background: "linear-gradient(to right, var(--accent), var(--accent-pink))",
          width: `${pct}%`, transition: "width 0.3s ease",
        }} />
      </div>

      {progress.file && (
        <p style={{
          fontSize: 10, color: "var(--text-faint)",
          fontFamily: "'Space Mono', monospace",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {progress.file}
        </p>
      )}
    </div>
  );
}

// ── Step 4: Done ──────────────────────────────────────────────────────────────
function StepDone({ songs, onFinish }: { songs: Song[]; onFinish: () => void }) {
  const formats = songs.reduce((acc, s) => {
    acc[s.format] = (acc[s.format] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const lossless = songs.filter(s => ["FLAC", "WAV", "ALAC", "APE"].includes(s.format?.toUpperCase())).length;

  return (
    <div style={{ textAlign: "center" }}>
      {/* Ikon sukses dekoratif */}
      <div style={{
        width: 64, height: 64, margin: "0 auto 16px",
        borderRadius: "var(--radius-xl)",
        background: "var(--success-dim)",
        border: "1px solid rgba(16,185,129,0.35)",
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28,
      }}>
        🎉
      </div>

      <h2 style={{ fontWeight: 700, fontSize: 22, letterSpacing: "-0.5px", marginBottom: 8, color: "var(--text-primary)" }}>
        Library Siap!
      </h2>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 28 }}>
        Berhasil menemukan <strong style={{ color: "var(--accent-light)" }}>{songs.length}</strong> lagu
      </p>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 28 }}>
        {[
          { label: "Total Tracks", value: songs.length },
          { label: "Lossless",     value: lossless },
          { label: "Formats",      value: Object.keys(formats).length },
        ].map(stat => (
          <div key={stat.label} style={{
            background: "var(--accent-dim)",
            border: "1px solid var(--accent-border)",
            borderRadius: "var(--radius-lg)",
            padding: "14px 8px",
          }}>
            <div style={{ fontWeight: 700, fontSize: 22, color: "var(--accent-light)" }}>{stat.value}</div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Format breakdown */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", marginBottom: 28 }}>
        {Object.entries(formats).sort(([, a], [, b]) => b - a).map(([fmt, count]) => (
          <span key={fmt} style={{
            fontSize: 11, padding: "4px 10px", borderRadius: 20,
            background: "var(--bg-muted)",
            color: "var(--text-muted)",
            border: "1px solid var(--border)",
            fontFamily: "'Space Mono', monospace",
          }}>
            {fmt} ×{count}
          </span>
        ))}
      </div>

      <button onClick={onFinish} style={primaryBtn}>
        <span>Buka Library</span>
        <IconArrowRight />
      </button>
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const primaryBtn: React.CSSProperties = {
  marginTop: 24,
  width: "100%",
  padding: "13px",
  borderRadius: "var(--radius-lg)",
  fontSize: 14,
  fontWeight: 600,
  background: "linear-gradient(135deg, var(--accent), var(--accent-pink))",
  border: "none",
  color: "white",
  cursor: "pointer",
  fontFamily: "inherit",
  letterSpacing: "-0.2px",
  boxShadow: "0 4px 20px rgba(124,58,237,0.4)",
  transition: "transform 0.15s, box-shadow 0.15s",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
};

// ── Background orbs ───────────────────────────────────────────────────────────
function Orbs() {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      <style>{`
        @keyframes float1 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(30px,-20px) scale(1.05); } }
        @keyframes float2 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-20px,30px) scale(0.95); } }
        @keyframes float3 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(15px,25px) scale(1.08); } }
      `}</style>
      {[
        { w: 400, h: 400, x: -100, y: -100, c: "var(--accent)", a: "float1 8s ease-in-out infinite" },
        { w: 300, h: 300, x: "60%", y: "50%", c: "var(--accent-pink)", a: "float2 10s ease-in-out infinite 2s" },
        { w: 250, h: 250, x: "40%", y: "-10%", c: "var(--info)", a: "float3 7s ease-in-out infinite 4s" },
      ].map((o, i) => (
        <div key={i} style={{
          position: "absolute",
          left: o.x as string | number,
          top: o.y as string | number,
          width: o.w,
          height: o.h,
          borderRadius: "50%",
          background: o.c,
          opacity: 0.06,
          filter: "blur(80px)",
          animation: o.a,
        }} />
      ))}
    </div>
  );
}