/**
 * PlayerBar.tsx — v2 (Design Fix)
 *
 * PERUBAHAN vs v1:
 *   [FIX] Semua hardcode hex (#1a1a2e, #2a2a3e, #6b7280, #e2e8f0, dll) → CSS variable
 *   [FIX] Unicode emoji ⏮ ⏭ ⏸ ▶ ⇄ 🔊 🔈 🔉 🔇 🔂 🔁 → SVG inline
 *   [FIX] Button style menggunakan CSS variable
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

// ── SVG Icons ──────────────────────────────────────────────────────────────────
function IconPrev() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="19 20 9 12 19 4 19 20"/>
      <line x1="5" y1="19" x2="5" y2="5"/>
    </svg>
  );
}

function IconNext() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 4 15 12 5 20 5 4"/>
      <line x1="19" y1="5" x2="19" y2="19"/>
    </svg>
  );
}

function IconPlay() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5 3 19 12 5 21 5 3"/>
    </svg>
  );
}

function IconPause() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4" height="16"/>
      <rect x="14" y="4" width="4" height="16"/>
    </svg>
  );
}

function IconShuffle({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
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

function IconVolumeOff() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <line x1="23" y1="9" x2="17" y2="15"/>
      <line x1="17" y1="9" x2="23" y2="15"/>
    </svg>
  );
}

function IconVolumeLow() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
    </svg>
  );
}

function IconVolumeHigh() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
    </svg>
  );
}

export default function PlayerBar({ onPlayPause, onNext, onPrev }: Props) {
  const {
    currentSong, isPlaying, progress, currentTime, duration,
    volume, shuffle, repeat,
    setVolume, toggleShuffle, cycleRepeat,
  } = usePlayerStore();

  const progressBarRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

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
    const onUp = () => {
      isDragging.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [seekTo]);

  const isRepeatActive = repeat !== "off";

  const btnStyle = (active = false): React.CSSProperties => ({
    background: active ? "var(--accent-dim)" : "transparent",
    border: active ? "1px solid var(--accent-border)" : "1px solid transparent",
    borderRadius: "var(--radius-md)",
    cursor: "pointer",
    color: active ? "var(--accent-light)" : "var(--text-muted)",
    fontSize: 17,
    padding: 8,
    width: 40,
    height: 40,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.15s",
    flexShrink: 0,
  });

  const VolumeIcon = volume === 0 ? IconVolumeOff : volume < 50 ? IconVolumeLow : IconVolumeHigh;

  return (
    <div style={{
      background: "linear-gradient(to top, var(--bg-base) 0%, var(--bg-surface) 100%)",
      borderTop: "1px solid var(--border-subtle)",
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
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 4,
          cursor: "pointer",
          background: "var(--bg-muted)",
        }}
      >
        {/* Buffered (fake) */}
        <div style={{
          position: "absolute",
          inset: 0,
          width: `${Math.min(progress + 15, 100)}%`,
          background: "var(--bg-subtle)",
          transition: "width 0.3s ease",
        }} />
        {/* Played */}
        <div style={{
          position: "absolute",
          inset: 0,
          width: `${progress}%`,
          background: "linear-gradient(to right, var(--accent), var(--accent-pink))",
          transition: "width 0.5s linear",
        }} />
        {/* Thumb */}
        <div style={{
          position: "absolute",
          left: `${progress}%`,
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: 12,
          height: 12,
          borderRadius: "50%",
          background: "var(--text-primary)",
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
                fontWeight: 600,
                fontSize: 13,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                color: "var(--text-primary)",
              }}>
                {currentSong.title}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
                {currentSong.artist}
              </div>
            </div>
          </>
        ) : (
          <div style={{ color: "var(--text-faint)", fontSize: 12 }}>No track selected</div>
        )}
      </div>

      {/* ── Center: Controls ── */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
      }}>
        {/* Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            style={btnStyle(shuffle)}
            onClick={toggleShuffle}
            title="Smart Shuffle"
            onMouseEnter={e => { e.currentTarget.style.color = "var(--text-primary)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = shuffle ? "var(--accent-light)" : "var(--text-muted)"; }}
          >
            <IconShuffle active={!!shuffle} />
          </button>

          <button
            style={{ ...btnStyle(), width: 38, height: 38 }}
            onClick={onPrev}
            onMouseEnter={e => { e.currentTarget.style.color = "var(--text-primary)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; }}
          >
            <IconPrev />
          </button>

          {/* Main play button */}
          <button
            onClick={onPlayPause}
            disabled={!currentSong}
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: currentSong
                ? "linear-gradient(135deg, var(--accent), var(--accent-pink))"
                : "var(--bg-muted)",
              border: "none",
              cursor: currentSong ? "pointer" : "default",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: currentSong ? "0 0 24px rgba(124,58,237,0.5)" : "none",
              transition: "all 0.2s",
              flexShrink: 0,
            }}
            onMouseEnter={e => { if (currentSong) e.currentTarget.style.transform = "scale(1.06)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
          >
            {isPlaying ? <IconPause /> : <IconPlay />}
          </button>

          <button
            style={{ ...btnStyle(), width: 38, height: 38 }}
            onClick={onNext}
            onMouseEnter={e => { e.currentTarget.style.color = "var(--text-primary)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; }}
          >
            <IconNext />
          </button>

          <button
            style={btnStyle(isRepeatActive)}
            onClick={cycleRepeat}
            title="Repeat"
            onMouseEnter={e => { e.currentTarget.style.color = "var(--text-primary)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = isRepeatActive ? "var(--accent-light)" : "var(--text-muted)"; }}
          >
            <IconRepeatAll />
          </button>
        </div>

        {/* Time */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 10,
          color: "var(--text-muted)",
          fontFamily: "Space Mono, monospace",
        }}>
          <span>{fmt(currentTime)}</span>
          <span style={{ color: "var(--border-medium)" }}>—</span>
          <span>{fmt(duration)}</span>
        </div>
      </div>

      {/* ── Right: Volume ── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: 180,
        flexShrink: 0,
        justifyContent: "flex-end",
      }}>
        <button
          onClick={() => {
            const newVol = volume === 0 ? 80 : 0;
            setVolume(newVol);
            audioEngine.setVolume(newVol);
          }}
          style={{
            background: "none",
            border: "none",
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
          <VolumeIcon />
        </button>

        <input
          type="range"
          min={0}
          max={100}
          value={volume}
          onChange={e => {
            const v = +e.target.value;
            setVolume(v);
            audioEngine.setVolume(v);
          }}
          style={{ flex: 1, cursor: "pointer" }}
        />

        <span style={{
          fontSize: 10,
          color: "var(--text-muted)",
          fontFamily: "Space Mono, monospace",
          width: 24,
          textAlign: "right",
        }}>
          {volume}
        </span>
      </div>
    </div>
  );
}