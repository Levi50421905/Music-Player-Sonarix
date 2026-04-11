/**
 * PlayerBarV2.tsx — v5
 *
 * TAMBAHAN vs v4:
 *   [NEW] Playback speed control (0.5× – 2×) di sebelah repeat button
 *         Menggunakan HTMLAudioElement.playbackRate
 *   Props baru: playbackSpeed, onSpeedChange
 */

import { useCallback, useRef, useState } from "react";
import { usePlayerStore, useSettingsStore } from "../../store";
import { audioEngine }     from "../../lib/audioEngine";
import type { PreloadState } from "../../lib/audioEngine";
import CoverArt            from "../CoverArt";
import WaveformSeekbar     from "../Waveform/WaveformSeekbar";
import StarRating          from "../StarRating";

interface Props {
  onPlayPause:   () => void;
  onNext:        () => void;
  onPrev:        () => void;
  onRating:      (songId: number, stars: number) => void;
  preloadState?: PreloadState;
  playbackSpeed?: number;           // [NEW]
  onSpeedChange?: (s: number) => void; // [NEW]
}

const fmt = (s: number) => {
  if (!s || !isFinite(s)) return "0:00";
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};

// ─── Speed presets ─────────────────────────────────────────────────────────────
const SPEED_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

function SpeedControl({
  speed,
  onChange,
}: {
  speed: number;
  onChange: (s: number) => void;
}) {
  const [open, setOpen] = useState(false);

  const label = speed === 1 ? "1×" : `${speed}×`;
  const isActive = speed !== 1;

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title={`Kecepatan putar: ${label}`}
        style={{
          height: 28,
          padding: "0 8px",
          borderRadius: 6,
          border: `1px solid ${isActive ? "rgba(124,58,237,0.5)" : "rgba(255,255,255,0.08)"}`,
          background: isActive ? "rgba(124,58,237,0.15)" : "transparent",
          color: isActive ? "#a78bfa" : "#6b7280",
          cursor: "pointer",
          fontSize: 11,
          fontFamily: "Space Mono, monospace",
          fontWeight: isActive ? 700 : 400,
          transition: "all 0.18s",
          display: "flex",
          alignItems: "center",
          gap: 3,
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "#e2e8f0";
          e.currentTarget.style.borderColor = "rgba(124,58,237,0.5)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = isActive ? "#a78bfa" : "#6b7280";
          e.currentTarget.style.borderColor = isActive
            ? "rgba(124,58,237,0.5)"
            : "rgba(255,255,255,0.08)";
        }}
      >
        <span style={{ fontSize: 9, opacity: 0.7 }}>▶▶</span>
        {label}
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            style={{ position: "fixed", inset: 0, zIndex: 99 }}
            onClick={() => setOpen(false)}
          />
          {/* Dropdown */}
          <div
            style={{
              position: "absolute",
              bottom: "calc(100% + 8px)",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 100,
              background: "#13132a",
              border: "1px solid #2a2a3e",
              borderRadius: 10,
              padding: "8px",
              boxShadow: "0 12px 40px rgba(0,0,0,0.7)",
              display: "flex",
              flexDirection: "column",
              gap: 3,
              minWidth: 90,
            }}
          >
            <p style={{
              fontSize: 9,
              color: "#6b7280",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              fontWeight: 700,
              textAlign: "center",
              marginBottom: 4,
              paddingBottom: 6,
              borderBottom: "1px solid #1f1f35",
            }}>
              Kecepatan
            </p>
            {SPEED_PRESETS.map((preset) => (
              <button
                key={preset}
                onClick={() => {
                  onChange(preset);
                  setOpen(false);
                }}
                style={{
                  width: "100%",
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "none",
                  background: speed === preset
                    ? "rgba(124,58,237,0.2)"
                    : "transparent",
                  color: speed === preset ? "#a78bfa" : "#9ca3af",
                  cursor: "pointer",
                  fontSize: 12,
                  fontFamily: "Space Mono, monospace",
                  fontWeight: speed === preset ? 700 : 400,
                  textAlign: "center",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => {
                  if (speed !== preset)
                    e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                }}
                onMouseLeave={(e) => {
                  if (speed !== preset)
                    e.currentTarget.style.background = "transparent";
                }}
              >
                {preset === 1 ? "Normal (1×)" : `${preset}×`}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── SVG icon set ─────────────────────────────────────────────────────────────
function IconPrev() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/>
    </svg>
  );
}
function IconNext() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/>
    </svg>
  );
}
function IconPlay() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5 3 19 12 5 21 5 3"/>
    </svg>
  );
}
function IconPause() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
    </svg>
  );
}
function IconVolume({ level }: { level: number }) {
  if (level === 0) return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
    </svg>
  );
  if (level < 40) return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
    </svg>
  );
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
    </svg>
  );
}
function IconShuffle({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? "2.5" : "2"} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 3 21 3 21 8"/>
      <line x1="4" y1="20" x2="21" y2="3"/>
      <polyline points="21 16 21 21 16 21"/>
      <line x1="15" y1="15" x2="21" y2="21"/>
      <line x1="4" y1="4" x2="9" y2="9"/>
    </svg>
  );
}
function IconRepeatAll() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9"/>
      <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
      <polyline points="7 23 3 19 7 15"/>
      <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
    </svg>
  );
}
function IconRepeatOne() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9"/>
      <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
      <polyline points="7 23 3 19 7 15"/>
      <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
      <line x1="12" y1="20" x2="12" y2="14"/>
      <polyline points="10 16 12 14 14 16"/>
    </svg>
  );
}

function RepeatButton({ repeat, onClick }: { repeat: "off"|"one"|"all"; onClick: () => void }) {
  const cfg = {
    off: { icon: <IconRepeatAll />, label: "Repeat Nonaktif",  color: "#4b5563", bg: "transparent",           border: "1px solid transparent",          opacity: 0.35 },
    all: { icon: <IconRepeatAll />, label: "Repeat Semua",     color: "#a78bfa", bg: "rgba(124,58,237,0.18)", border: "1px solid rgba(124,58,237,0.4)", opacity: 1 },
    one: { icon: <IconRepeatOne />, label: "Repeat Satu",      color: "#EC4899", bg: "rgba(236,72,153,0.18)", border: "1px solid rgba(236,72,153,0.4)", opacity: 1 },
  }[repeat];

  return (
    <button
      onClick={onClick}
      title={cfg.label}
      style={{
        width: 44, height: 44, borderRadius: 8, border: cfg.border,
        background: cfg.bg, color: cfg.color, opacity: cfg.opacity,
        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 0.18s cubic-bezier(0.34,1.56,0.64,1)", flexShrink: 0, position: "relative",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.opacity = "1";
        e.currentTarget.style.transform = "scale(1.1)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.opacity = String(cfg.opacity);
        e.currentTarget.style.transform = "scale(1)";
      }}
      onMouseDown={e => { e.currentTarget.style.transform = "scale(0.93)"; }}
      onMouseUp={e => { e.currentTarget.style.transform = "scale(1.1)"; }}
    >
      {cfg.icon}
      {repeat === "one" && (
        <span style={{
          position: "absolute", top: -4, right: -4,
          width: 13, height: 13, borderRadius: "50%",
          background: "#EC4899", color: "white",
          fontSize: 7, fontWeight: 700, fontFamily: "monospace",
          display: "flex", alignItems: "center", justifyContent: "center",
          border: "1.5px solid #07071a",
        }}>1</span>
      )}
    </button>
  );
}

function CtrlBtn({ children, onClick, active = false, title, size = 44, dim = false }: {
  children: React.ReactNode; onClick: () => void;
  active?: boolean; title?: string; size?: number; dim?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: size, height: size, borderRadius: 8,
        background: active ? "rgba(124,58,237,0.18)" : "none",
        border:     active ? "1px solid rgba(124,58,237,0.35)" : "1px solid transparent",
        color:      active ? "#a78bfa" : dim ? "#3f3f5a" : "#6b7280",
        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        transition: "color 0.18s, background 0.18s, border-color 0.18s, transform 0.1s",
        flexShrink: 0,
        position: "relative",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.color     = active ? "#c4b5fd" : "#e2e8f0";
        e.currentTarget.style.transform = "scale(1.1)";
        if (active) e.currentTarget.style.boxShadow = "0 0 12px rgba(124,58,237,0.3)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.color     = active ? "#a78bfa" : dim ? "#3f3f5a" : "#6b7280";
        e.currentTarget.style.transform = "scale(1)";
        e.currentTarget.style.boxShadow = "none";
      }}
      onMouseDown={e => { e.currentTarget.style.transform = "scale(0.93)"; }}
      onMouseUp={e => { e.currentTarget.style.transform = "scale(1.1)"; }}
    >{children}</button>
  );
}

function ShuffleBtn({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={active ? "Shuffle Aktif" : "Shuffle Nonaktif"}
      style={{
        width: 44, height: 44, borderRadius: 8, border: "1px solid transparent",
        background: active ? "rgba(124,58,237,0.18)" : "none",
        borderColor: active ? "rgba(124,58,237,0.35)" : "transparent",
        color: active ? "#a78bfa" : "#6b7280",
        cursor: "pointer", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 3,
        transition: "color 0.18s, background 0.18s, border-color 0.18s, transform 0.1s",
        flexShrink: 0, position: "relative",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.color     = active ? "#c4b5fd" : "#e2e8f0";
        e.currentTarget.style.transform = "scale(1.1)";
        if (active) e.currentTarget.style.boxShadow = "0 0 12px rgba(124,58,237,0.3)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.color     = active ? "#a78bfa" : "#6b7280";
        e.currentTarget.style.transform = "scale(1)";
        e.currentTarget.style.boxShadow = "none";
      }}
      onMouseDown={e => { e.currentTarget.style.transform = "scale(0.93)"; }}
      onMouseUp={e => { e.currentTarget.style.transform = "scale(1.1)"; }}
    >
      <IconShuffle active={active} />
      <span style={{
        width: 4, height: 4, borderRadius: "50%",
        background: active ? "#a78bfa" : "transparent",
        transition: "background 0.2s, transform 0.2s",
        transform: active ? "scale(1)" : "scale(0)",
        position: "absolute",
        bottom: 6,
      }} />
    </button>
  );
}

function PreloadDot({ state }: { state: PreloadState }) {
  if (!state) return null;
  const isLoading = state === "loading";
  const label     = isLoading ? "Buffering lagu berikutnya…" : "Lagu berikutnya siap diputar";
  const color     = isLoading ? "#F59E0B" : "#10B981";

  return (
    <span
      title={label}
      aria-label={label}
      style={{ display: "inline-flex", alignItems: "center", flexShrink: 0, cursor: "default" }}
    >
      <span style={{
        display: "inline-block",
        width: 7, height: 7, borderRadius: "50%",
        background: color,
        boxShadow: isLoading ? "0 0 6px rgba(245,158,11,0.9)" : "0 0 6px rgba(16,185,129,0.9)",
        animation: isLoading ? "dot-pulse 1s ease-in-out infinite" : "none",
        transition: "background 0.3s, box-shadow 0.3s",
      }} />
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function PlayerBarV2({
  onPlayPause, onNext, onPrev, onRating, preloadState,
  playbackSpeed = 1,
  onSpeedChange,
}: Props) {
  const {
    currentSong, isPlaying, progress, currentTime, duration,
    volume, shuffle, repeat, queue,
    setVolume, toggleShuffle, cycleRepeat,
  } = usePlayerStore();

  const [useWaveform, setUseWaveform] = useState(true);
  const [hoverTime, setHoverTime]     = useState<string | null>(null);
  const [hoverPct, setHoverPct]       = useState(0);
  const progressBarRef = useRef<HTMLDivElement>(null);

  const handleBarSeek = useCallback((e: React.MouseEvent) => {
    const bar = progressBarRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    audioEngine.seekPercent(
      Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * 100
    );
  }, []);

  const handleBarHover = useCallback((e: React.MouseEvent) => {
    const bar = progressBarRef.current;
    if (!bar || !duration) return;
    const rect = bar.getBoundingClientRect();
    const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverPct(pct * 100);
    setHoverTime(fmt(pct * duration));
  }, [duration]);

  const handleWaveSeek = useCallback((pct: number) => {
    audioEngine.seekPercent(pct);
  }, []);

  const queueCount = Array.isArray(queue) ? queue.length : 0;
  const ct  = currentTime || audioEngine.currentTime;
  const dur = duration    || audioEngine.duration;

  const handleVolumeChange = useCallback((v: number) => {
    setVolume(v);
    audioEngine.setVolume(v);
  }, [setVolume]);

  const muteTooltip = volume === 0
    ? "Muted — klik untuk unmute"
    : "Klik untuk mute";

  return (
    <div style={{
      background: "linear-gradient(to top, #070714 0%, #0c0c1e 100%)",
      borderTop: "1px solid rgba(124,58,237,0.15)",
      backdropFilter: "blur(32px)",
      flexShrink: 0,
      userSelect: "none",
      boxShadow: "0 -4px 32px rgba(0,0,0,0.5)",
    }}>

      {/* ── Waveform / progress bar ── */}
      <div style={{ height: 48, position: "relative" }}>
        {useWaveform && currentSong ? (
          <WaveformSeekbar
            filePath={currentSong.path}
            progress={progress}
            onSeek={handleWaveSeek}
            height={48}
            barCount={200}
          />
        ) : (
          <div
            ref={progressBarRef}
            onClick={handleBarSeek}
            onMouseMove={handleBarHover}
            onMouseLeave={() => setHoverTime(null)}
            style={{
              height: "100%", cursor: "pointer", background: "#070714",
              position: "relative", display: "flex", alignItems: "center",
            }}
          >
            <div style={{
              position: "absolute", left: 0, right: 0, height: 3,
              background: "#1a1a2e", top: "50%", transform: "translateY(-50%)",
            }}>
              <div style={{
                position: "absolute", inset: 0, width: `${progress}%`,
                background: "linear-gradient(to right, var(--accent,#7C3AED), #EC4899)",
                transition: "width 0.4s linear",
              }} />
              {progress > 0 && (
                <div style={{
                  position: "absolute", top: "50%", left: `${progress}%`,
                  transform: "translate(-50%,-50%)", width: 10, height: 10,
                  borderRadius: "50%", background: "white",
                  boxShadow: "0 0 8px rgba(124,58,237,0.9)",
                }} />
              )}
            </div>
            {hoverTime && (
              <div style={{
                position: "absolute", bottom: "calc(100% + 6px)",
                left: `${hoverPct}%`, transform: "translateX(-50%)",
                background: "#1a1a2e", border: "1px solid #3f3f5a",
                borderRadius: 5, padding: "2px 7px",
                fontSize: 10, color: "#e2e8f0",
                fontFamily: "Space Mono, monospace",
                pointerEvents: "none", whiteSpace: "nowrap",
              }}>{hoverTime}</div>
            )}
          </div>
        )}
      </div>

      {/* ── Controls row ── */}
      <div style={{
        height: 76, display: "flex", alignItems: "center",
        padding: "0 24px", gap: 0,
      }}>

        {/* ── Kiri: Info lagu ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          width: 270, flexShrink: 0, minWidth: 0,
        }}>
          {currentSong ? (
            <>
              <div style={{ position: "relative", flexShrink: 0 }}>
                <CoverArt id={currentSong.id} coverArt={currentSong.cover_art} size={46} />
                {isPlaying && (
                  <>
                    <div style={{
                      position: "absolute", inset: -2, borderRadius: 9,
                      border: "2px solid rgba(124,58,237,0.7)",
                      animation: "ring-pulse 2s ease-in-out infinite",
                    }} />
                    <div style={{
                      position: "absolute", inset: -5, borderRadius: 12,
                      border: "1px solid rgba(124,58,237,0.25)",
                      animation: "ring-pulse 2s ease-in-out infinite 0.5s",
                    }} />
                  </>
                )}
              </div>
              <div style={{ overflow: "hidden", flex: 1 }}>
                <div style={{
                  fontWeight: 700, fontSize: 13, lineHeight: 1.2,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  color: "#f1f5f9",
                  textShadow: isPlaying ? "0 0 20px rgba(124,58,237,0.4)" : "none",
                  transition: "text-shadow 0.4s",
                }}>{currentSong.title}</div>
                <div style={{
                  fontSize: 11, color: "#6b7280", marginTop: 2,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>{currentSong.artist}</div>
                <div onClick={e => e.stopPropagation()} style={{ marginTop: 4 }}>
                  <StarRating
                    stars={currentSong.stars ?? 0}
                    onChange={s => onRating(currentSong.id, s)}
                    size={10}
                  />
                </div>
              </div>
            </>
          ) : (
            <div style={{ color: "#2a2a3e", fontSize: 12, paddingLeft: 4 }}>
              Tidak ada lagu dipilih
            </div>
          )}
        </div>

        {/* ── Tengah: Controls ── */}
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", gap: 4, minWidth: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <ShuffleBtn active={shuffle} onClick={toggleShuffle} />

            <CtrlBtn onClick={onPrev} title="Sebelumnya (Shift+←)" size={44}>
              <IconPrev />
            </CtrlBtn>

            <button
              onClick={onPlayPause}
              disabled={!currentSong}
              title="Play/Pause (Spasi)"
              style={{
                width: 54, height: 54, borderRadius: "50%",
                background: currentSong
                  ? "linear-gradient(135deg, var(--accent,#7C3AED) 0%, #EC4899 100%)"
                  : "#141426",
                border: "none",
                cursor: currentSong ? "pointer" : "default",
                color: "white",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: currentSong
                  ? isPlaying
                    ? "0 0 0 3px rgba(124,58,237,0.2), 0 0 28px rgba(124,58,237,0.55), 0 4px 12px rgba(0,0,0,0.6)"
                    : "0 0 20px rgba(124,58,237,0.35), 0 4px 12px rgba(0,0,0,0.5)"
                  : "none",
                transition: "background 0.2s, box-shadow 0.2s, transform 0.1s",
                flexShrink: 0,
                animation: isPlaying && currentSong ? "play-glow 2.5s ease-in-out infinite" : "none",
              }}
              onMouseEnter={e => { if (currentSong) e.currentTarget.style.transform = "scale(1.08)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
              onMouseDown={e => { if (currentSong) e.currentTarget.style.transform = "scale(0.93)"; }}
              onMouseUp={e => { if (currentSong) e.currentTarget.style.transform = "scale(1.08)"; }}
            >
              {isPlaying ? <IconPause /> : <IconPlay />}
            </button>

            <CtrlBtn onClick={onNext} title="Berikutnya (Shift+→)" size={44}>
              <IconNext />
            </CtrlBtn>

            <RepeatButton repeat={repeat} onClick={cycleRepeat} />
          </div>

          {/* Waktu + speed + preload */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            fontSize: 10, fontFamily: "Space Mono, monospace",
          }}>
            <span style={{ color: "#9ca3af", minWidth: 32, textAlign: "right" }}>
              {fmt(ct)}
            </span>
            <span style={{ color: "#2a2a3e" }}>·</span>
            <span style={{ color: "#4b5563", minWidth: 32 }}>
              {fmt(dur)}
            </span>

            <PreloadDot state={preloadState ?? null} />

            {/* [NEW] Playback speed control */}
            {onSpeedChange && (
              <SpeedControl speed={playbackSpeed} onChange={onSpeedChange} />
            )}

            <button
              onClick={() => setUseWaveform(v => !v)}
              title={useWaveform ? "Ganti ke progress bar" : "Ganti ke waveform"}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: useWaveform ? "var(--accent,#7C3AED)" : "#2a2a3e",
                fontSize: 12, padding: "1px 3px", transition: "color 0.2s",
              }}
            >{useWaveform ? "〰" : "▬"}</button>
          </div>
        </div>

        {/* ── Kanan: Volume ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          width: 230, flexShrink: 0, justifyContent: "flex-end",
        }}>
          {queueCount > 0 && (
            <span style={{ fontSize: 10, color: "#3f3f5a", fontFamily: "monospace" }}>
              {queueCount} dalam queue
            </span>
          )}

          <button
            onClick={() => handleVolumeChange(volume === 0 ? 80 : 0)}
            title={muteTooltip}
            aria-label={muteTooltip}
            style={{
              background: volume === 0 ? "rgba(239,68,68,0.1)" : "none",
              border: volume === 0 ? "1px solid rgba(239,68,68,0.3)" : "none",
              borderRadius: 6,
              cursor: "pointer",
              color: volume === 0 ? "#f87171" : "#6b7280",
              padding: 4,
              display: "flex", alignItems: "center",
              transition: "color 0.15s, background 0.15s, transform 0.1s",
            }}
            onMouseEnter={e => e.currentTarget.style.color = "#e2e8f0"}
            onMouseLeave={e => e.currentTarget.style.color = volume === 0 ? "#f87171" : "#6b7280"}
            onMouseDown={e => { e.currentTarget.style.transform = "scale(0.9)"; }}
            onMouseUp={e => { e.currentTarget.style.transform = "scale(1)"; }}
          >
            <IconVolume level={volume} />
          </button>

          <div style={{ width: 88, flexShrink: 0 }}>
            <input
              type="range" min={0} max={100} value={volume}
              onChange={e => handleVolumeChange(+e.target.value)}
              style={{
                width: "100%", accentColor: "var(--accent,#7C3AED)",
                cursor: "pointer", display: "block",
              }}
            />
          </div>

          <span style={{
            fontSize: 10, color: "#3f3f5a",
            fontFamily: "Space Mono, monospace",
            width: 24, textAlign: "right", flexShrink: 0,
          }}>
            {volume}
          </span>
        </div>
      </div>

      <style>{`
        @keyframes ring-pulse {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50%       { opacity: 0.8; transform: scale(1.04); }
        }
        @keyframes play-glow {
          0%, 100% { box-shadow: 0 0 0 3px rgba(124,58,237,0.2), 0 0 28px rgba(124,58,237,0.55), 0 4px 12px rgba(0,0,0,0.6); }
          50%       { box-shadow: 0 0 0 5px rgba(124,58,237,0.15), 0 0 40px rgba(124,58,237,0.7), 0 4px 16px rgba(0,0,0,0.6); }
        }
        @keyframes dot-pulse {
          0%, 100% { opacity: 0.5; transform: scale(0.9); }
          50%       { opacity: 1;   transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}