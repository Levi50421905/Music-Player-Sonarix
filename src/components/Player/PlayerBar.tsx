/**
 * PlayerBar.tsx — Bottom Playback Control Bar
 *
 * Komponen ini adalah "komando utama" player:
 *   - Progress bar yang bisa di-click/drag untuk seek
 *   - Play/Pause, Next, Prev buttons
 *   - Volume slider
 *   - Shuffle & Repeat toggle
 *   - Info lagu yang sedang diputar
 */

import { useCallback, useRef } from "react";
import { usePlayerStore } from "../../store";
import { audioEngine } from "../../lib/audioEngine";
import CoverArt from "../CoverArt";

interface Props {
  onPlayPause: () => void;
  onNext: () => void;
  onPrev: () => void;
}

const fmt = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export default function PlayerBar({ onPlayPause, onNext, onPrev }: Props) {
  const {
    currentSong, isPlaying, progress, currentTime, duration,
    volume, shuffle, repeat,
    setVolume, toggleShuffle, cycleRepeat,
  } = usePlayerStore();

  const progressBarRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  // ── Seek via click/drag ──────────────────────────────────────────────────
  const seekTo = useCallback((e: React.MouseEvent | MouseEvent) => {
    const bar = progressBarRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audioEngine.seekPercent(percent * 100);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    seekTo(e);

    const onMove = (ev: MouseEvent) => { if (isDragging.current) seekTo(ev); };
    const onUp = () => { isDragging.current = false; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [seekTo]);

  // ── Repeat icon ──────────────────────────────────────────────────────────
  const repeatIcon = repeat === "one" ? "🔂" : "🔁";
  const isRepeatActive = repeat !== "off";

  const btnStyle = (active = false): React.CSSProperties => ({
    background: "none", border: "none", cursor: "pointer",
    color: active ? "#a78bfa" : "#6b7280",
    fontSize: 17, padding: 6, borderRadius: 8,
    transition: "color 0.2s, transform 0.1s",
    display: "flex", alignItems: "center", justifyContent: "center",
  });

  return (
    <div style={{
      background: "rgba(13,13,31,0.98)",
      borderTop: "1px solid #1a1a2e",
      backdropFilter: "blur(24px)",
      padding: "0 24px",
      height: 80,
      display: "flex",
      alignItems: "center",
      gap: 16,
      flexShrink: 0,
      position: "relative",
    }}>
      {/* Progress bar — absolute at top of bar */}
      <div
        ref={progressBarRef}
        onMouseDown={handleMouseDown}
        style={{
          position: "absolute", top: 0, left: 0, right: 0,
          height: 4, cursor: "pointer",
          background: "#1a1a2e",
        }}
      >
        {/* Buffered (fake) */}
        <div style={{
          position: "absolute", inset: 0,
          width: `${Math.min(progress + 15, 100)}%`,
          background: "#2a2a3e",
          transition: "width 0.3s ease",
        }} />
        {/* Played */}
        <div style={{
          position: "absolute", inset: 0,
          width: `${progress}%`,
          background: "linear-gradient(to right, #7C3AED, #EC4899)",
          transition: "width 0.5s linear",
        }} />
        {/* Thumb */}
        <div style={{
          position: "absolute",
          left: `${progress}%`,
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: 12, height: 12,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 0 6px rgba(124,58,237,0.8)",
          opacity: progress > 0 ? 1 : 0,
          transition: "opacity 0.2s",
        }} />
      </div>

      {/* ── Left: Track Info ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, width: 220, flexShrink: 0 }}>
        {currentSong ? (
          <>
            <CoverArt id={currentSong.id} coverArt={currentSong.cover_art} size={46} />
            <div style={{ overflow: "hidden" }}>
              <div style={{
                fontWeight: 600, fontSize: 13,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                color: "#e2e8f0",
              }}>{currentSong.title}</div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 1 }}>
                {currentSong.artist}
              </div>
            </div>
          </>
        ) : (
          <div style={{ color: "#4b5563", fontSize: 12 }}>No track selected</div>
        )}
      </div>

      {/* ── Center: Controls ── */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", gap: 4,
      }}>
        {/* Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button style={btnStyle(shuffle)} onClick={toggleShuffle} title="Smart Shuffle">
            ⇄
          </button>
          <button style={{ ...btnStyle(), fontSize: 22 }} onClick={onPrev}>⏮</button>

          {/* Main play button */}
          <button
            onClick={onPlayPause}
            disabled={!currentSong}
            style={{
              width: 48, height: 48, borderRadius: "50%",
              background: currentSong
                ? "linear-gradient(135deg, #7C3AED, #EC4899)"
                : "#2a2a3e",
              border: "none", cursor: currentSong ? "pointer" : "default",
              fontSize: 18, color: "white",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: currentSong ? "0 0 24px rgba(124,58,237,0.5)" : "none",
              transition: "all 0.2s",
              flexShrink: 0,
            }}
          >
            {isPlaying ? "⏸" : "▶"}
          </button>

          <button style={{ ...btnStyle(), fontSize: 22 }} onClick={onNext}>⏭</button>
          <button style={btnStyle(isRepeatActive)} onClick={cycleRepeat} title="Repeat">
            {repeatIcon}
          </button>
        </div>

        {/* Time */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, color: "#6b7280", fontFamily: "Space Mono, monospace" }}>
          <span>{fmt(currentTime)}</span>
          <span style={{ color: "#2a2a3e" }}>—</span>
          <span>{fmt(duration)}</span>
        </div>
      </div>

      {/* ── Right: Volume + extras ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, width: 180, flexShrink: 0, justifyContent: "flex-end" }}>
        <span style={{ fontSize: 14 }}>
          {volume === 0 ? "🔇" : volume < 40 ? "🔈" : volume < 70 ? "🔉" : "🔊"}
        </span>
        <input
          type="range" min={0} max={100} value={volume}
          onChange={e => {
            const v = +e.target.value;
            setVolume(v);
            audioEngine.setVolume(v);
          }}
          style={{ flex: 1, accentColor: "#7C3AED", cursor: "pointer" }}
        />
        <span style={{
          fontSize: 10, color: "#6b7280",
          fontFamily: "Space Mono, monospace",
          width: 24, textAlign: "right",
        }}>{volume}</span>
      </div>
    </div>
  );
}