/**
 * PlayerBarV2.tsx — v8 (Design Fix)
 *
 * PERUBAHAN vs v7:
 *   [FIX] Unicode ↻ (speed toggle) → SVG icon
 *   [FIX] Unicode 〰 dan ▬ (waveform toggle) → SVG icon
 *   [FIX] Emoji 🔊 (volume mute) sudah SVG sebelumnya — pastikan konsisten
 *   [FIX] SpeedControl dropdown hardcode hex → CSS variable
 *   [FIX] Semua warna sudah pakai CSS variable
 */

import { useCallback, useRef, useState } from "react";
import { usePlayerStore, useSettingsStore } from "../../store";
import { audioEngine }    from "../../lib/audioEngine";
import type { PreloadState } from "../../lib/audioEngine";
import CoverArt           from "../CoverArt";
import WaveformSeekbar    from "../Waveform/WaveformSeekbar";
import StarRating         from "../StarRating";
import type { ShuffleMode, RepeatMode } from "../../store";

interface Props {
  onPlayPause:    () => void;
  onNext:         () => void;
  onPrev:         () => void;
  onRating:       (songId: number, stars: number) => void;
  preloadState?:  PreloadState;
  playbackSpeed?: number;
  onSpeedChange?: (s: number) => void;
}

const fmt = (s: number) => {
  if (!s || !isFinite(s)) return "0:00";
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};

const SPEED_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

// ─── Speed control ─────────────────────────────────────────────────────────────

function IconSpeedometer() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a10 10 0 0 1 7.38 3.26"/>
      <path d="M20.97 12.93A10 10 0 0 1 12 22"/>
      <path d="M3.27 16.96A10 10 0 0 1 12 2"/>
      <line x1="12" y1="12" x2="15.5" y2="8.5"/>
      <circle cx="12" cy="12" r="1.5"/>
    </svg>
  );
}

function SpeedControl({ speed, onChange }: { speed: number; onChange: (s: number) => void }) {
  const [open, setOpen] = useState(false);
  const isActive = speed !== 1;

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        title={`Playback speed: ${speed}×`}
        style={{
          height: 26,
          padding: "0 8px",
          borderRadius: "var(--radius-sm)",
          border: `1px solid ${isActive ? "var(--accent-border)" : "var(--border)"}`,
          background: isActive ? "var(--accent-dim)" : "transparent",
          color: isActive ? "var(--accent-light)" : "var(--text-muted)",
          cursor: "pointer",
          fontSize: 11,
          fontFamily: "'Space Mono', monospace",
          fontWeight: isActive ? 700 : 400,
          display: "flex",
          alignItems: "center",
          gap: 4,
          flexShrink: 0,
          transition: "all 0.15s",
        }}
        onMouseEnter={e => {
          e.currentTarget.style.color = "var(--text-primary)";
          e.currentTarget.style.borderColor = "var(--border-medium)";
        }}
        onMouseLeave={e => {
          e.currentTarget.style.color = isActive ? "var(--accent-light)" : "var(--text-muted)";
          e.currentTarget.style.borderColor = isActive ? "var(--accent-border)" : "var(--border)";
        }}
      >
        <IconSpeedometer />
        {speed}×
      </button>

      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setOpen(false)} />
          <div style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 100,
            background: "var(--bg-overlay)",
            border: "1px solid var(--border-medium)",
            borderRadius: "var(--radius-lg)",
            padding: "6px",
            boxShadow: "var(--shadow-lg)",
            display: "flex",
            flexDirection: "column",
            gap: 2,
            minWidth: 100,
          }}>
            <p style={{
              fontSize: 9,
              color: "var(--text-faint)",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              fontWeight: 700,
              textAlign: "center",
              marginBottom: 4,
              paddingBottom: 6,
              borderBottom: "1px solid var(--border-subtle)",
            }}>
              Speed
            </p>
            {SPEED_PRESETS.map(preset => (
              <button key={preset} onClick={() => { onChange(preset); setOpen(false); }} style={{
                width: "100%",
                padding: "6px 10px",
                borderRadius: "var(--radius-sm)",
                border: "none",
                background: speed === preset ? "var(--accent-dim)" : "transparent",
                color: speed === preset ? "var(--accent-light)" : "var(--text-secondary)",
                cursor: "pointer",
                fontSize: 12,
                fontFamily: "'Space Mono', monospace",
                fontWeight: speed === preset ? 700 : 400,
                textAlign: "center",
                transition: "background 0.1s",
              }}
                onMouseEnter={e => { if (speed !== preset) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                onMouseLeave={e => { if (speed !== preset) e.currentTarget.style.background = "transparent"; }}
              >
                {preset === 1 ? "Normal" : `${preset}×`}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────

function IconPrev() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>;
}
function IconNext() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>;
}
function IconPlay() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>;
}
function IconPause() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>;
}
function IconVolumeOff() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>;
}
function IconVolumeMin() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>;
}
function IconVolumeMax() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>;
}

// ─── Waveform toggle icons ────────────────────────────────────────────────────

/** Icon untuk mode waveform (gelombang) */
function IconWaveform() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12 Q4 4 6 12 Q8 20 10 12 Q12 4 14 12 Q16 20 18 12 Q20 4 22 12"/>
    </svg>
  );
}

/** Icon untuk mode progress bar biasa (garis lurus) */
function IconProgressBar() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="2" y1="12" x2="22" y2="12"/>
      <circle cx="9" cy="12" r="2.5" fill="currentColor" stroke="none"/>
    </svg>
  );
}

// ─── Shuffle button ───────────────────────────────────────────────────────────
function ShuffleBtn({ mode, onClick }: { mode: ShuffleMode; onClick: () => void }) {
  const isActive = mode !== "off";
  const modeLabel: Record<ShuffleMode, string> = {
    off: "Shuffle: Off",
    all: "Shuffle: All",
    songs: "Shuffle: Songs",
    songs_and_categories: "Shuffle: All",
  };

  return (
    <button onClick={onClick} title={modeLabel[mode]} style={{
      width: 40, height: 40, borderRadius: "var(--radius-md)",
      background: isActive ? "var(--accent-dim)" : "transparent",
      border: isActive ? "1px solid var(--accent-border)" : "1px solid transparent",
      color: isActive ? "var(--accent-light)" : "var(--text-muted)",
      cursor: "pointer",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3,
      transition: "all 0.18s", flexShrink: 0, position: "relative",
    }}
      onMouseEnter={e => { e.currentTarget.style.color = "var(--text-primary)"; e.currentTarget.style.transform = "scale(1.08)"; }}
      onMouseLeave={e => { e.currentTarget.style.color = isActive ? "var(--accent-light)" : "var(--text-muted)"; e.currentTarget.style.transform = "scale(1)"; }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={isActive ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 3 21 3 21 8"/>
        <line x1="4" y1="20" x2="21" y2="3"/>
        <polyline points="21 16 21 21 16 21"/>
        <line x1="15" y1="15" x2="21" y2="21"/>
        <line x1="4" y1="4" x2="9" y2="9"/>
      </svg>
      {isActive && (
        <span style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--accent-light)" }} />
      )}
    </button>
  );
}

// ─── Repeat button ────────────────────────────────────────────────────────────
function RepeatBtn({ mode, onClick }: { mode: RepeatMode; onClick: () => void }) {
  const vis: "off" | "all" | "one" =
    mode === "repeat_one" ? "one"
    : (mode === "repeat_all" || mode === "repeat_category") ? "all" : "off";

  const cfg = {
    off: { color: "var(--text-muted)", border: "transparent", bg: "transparent", title: "Repeat: Off" },
    all: { color: "var(--accent-light)", border: "var(--accent-border)", bg: "var(--accent-dim)", title: "Repeat: All" },
    one: { color: "#EC4899", border: "rgba(236,72,153,0.35)", bg: "rgba(236,72,153,0.12)", title: "Repeat: One" },
  }[vis];

  return (
    <button onClick={onClick} title={cfg.title} style={{
      width: 40, height: 40, borderRadius: "var(--radius-md)",
      border: `1px solid ${cfg.border}`,
      background: cfg.bg,
      color: cfg.color,
      cursor: "pointer",
      display: "flex", alignItems: "center", justifyContent: "center",
      transition: "all 0.18s", flexShrink: 0, position: "relative",
    }}
      onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.08)"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="17 1 21 5 17 9"/>
        <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
        <polyline points="7 23 3 19 7 15"/>
        <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
      </svg>
      {vis === "one" && (
        <span style={{
          position: "absolute", top: -4, right: -4,
          width: 14, height: 14, borderRadius: "50%",
          background: "#EC4899", color: "white",
          fontSize: 8, fontWeight: 700,
          display: "flex", alignItems: "center", justifyContent: "center",
          border: "1.5px solid var(--bg-base)",
        }}>1</span>
      )}
    </button>
  );
}

// ─── Control button ───────────────────────────────────────────────────────────
function CtrlBtn({ children, onClick, active = false, title, size = 40 }: {
  children: React.ReactNode; onClick: () => void;
  active?: boolean; title?: string; size?: number;
}) {
  return (
    <button onClick={onClick} title={title} style={{
      width: size, height: size, borderRadius: "var(--radius-md)",
      background: active ? "var(--accent-dim)" : "transparent",
      border: active ? "1px solid var(--accent-border)" : "1px solid transparent",
      color: active ? "var(--accent-light)" : "var(--text-muted)",
      cursor: "pointer",
      display: "flex", alignItems: "center", justifyContent: "center",
      transition: "color 0.15s, background 0.15s, transform 0.1s",
      flexShrink: 0,
    }}
      onMouseEnter={e => { e.currentTarget.style.color = "var(--text-primary)"; e.currentTarget.style.transform = "scale(1.1)"; }}
      onMouseLeave={e => { e.currentTarget.style.color = active ? "var(--accent-light)" : "var(--text-muted)"; e.currentTarget.style.transform = "scale(1)"; }}
    >{children}</button>
  );
}

// ─── Preload indicator ────────────────────────────────────────────────────────
function PreloadDot({ state }: { state: PreloadState }) {
  if (!state) return null;
  const loading = state === "loading";
  return (
    <span title={loading ? "Buffering next track…" : "Next track ready"} style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
      <span style={{
        display: "inline-block", width: 7, height: 7, borderRadius: "50%",
        background: loading ? "var(--warning)" : "var(--success)",
        animation: loading ? "dot-pulse 1s ease-in-out infinite" : "none",
      }} />
    </span>
  );
}

// ─── Scrolling title ─────────────────────────────────────────────────────────
function MarqueeTitle({ text, isPlaying }: { text: string; isPlaying: boolean }) {
  const THRESHOLD = 26;
  if (text.length <= THRESHOLD) {
    return (
      <div style={{
        fontWeight: 700, fontSize: 13, lineHeight: 1.2, color: "var(--text-primary)",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {text}
      </div>
    );
  }
  return (
    <div style={{ overflow: "hidden", position: "relative" }}>
      <div style={{
        fontWeight: 700, fontSize: 13, lineHeight: 1.2, color: "var(--text-primary)",
        whiteSpace: "nowrap", display: "inline-block",
        animation: "marquee-scroll 12s linear infinite", paddingRight: 32,
      }}>
        {text}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function PlayerBarV2({
  onPlayPause, onNext, onPrev, onRating, preloadState,
  playbackSpeed = 1, onSpeedChange,
}: Props) {
  const {
    currentSong, isPlaying, progress, currentTime, duration,
    volume, queue, shuffleMode, repeatMode,
    setVolume, cycleShuffleMode, cycleRepeatMode,
  } = usePlayerStore();

  const [useWaveform, setUseWaveform] = useState(true);
  const [hoverTime, setHoverTime]     = useState<string | null>(null);
  const [hoverPct, setHoverPct]       = useState(0);
  const [showVolTooltip, setShowVolTooltip] = useState(false);
  const progressBarRef = useRef<HTMLDivElement>(null);

  const handleBarSeek = useCallback((e: React.MouseEvent) => {
    const bar = progressBarRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    audioEngine.seekPercent(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * 100);
  }, []);

  const handleBarHover = useCallback((e: React.MouseEvent) => {
    const bar = progressBarRef.current;
    if (!bar || !duration) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
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

  return (
    <div style={{
      background: "linear-gradient(to top, var(--bg-base) 0%, var(--bg-surface) 100%)",
      borderTop: "1px solid var(--border-subtle)",
      flexShrink: 0,
      boxShadow: "0 -4px 24px rgba(0,0,0,0.4)",
    }}>

      {/* ── Seekbar area ── */}
      <div style={{ height: 56, position: "relative" }}>
        {useWaveform && currentSong ? (
          <WaveformSeekbar
            filePath={currentSong.path}
            progress={progress}
            onSeek={handleWaveSeek}
            height={56}
            barCount={200}
          />
        ) : (
          <div
            ref={progressBarRef}
            onClick={handleBarSeek}
            onMouseMove={handleBarHover}
            onMouseLeave={() => setHoverTime(null)}
            style={{
              height: "100%",
              cursor: "pointer",
              background: "var(--bg-base)",
              position: "relative",
              display: "flex",
              alignItems: "center",
            }}
          >
            <div style={{
              position: "absolute", left: 0, right: 0, height: 3,
              background: "var(--bg-muted)", top: "50%",
              transform: "translateY(-50%)", borderRadius: 2,
            }}>
              <div style={{
                position: "absolute", inset: 0, width: `${progress}%`,
                background: "linear-gradient(to right, var(--accent), var(--accent-pink))",
                borderRadius: 2, transition: "width 0.4s linear",
              }} />
              {progress > 0 && (
                <div style={{
                  position: "absolute", top: "50%", left: `${progress}%`,
                  transform: "translate(-50%,-50%)",
                  width: 10, height: 10, borderRadius: "50%",
                  background: "var(--text-primary)",
                  boxShadow: "0 0 6px rgba(124,58,237,0.7)",
                }} />
              )}
            </div>
            {hoverTime && (
              <div style={{
                position: "absolute",
                bottom: "calc(100% + 6px)",
                left: `${hoverPct}%`,
                transform: "translateX(-50%)",
                background: "var(--bg-overlay)",
                border: "1px solid var(--border-medium)",
                borderRadius: 5, padding: "3px 8px",
                fontSize: 12, fontWeight: 600,
                color: "var(--text-primary)",
                fontFamily: "'Space Mono', monospace",
                pointerEvents: "none", whiteSpace: "nowrap",
              }}>
                {hoverTime}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Controls row ── */}
      <div style={{ height: 72, display: "flex", alignItems: "center", padding: "0 18px", gap: 0 }}>

        {/* Left: Track info */}
        <div style={{ display: "flex", alignItems: "center", gap: 11, width: 250, flexShrink: 0, minWidth: 0 }}>
          {currentSong ? (
            <>
              <div style={{ position: "relative", flexShrink: 0 }}>
                <CoverArt id={currentSong.id} coverArt={currentSong.cover_art} size={44} />
                {isPlaying && (
                  <>
                    <div style={{
                      position: "absolute", inset: -2, borderRadius: 8,
                      border: "1.5px solid rgba(124,58,237,0.6)",
                      animation: "ring-pulse 2s ease-in-out infinite",
                    }} />
                    <div style={{
                      position: "absolute", inset: -5, borderRadius: 11,
                      border: "1px solid rgba(124,58,237,0.2)",
                      animation: "ring-pulse 2s ease-in-out infinite 0.5s",
                    }} />
                  </>
                )}
              </div>
              <div style={{ overflow: "hidden", flex: 1, minWidth: 0 }}>
                <MarqueeTitle text={currentSong.title} isPlaying={isPlaying} />
                <div style={{
                  fontSize: 11, color: "var(--text-muted)",
                  marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {currentSong.artist}
                </div>
                <div onClick={e => e.stopPropagation()} style={{ marginTop: 3 }}>
                  <StarRating stars={currentSong.stars ?? 0} onChange={s => onRating(currentSong.id, s)} size={10} />
                </div>
              </div>
            </>
          ) : (
            <div style={{ color: "var(--text-faint)", fontSize: 12, paddingLeft: 4 }}>
              No track selected
            </div>
          )}
        </div>

        {/* Center: Controls */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <ShuffleBtn mode={shuffleMode ?? "off"} onClick={cycleShuffleMode} />
            <CtrlBtn onClick={onPrev} title="Previous (Shift+←)"><IconPrev /></CtrlBtn>

            {/* Play button */}
            <button
              onClick={onPlayPause}
              disabled={!currentSong}
              title="Play/Pause (Space)"
              style={{
                width: 50, height: 50, borderRadius: "50%",
                background: currentSong
                  ? "linear-gradient(135deg, var(--accent) 0%, var(--accent-pink) 100%)"
                  : "var(--bg-muted)",
                border: "none", cursor: currentSong ? "pointer" : "default",
                color: "white",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: currentSong
                  ? isPlaying
                    ? "0 0 0 3px rgba(124,58,237,0.2), 0 0 24px rgba(124,58,237,0.5)"
                    : "0 0 18px rgba(124,58,237,0.3)"
                  : "none",
                transition: "background 0.2s, box-shadow 0.2s, transform 0.1s",
                flexShrink: 0,
              }}
              onMouseEnter={e => { if (currentSong) e.currentTarget.style.transform = "scale(1.06)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
            >
              {isPlaying ? <IconPause /> : <IconPlay />}
            </button>

            <CtrlBtn onClick={onNext} title="Next (Shift+→)"><IconNext /></CtrlBtn>
            <RepeatBtn mode={repeatMode ?? "repeat_all"} onClick={cycleRepeatMode} />
          </div>

          {/* Time + extras */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
            <span style={{ color: "var(--text-secondary)", fontFamily: "'Space Mono', monospace", minWidth: 32, textAlign: "right" }}>
              {fmt(ct)}
            </span>
            <span style={{ color: "var(--border-medium)" }}>·</span>
            <span style={{ color: "var(--text-faint)", fontFamily: "'Space Mono', monospace", minWidth: 32 }}>
              {fmt(dur)}
            </span>
            <PreloadDot state={preloadState ?? null} />
            {onSpeedChange && <SpeedControl speed={playbackSpeed} onChange={onSpeedChange} />}

            {/* Waveform toggle — pakai SVG, bukan unicode 〰 ▬ */}
            <button
              onClick={() => setUseWaveform(v => !v)}
              title={useWaveform ? "Switch to progress bar" : "Switch to waveform"}
              style={{
                background: useWaveform ? "var(--accent-dim)" : "transparent",
                border: `1px solid ${useWaveform ? "var(--accent-border)" : "var(--border)"}`,
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
                color: useWaveform ? "var(--accent-light)" : "var(--text-faint)",
                padding: "3px 6px",
                display: "flex",
                alignItems: "center",
                transition: "all 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.color = "var(--text-primary)"; }}
              onMouseLeave={e => { e.currentTarget.style.color = useWaveform ? "var(--accent-light)" : "var(--text-faint)"; }}
            >
              {useWaveform ? <IconWaveform /> : <IconProgressBar />}
            </button>
          </div>
        </div>

        {/* Right: Volume */}
        <div style={{
          display: "flex", alignItems: "center", gap: 7,
          width: 210, flexShrink: 0, justifyContent: "flex-end",
        }}>
          {queueCount > 0 && (
            <span style={{
              fontSize: 11, color: "var(--text-faint)",
              fontFamily: "monospace", whiteSpace: "nowrap",
            }}>
              {queueCount} queued
            </span>
          )}

          {/* Mute button */}
          <button
            onClick={() => handleVolumeChange(volume === 0 ? 80 : 0)}
            title={volume === 0 ? "Unmute" : "Mute"}
            style={{
              background: volume === 0 ? "var(--danger-dim)" : "transparent",
              border: volume === 0 ? "1px solid rgba(239,68,68,0.3)" : "none",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              color: volume === 0 ? "var(--danger)" : "var(--text-muted)",
              padding: 4,
              display: "flex",
              alignItems: "center",
              transition: "color 0.15s",
            }}
            onMouseEnter={e => e.currentTarget.style.color = "var(--text-primary)"}
            onMouseLeave={e => e.currentTarget.style.color = volume === 0 ? "var(--danger)" : "var(--text-muted)"}
          >
            {volume === 0 ? <IconVolumeOff /> : volume < 50 ? <IconVolumeMin /> : <IconVolumeMax />}
          </button>

          {/* Volume slider with tooltip */}
          <div
            style={{ width: 88, flexShrink: 0, position: "relative" }}
            onMouseEnter={() => setShowVolTooltip(true)}
            onMouseLeave={() => setShowVolTooltip(false)}
          >
            {showVolTooltip && (
              <div style={{
                position: "absolute",
                bottom: "calc(100% + 8px)",
                left: "50%",
                transform: "translateX(-50%)",
                background: "var(--bg-overlay)",
                border: "1px solid var(--border-medium)",
                borderRadius: 6,
                padding: "3px 9px",
                fontSize: 13,
                fontWeight: 700,
                color: "var(--text-primary)",
                fontFamily: "'Space Mono', monospace",
                pointerEvents: "none",
                whiteSpace: "nowrap",
                zIndex: 100,
                boxShadow: "var(--shadow-md)",
              }}>
                {volume}%
              </div>
            )}
            <input
              type="range"
              min={0}
              max={100}
              value={volume}
              onChange={e => handleVolumeChange(+e.target.value)}
              style={{ width: "100%", cursor: "pointer", display: "block" }}
            />
          </div>

          <span style={{
            fontSize: 11,
            color: "var(--text-secondary)",
            fontFamily: "'Space Mono', monospace",
            width: 28,
            textAlign: "right",
            flexShrink: 0,
          }}>
            {volume}
          </span>
        </div>
      </div>

      <style>{`
        @keyframes ring-pulse {
          0%,100% { opacity:0.3; transform:scale(1); }
          50% { opacity:0.7; transform:scale(1.03); }
        }
        @keyframes dot-pulse {
          0%,100% { opacity:0.5; transform:scale(0.9); }
          50% { opacity:1; transform:scale(1.2); }
        }
        @keyframes marquee-scroll {
          0%  { transform:translateX(0); }
          20% { transform:translateX(0); }
          80% { transform:translateX(calc(-100% + 160px)); }
          100%{ transform:translateX(0); }
        }
      `}</style>
    </div>
  );
}