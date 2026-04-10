/**
 * PlayerBarV2.tsx — Redesigned Player Bar
 *
 * Fixes:
 *   - Star rating shown below track title in player bar
 *   - Repeat button has 3 distinct visual states (off/all/one)
 *   - Volume layout fixed (icon stays, only slider moves)
 *   - Waveform shows current song's star rating
 */

import { useCallback, useRef, useState } from "react";
import { usePlayerStore, useSettingsStore } from "../../store";
import { audioEngine } from "../../lib/audioEngine";
import CoverArt from "../CoverArt";
import WaveformSeekbar from "../Waveform/WaveformSeekbar";
import StarRating from "../StarRating";

interface Props {
  onPlayPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onRating: (songId: number, stars: number) => void;
}

const fmt = (s: number) => {
  if (!s || !isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
};

// Repeat button: 3 distinct states with clear visual differentiation
function RepeatButton({ repeat, onClick }: { repeat: "off" | "one" | "all"; onClick: () => void }) {
  const configs = {
    off: {
      icon: "🔁",
      label: "Repeat Off",
      color: "#4b5563",
      bg: "transparent",
      border: "1px solid transparent",
      opacity: 0.4,
    },
    all: {
      icon: "🔁",
      label: "Repeat All",
      color: "#a78bfa",
      bg: "rgba(124,58,237,0.18)",
      border: "1px solid rgba(124,58,237,0.4)",
      opacity: 1,
    },
    one: {
      icon: "🔂",
      label: "Repeat One",
      color: "#EC4899",
      bg: "rgba(236,72,153,0.18)",
      border: "1px solid rgba(236,72,153,0.4)",
      opacity: 1,
    },
  };

  const cfg = configs[repeat];

  return (
    <button
      onClick={onClick}
      title={cfg.label}
      style={{
        width: 32, height: 32,
        background: cfg.bg,
        border: cfg.border,
        cursor: "pointer",
        color: cfg.color,
        fontSize: 15,
        borderRadius: 8,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all 0.2s",
        opacity: cfg.opacity,
        position: "relative",
      }}
      onMouseEnter={e => {
        (e.currentTarget.style.opacity) = "1";
        (e.currentTarget.style.transform) = "scale(1.1)";
      }}
      onMouseLeave={e => {
        (e.currentTarget.style.opacity) = String(cfg.opacity);
        (e.currentTarget.style.transform) = "scale(1)";
      }}
    >
      {cfg.icon}
      {/* "1" badge for repeat-one */}
      {repeat === "one" && (
        <span style={{
          position: "absolute",
          top: -4, right: -4,
          width: 14, height: 14,
          borderRadius: "50%",
          background: "#EC4899",
          color: "white",
          fontSize: 8,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "monospace",
          lineHeight: 1,
          border: "1.5px solid #08081a",
        }}>1</span>
      )}
    </button>
  );
}

export default function PlayerBarV2({ onPlayPause, onNext, onPrev, onRating }: Props) {
  const {
    currentSong, isPlaying, progress, currentTime, duration,
    volume, shuffle, repeat, queue,
    setVolume, toggleShuffle, cycleRepeat,
  } = usePlayerStore();

  const [useWaveform, setUseWaveform] = useState(true);
  const progressBarRef = useRef<HTMLDivElement>(null);

  const handleBarSeek = useCallback((e: React.MouseEvent) => {
    const bar = progressBarRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * 100;
    audioEngine.seekPercent(pct);
  }, []);

  const handleWaveSeek = useCallback((pct: number) => {
    audioEngine.seekPercent(pct);
  }, []);

  const queueCount = Array.isArray(queue) ? queue.length : 0;

  const ct = currentTime || audioEngine.currentTime;
  const dur = duration || audioEngine.duration;

  return (
    <div style={{
      background: "rgba(8,8,20,0.98)",
      borderTop: "1px solid #1a1a2e",
      backdropFilter: "blur(24px)",
      flexShrink: 0,
      userSelect: "none",
    }}>
      {/* ── Waveform / Progress bar ── */}
      <div style={{ padding: "0 0", height: 44, position: "relative" }}>
        {useWaveform && currentSong ? (
          <WaveformSeekbar
            filePath={currentSong.path}
            progress={progress}
            onSeek={handleWaveSeek}
            height={44}
            barCount={200}
          />
        ) : (
          <div
            ref={progressBarRef}
            onClick={handleBarSeek}
            style={{
              height: "100%", cursor: "pointer",
              background: "#0d0d1f", position: "relative",
              display: "flex", alignItems: "center",
            }}
          >
            <div style={{
              position: "absolute", left: 0, right: 0,
              height: 3, background: "#1f1f35", top: "50%",
              transform: "translateY(-50%)",
            }}>
              <div style={{
                position: "absolute", inset: 0,
                width: `${progress}%`,
                background: "linear-gradient(to right, var(--accent,#7C3AED), #EC4899)",
                transition: "width 0.5s linear",
              }} />
              {progress > 0 && (
                <div style={{
                  position: "absolute", top: "50%",
                  left: `${progress}%`,
                  transform: "translate(-50%, -50%)",
                  width: 10, height: 10, borderRadius: "50%",
                  background: "white",
                  boxShadow: "0 0 6px rgba(124,58,237,0.8)",
                }} />
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Controls row ── */}
      <div style={{
        height: 72, display: "flex", alignItems: "center",
        gap: 0, padding: "0 20px",
      }}>
        {/* ── Left: Track info + rating ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          width: 260, flexShrink: 0, minWidth: 0,
        }}>
          {currentSong ? (
            <>
              <div style={{ position: "relative", flexShrink: 0 }}>
                <CoverArt id={currentSong.id} coverArt={currentSong.cover_art} size={44} />
                {isPlaying && (
                  <div style={{
                    position: "absolute", inset: 0,
                    borderRadius: 6,
                    border: "1.5px solid rgba(124,58,237,0.6)",
                    animation: "pulse-border 2s ease-in-out infinite",
                  }} />
                )}
              </div>
              <div style={{ overflow: "hidden", flex: 1 }}>
                <div style={{
                  fontWeight: 600, fontSize: 13,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  color: "#e2e8f0", lineHeight: 1.3,
                }}>{currentSong.title}</div>
                <div style={{
                  fontSize: 11, color: "#6b7280", marginTop: 1,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>{currentSong.artist}</div>
                {/* Star rating — always visible in player bar */}
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
            <div style={{ color: "#3f3f5a", fontSize: 12, paddingLeft: 4 }}>No track selected</div>
          )}
        </div>

        {/* ── Center: Controls ── */}
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", gap: 4, minWidth: 0,
        }}>
          {/* Buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {/* Shuffle */}
            <CtrlBtn
              onClick={toggleShuffle}
              active={shuffle}
              title="Shuffle (S)"
              size={32}
            >
              <ShuffleIcon active={shuffle} />
            </CtrlBtn>

            <CtrlBtn onClick={onPrev} title="Previous (Shift+←)" size={34} style={{ fontSize: 20 }}>⏮</CtrlBtn>

            {/* Main play button */}
            <button
              onClick={onPlayPause}
              disabled={!currentSong}
              title="Play/Pause (Space)"
              style={{
                width: 46, height: 46, borderRadius: "50%",
                background: currentSong
                  ? "linear-gradient(135deg, var(--accent,#7C3AED), #EC4899)"
                  : "#1f1f35",
                border: "none",
                cursor: currentSong ? "pointer" : "default",
                fontSize: 17, color: "white",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: currentSong
                  ? "0 0 24px rgba(124,58,237,0.45), 0 2px 8px rgba(0,0,0,0.5)"
                  : "none",
                transition: "all 0.2s",
                flexShrink: 0,
              }}
              onMouseEnter={e => {
                if (currentSong) (e.currentTarget.style.transform) = "scale(1.06)";
              }}
              onMouseLeave={e => {
                (e.currentTarget.style.transform) = "scale(1)";
              }}
            >
              {isPlaying ? "⏸" : "▶"}
            </button>

            <CtrlBtn onClick={onNext} title="Next (Shift+→)" size={34} style={{ fontSize: 20 }}>⏭</CtrlBtn>

            {/* Repeat — 3 distinct states */}
            <RepeatButton repeat={repeat} onClick={cycleRepeat} />
          </div>

          {/* Time + waveform toggle */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 10, color: "#4b5563",
            fontFamily: "Space Mono, monospace",
          }}>
            <span style={{ color: "#6b7280", minWidth: 32, textAlign: "right" }}>{fmt(ct)}</span>
            <span style={{ color: "#2a2a3e" }}>/</span>
            <span style={{ minWidth: 32 }}>{fmt(dur)}</span>

            <button
              onClick={() => setUseWaveform(v => !v)}
              title={useWaveform ? "Switch to bar seekbar" : "Switch to waveform"}
              style={{
                marginLeft: 4, background: "none", border: "none", cursor: "pointer",
                fontSize: 11, color: useWaveform ? "#7C3AED" : "#3f3f5a",
                fontFamily: "inherit", padding: "0 2px",
                transition: "color 0.15s",
              }}
            >
              {useWaveform ? "〰" : "▬"}
            </button>
          </div>
        </div>

        {/* ── Right: Volume (fixed layout) ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          width: 220, flexShrink: 0, justifyContent: "flex-end",
        }}>
          {/* Queue count indicator */}
          {queueCount > 0 && (
            <div style={{
              fontSize: 10, color: "#4b5563",
              display: "flex", alignItems: "center", gap: 3,
              fontFamily: "monospace",
            }}>
              <span>📋</span>
              <span>{queueCount}</span>
            </div>
          )}

          {/* Volume icon — FIXED WIDTH, does NOT move */}
          <div
            style={{
              width: 22, height: 22,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, fontSize: 14,
              cursor: "pointer",
            }}
            onClick={() => {
              const newVol = volume === 0 ? 80 : 0;
              setVolume(newVol);
              audioEngine.setVolume(newVol);
            }}
            title={volume === 0 ? "Unmute" : "Mute"}
          >
            {volume === 0 ? "🔇" : volume < 40 ? "🔈" : volume < 70 ? "🔉" : "🔊"}
          </div>

          {/* Slider — fixed width container */}
          <div style={{ width: 90, flexShrink: 0 }}>
            <input
              type="range" min={0} max={100} value={volume}
              title={`Volume: ${volume}%`}
              onChange={e => {
                const v = +e.target.value;
                setVolume(v);
                audioEngine.setVolume(v);
              }}
              style={{
                width: "100%",
                accentColor: "var(--accent, #7C3AED)",
                cursor: "pointer",
                display: "block",
              }}
            />
          </div>

          {/* Volume number — fixed width */}
          <span style={{
            fontSize: 10, color: "#4b5563",
            fontFamily: "Space Mono, monospace",
            width: 26, textAlign: "right", flexShrink: 0,
          }}>{volume}</span>
        </div>
      </div>

      <style>{`
        @keyframes pulse-border {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 0.9; }
        }
      `}</style>
    </div>
  );
}

// ── Shuffle icon (SVG so we can color it properly) ─────────────────────────
function ShuffleIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 3 21 3 21 8" />
      <line x1="4" y1="20" x2="21" y2="3" />
      <polyline points="21 16 21 21 16 21" />
      <line x1="15" y1="15" x2="21" y2="21" />
      <line x1="4" y1="4" x2="9" y2="9" />
    </svg>
  );
}

// ── Control button ─────────────────────────────────────────────────────────────
function CtrlBtn({
  children, onClick, active = false, title, size = 32,
  style: extraStyle = {},
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  title?: string;
  size?: number;
  style?: React.CSSProperties;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: size, height: size,
        background: active ? "rgba(124,58,237,0.18)" : "none",
        border: active ? "1px solid rgba(124,58,237,0.35)" : "1px solid transparent",
        cursor: "pointer",
        color: active ? "var(--accent-light, #a78bfa)" : "#6b7280",
        fontSize: 16, borderRadius: 8, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 0.15s",
        ...extraStyle,
      }}
      onMouseEnter={e => {
        (e.currentTarget.style.color) = active ? "#c4b5fd" : "#9ca3af";
        (e.currentTarget.style.transform) = "scale(1.1)";
      }}
      onMouseLeave={e => {
        (e.currentTarget.style.color) = active ? "#a78bfa" : "#6b7280";
        (e.currentTarget.style.transform) = "scale(1)";
      }}
    >
      {children}
    </button>
  );
}