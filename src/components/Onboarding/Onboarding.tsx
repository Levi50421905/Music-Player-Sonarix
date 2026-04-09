/**
 * Onboarding.tsx — First Launch Experience
 *
 * WHY onboarding:
 *   User pertama kali buka app tidak tahu harus ngapain.
 *   Onboarding membimbing mereka: pilih folder musik → scan →
 *   lihat library → mulai dengarkan.
 *
 * FLOW:
 *   Step 1 → Welcome (animasi logo)
 *   Step 2 → Pilih folder musik (bisa multiple)
 *   Step 3 → Scanning progress (real-time)
 *   Step 4 → Done! tampilkan summary → masuk app
 *
 * PERSISTENCE:
 *   Setelah selesai, simpan flag "onboarded: true" ke SQLite settings.
 *   Cek di App.tsx saat startup — skip onboarding jika sudah pernah.
 */

import { useState, useEffect, useCallback } from "react";
import { scanFolder } from "../../lib/scanner";
import { getDb, setSetting } from "../../lib/db";
import type { Song } from "../../lib/db";

interface Props {
  onComplete: (songs: Song[]) => void;
}

type Step = "welcome" | "pick" | "scan" | "done";

export default function Onboarding({ onComplete }: Props) {
  const [step, setStep] = useState<Step>("welcome");
  const [songs, setSongs] = useState<Song[]>([]);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0, file: "" });
  const [mounted, setMounted] = useState(false);

  // Entrance animation
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
    setSongs(result as Song[]);
  }, []);

  const handleFinish = useCallback(async () => {
    const db = await getDb();
    await setSetting(db, "onboarded", "true");
    onComplete(songs);
  }, [songs, onComplete]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 500,
      background: "#070710",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'DM Sans', sans-serif",
      overflow: "hidden",
    }}>
      {/* Animated background orbs */}
      <Orbs />

      {/* Card */}
      <div style={{
        width: 480, background: "rgba(13,13,31,0.9)",
        border: "1px solid rgba(124,58,237,0.3)",
        borderRadius: 20, overflow: "hidden",
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
              height: 6, borderRadius: 3,
              background: s === step ? "#7C3AED"
                : (["welcome","pick","scan","done"].indexOf(step) > i) ? "rgba(124,58,237,0.4)"
                : "#2a2a3e",
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
      {/* Animated logo */}
      <div style={{
        width: 80, height: 80, margin: "0 auto 28px",
        borderRadius: 20,
        background: "linear-gradient(135deg, #7C3AED, #EC4899)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 36,
        transform: logoVisible ? "scale(1) rotate(0deg)" : "scale(0.5) rotate(-20deg)",
        opacity: logoVisible ? 1 : 0,
        transition: "all 0.6s cubic-bezier(0.34,1.56,0.64,1)",
        boxShadow: "0 0 40px rgba(124,58,237,0.5), 0 0 80px rgba(236,72,153,0.2)",
      }}>♪</div>

      <h1 style={{
        fontWeight: 800, fontSize: 28,
        letterSpacing: "-0.8px", marginBottom: 10,
        background: "linear-gradient(135deg, #f1f5f9, #a78bfa)",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
      }}>
        Welcome to Resonance
      </h1>

      <p style={{ color: "#9ca3af", fontSize: 14, lineHeight: 1.7, marginBottom: 32 }}>
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
            padding: "10px 16px", background: "rgba(255,255,255,0.03)",
            borderRadius: 10, border: "1px solid #1a1a2e",
            width: "100%", textAlign: "left",
          }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>{f.icon}</span>
            <span style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.4 }}>{f.text}</span>
          </div>
        ))}
      </div>

      <button onClick={onNext} style={primaryBtn}>
        Mulai Setup →
      </button>
    </div>
  );
}

// ── Step 2: Pick Folder ───────────────────────────────────────────────────────
function StepPick({ onScan }: { onScan: () => void }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 52, marginBottom: 16 }}>📁</div>
      <h2 style={{ fontWeight: 700, fontSize: 22, letterSpacing: "-0.5px", marginBottom: 10 }}>
        Pilih Folder Musik
      </h2>
      <p style={{ color: "#9ca3af", fontSize: 13, lineHeight: 1.7, marginBottom: 32 }}>
        Resonance akan scan semua file audio di dalam folder<br />
        yang kamu pilih, termasuk subfolder.
      </p>

      <div style={{
        background: "rgba(124,58,237,0.08)", border: "1px dashed rgba(124,58,237,0.4)",
        borderRadius: 12, padding: 20, marginBottom: 28,
      }}>
        <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>Format yang didukung:</p>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
          {["MP3","FLAC","WAV","OGG","AAC","ALAC","M4A","OPUS","APE","WMA"].map(f => (
            <span key={f} style={{
              fontSize: 10, padding: "3px 8px", borderRadius: 4,
              background: "#1a1a2e", color: "#9ca3af",
              fontFamily: "Space Mono, monospace",
            }}>{f}</span>
          ))}
        </div>
      </div>

      <button onClick={onScan} style={primaryBtn}>
        📁 Pilih Folder & Mulai Scan
      </button>

      <p style={{ fontSize: 11, color: "#4b5563", marginTop: 12 }}>
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
        background: "linear-gradient(135deg, #7C3AED, #EC4899)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 24,
        animation: "spin 1.5s linear infinite",
      }}>♪</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <h2 style={{ fontWeight: 700, fontSize: 20, letterSpacing: "-0.4px", marginBottom: 6 }}>
        Scanning Folder...
      </h2>
      <p style={{ color: "#6b7280", fontSize: 12, marginBottom: 24 }}>
        {progress.current} / {progress.total > 0 ? progress.total : "?"} files
      </p>

      {/* Progress bar */}
      <div style={{ background: "#1a1a2e", borderRadius: 8, height: 6, overflow: "hidden", marginBottom: 12 }}>
        <div style={{
          height: "100%", borderRadius: 8,
          background: "linear-gradient(to right, #7C3AED, #EC4899)",
          width: `${pct}%`, transition: "width 0.3s ease",
        }} />
      </div>

      {progress.file && (
        <p style={{
          fontSize: 10, color: "#4b5563",
          fontFamily: "Space Mono, monospace",
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

  const lossless = songs.filter(s => ["FLAC","WAV","ALAC","APE"].includes(s.format?.toUpperCase())).length;

  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 52, marginBottom: 16 }}>🎉</div>
      <h2 style={{ fontWeight: 700, fontSize: 22, letterSpacing: "-0.5px", marginBottom: 8 }}>
        Library Siap!
      </h2>
      <p style={{ color: "#9ca3af", fontSize: 13, marginBottom: 28 }}>
        Berhasil menemukan <strong style={{ color: "#a78bfa" }}>{songs.length}</strong> lagu
      </p>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 28 }}>
        {[
          { label: "Total Tracks", value: songs.length, icon: "🎵" },
          { label: "Lossless", value: lossless, icon: "💎" },
          { label: "Formats", value: Object.keys(formats).length, icon: "📀" },
        ].map(stat => (
          <div key={stat.label} style={{
            background: "rgba(124,58,237,0.08)",
            border: "1px solid rgba(124,58,237,0.2)",
            borderRadius: 10, padding: "14px 8px",
          }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>{stat.icon}</div>
            <div style={{ fontWeight: 700, fontSize: 22, color: "#a78bfa" }}>{stat.value}</div>
            <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Format breakdown */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", marginBottom: 28 }}>
        {Object.entries(formats).sort(([,a],[,b]) => b-a).map(([fmt, count]) => (
          <span key={fmt} style={{
            fontSize: 11, padding: "4px 10px", borderRadius: 20,
            background: "#1a1a2e", color: "#9ca3af",
            fontFamily: "Space Mono, monospace",
          }}>
            {fmt} ×{count}
          </span>
        ))}
      </div>

      <button onClick={onFinish} style={primaryBtn}>
        Buka Library →
      </button>
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const primaryBtn: React.CSSProperties = {
  marginTop: 24, width: "100%", padding: "13px",
  borderRadius: 10, fontSize: 14, fontWeight: 600,
  background: "linear-gradient(135deg, #7C3AED, #EC4899)",
  border: "none", color: "white", cursor: "pointer",
  fontFamily: "inherit", letterSpacing: "-0.2px",
  boxShadow: "0 4px 20px rgba(124,58,237,0.4)",
  transition: "transform 0.15s, box-shadow 0.15s",
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
        { w:400, h:400, x:-100, y:-100, c:"#7C3AED", a:"float1 8s ease-in-out infinite" },
        { w:300, h:300, x:"60%", y:"50%", c:"#EC4899", a:"float2 10s ease-in-out infinite 2s" },
        { w:250, h:250, x:"40%", y:"-10%", c:"#3B82F6", a:"float3 7s ease-in-out infinite 4s" },
      ].map((o,i) => (
        <div key={i} style={{
          position: "absolute", left: o.x, top: o.y,
          width: o.w, height: o.h, borderRadius: "50%",
          background: o.c, opacity: 0.06,
          filter: "blur(80px)",
          animation: o.a,
        }} />
      ))}
    </div>
  );
}