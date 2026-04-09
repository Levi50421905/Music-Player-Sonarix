/**
 * PlayerBarV2.tsx — PlayerBar dengan Waveform Seekbar
 *
 * Ini adalah versi upgrade dari PlayerBar (M3).
 * Perbedaan utama: progress bar diganti WaveformSeekbar.
 * Toggle antara waveform dan bar biasa via tombol kecil.
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

const fmt = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export default function PlayerBarV2({ onPlayPause, onNext, onPrev, onRating }: Props) {
  const {
    currentSong, isPlaying, progress, currentTime, duration,
    volume, shuffle, repeat,
    setVolume, toggleShuffle, cycleRepeat,
  } = usePlayerStore();

  const [useWaveform, setUseWaveform] = useState(true);
  const progressBarRef = useRef<HTMLDivElement>(null);

  // Seek via plain bar click (fallback)
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

  const repeatIcon = repeat === "one" ? "🔂" : "🔁";
  const isRepeatActive = repeat !== "off";

  const btnStyle = (active = false): React.CSSProperties => ({
    background: "none", border: "none", cursor: "pointer",
    color: active ? "var(--accent-light, #a78bfa)" : "#6b7280",
    fontSize: 17, padding: 6, borderRadius: 8,
    transition: "color 0.2s, transform 0.1s",
    display: "flex", alignItems: "center", justifyContent: "center",
  });

  return (
    <div style={{
      background: "rgba(13,13,31,0.98)",
      borderTop: "1px solid #1a1a2e",
      backdropFilter: "blur(24px)",
      flexShrink: 0,
    }}>
      {/* ── Waveform / Progress bar ── */}
      <div style={{ padding: "8px 24px 0" }}>
        {useWaveform && currentSong ? (
          <WaveformSeekbar
            filePath={currentSong.path}
            progress={progress}
            onSeek={handleWaveSeek}
            height={40}
            barCount={180}
          />
        ) : (
          /* Plain bar */
          <div
            ref={progressBarRef}
            onClick={handleBarSeek}
            style={{ height: 4, cursor: "pointer", background: "#1a1a2e", borderRadius: 2, position: "relative" }}
          >
            <div style={{
              position: "absolute", inset: 0, width: `${Math.min(progress + 10, 100)}%`,
              background: "#2a2a3e", borderRadius: 2,
            }} />
            <div style={{
              position: "absolute", inset: 0, width: `${progress}%`,
              background: "linear-gradient(to right, var(--accent,#7C3AED), #EC4899)",
              borderRadius: 2, transition: "width 0.5s linear",
            }} />
          </div>
        )}
      </div>

      {/* ── Controls row ── */}
      <div style={{
        height: 72, display: "flex", alignItems: "center",
        gap: 16, padding: "0 24px",
      }}>
        {/* Left: Track info */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, width: 230, flexShrink: 0 }}>
          {currentSong ? (
            <>
              <CoverArt id={currentSong.id} coverArt={currentSong.cover_art} size={44} />
              <div style={{ overflow: "hidden" }}>
                <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {currentSong.title}
                </div>
                <div style={{ fontSize: 11, color: "#6b7280" }}>{currentSong.artist}</div>
                {/* Inline star rating */}
                <div onClick={e => e.stopPropagation()} style={{ marginTop: 2 }}>
                  <StarRating
                    stars={currentSong.stars ?? 0}
                    onChange={s => onRating(currentSong.id, s)}
                    size={10}
                  />
                </div>
              </div>
            </>
          ) : (
            <div style={{ color: "#4b5563", fontSize: 12 }}>No track selected</div>
          )}
        </div>

        {/* Center: Controls */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button style={btnStyle(shuffle)} onClick={toggleShuffle} title="Smart Shuffle (S)">⇄</button>
            <button style={{ ...btnStyle(), fontSize: 22 }} onClick={onPrev}>⏮</button>
            <button
              onClick={onPlayPause}
              disabled={!currentSong}
              style={{
                width: 46, height: 46, borderRadius: "50%",
                background: currentSong
                  ? "linear-gradient(135deg, var(--accent,#7C3AED), #EC4899)"
                  : "#2a2a3e",
                border: "none", cursor: currentSong ? "pointer" : "default",
                fontSize: 18, color: "white",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: currentSong ? "0 0 24px rgba(124,58,237,0.45)" : "none",
                flexShrink: 0, transition: "all 0.2s",
              }}
            >{isPlaying ? "⏸" : "▶"}</button>
            <button style={{ ...btnStyle(), fontSize: 22 }} onClick={onNext}>⏭</button>
            <button style={btnStyle(isRepeatActive)} onClick={cycleRepeat} title="Repeat (R)">
              {repeatIcon}
            </button>
          </div>

          {/* Time */}
          <div style={{ fontSize: 10, color: "#6b7280", fontFamily: "Space Mono, monospace", display: "flex", gap: 6, alignItems: "center" }}>
            <span>{fmt(currentTime)}</span>
            <span style={{ color: "#2a2a3e" }}>/</span>
            <span>{fmt(duration)}</span>
            {/* Waveform toggle */}
            <button
              onClick={() => setUseWaveform(v => !v)}
              title={useWaveform ? "Switch to bar" : "Switch to waveform"}
              style={{
                marginLeft: 6, background: "none", border: "none", cursor: "pointer",
                fontSize: 9, color: useWaveform ? "#a78bfa" : "#4b5563",
                fontFamily: "inherit",
              }}
            >
              {useWaveform ? "〰" : "—"}
            </button>
          </div>
        </div>

        {/* Right: Volume */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, width: 160, flexShrink: 0, justifyContent: "flex-end" }}>
          <span style={{ fontSize: 14 }}>
            {volume === 0 ? "🔇" : volume < 40 ? "🔈" : volume < 70 ? "🔉" : "🔊"}
          </span>
          <input
            type="range" min={0} max={100} value={volume}
            onChange={e => { const v = +e.target.value; setVolume(v); audioEngine.setVolume(v); }}
            style={{ flex: 1, accentColor: "var(--accent, #7C3AED)", cursor: "pointer" }}
          />
          <span style={{ fontSize: 10, color: "#6b7280", fontFamily: "Space Mono, monospace", width: 24 }}>
            {volume}
          </span>
        </div>
      </div>
    </div>
  );
}