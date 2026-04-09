/**
 * Sidebar.tsx — Now Playing Panel (kiri)
 *
 * Menampilkan:
 *   - Cover art besar
 *   - Info lagu (judul, artis, album)
 *   - Star rating
 *   - Visualizer bar
 *   - Lyrics panel (toggle)
 *   - Format/bitrate badge
 */

import { useState } from "react";
import { usePlayerStore, useSettingsStore } from "../store";
import BarVisualizer, { CircleVisualizer, WaveVisualizer } from "./Visualizer/BarVisualizer";
import LyricsPanel from "./Lyrics/LyricsPanel";
import CoverArt from "./CoverArt";
import StarRating from "./StarRating";

interface Props {
  onPlayPause: () => void;
  onRating: (songId: number, stars: number) => void;
}

export default function Sidebar({ onRating }: Props) {
  const { currentSong, isPlaying, currentTime } = usePlayerStore();
  const { visualizerType, setVisualizerType, showLyrics, toggleLyrics } = useSettingsStore();
  const [showVisOptions, setShowVisOptions] = useState(false);

  const song = currentSong;

  return (
    <div style={{
      width: 260,
      background: "#0d0d1f",
      borderRight: "1px solid #1a1a2e",
      display: "flex",
      flexDirection: "column",
      flexShrink: 0,
      overflow: "hidden",
    }}>

      {/* Cover art */}
      <div style={{ padding: 20, paddingBottom: 0 }}>
        <div style={{ position: "relative", borderRadius: 12, overflow: "hidden" }}>
          <CoverArt
            id={song?.id ?? 0}
            coverArt={song?.cover_art ?? null}
            size={220}
          />
          {/* Spinning disc overlay saat playing */}
          {isPlaying && (
            <div style={{
              position: "absolute", inset: 0,
              background: "radial-gradient(circle at 50% 50%, transparent 25%, rgba(0,0,0,0.15) 100%)",
              animation: "spin 8s linear infinite",
            }} />
          )}
          {/* Gradient overlay bottom */}
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(to top, #0d0d1f 0%, transparent 50%)",
          }} />
        </div>

        <style>{`
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `}</style>
      </div>

      {/* Track info */}
      <div style={{ padding: "14px 20px 0" }}>
        <div style={{
          fontWeight: 700, fontSize: 16,
          letterSpacing: "-0.3px",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          color: song ? "#f1f5f9" : "#4b5563",
        }}>
          {song?.title ?? "No track"}
        </div>
        <div style={{ color: "#9ca3af", fontSize: 12, marginTop: 3 }}>
          {song?.artist ?? "—"}
        </div>
        <div style={{ color: "#6b7280", fontSize: 11, marginTop: 1 }}>
          {song?.album ?? ""}
        </div>
      </div>

      {/* Rating + format badge */}
      <div style={{
        padding: "12px 20px 0",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        {song ? (
          <StarRating
            stars={song.stars ?? 0}
            onChange={s => onRating(song.id, s)}
          />
        ) : <div style={{ height: 20 }} />}

        {song && (
          <FormatBadge format={song.format} bitrate={song.bitrate} />
        )}
      </div>

      {/* Visualizer */}
      <div style={{ padding: "16px 20px 0" }}>
        {/* Visualizer type toggle */}
        <div style={{ display: "flex", gap: 4, marginBottom: 8, justifyContent: "flex-end" }}>
          {(["bar", "wave", "circle"] as const).map(type => (
            <button
              key={type}
              onClick={() => setVisualizerType(type)}
              style={{
                width: 22, height: 22, borderRadius: 6, fontSize: 10,
                border: "1px solid",
                background: visualizerType === type ? "rgba(124,58,237,0.3)" : "transparent",
                borderColor: visualizerType === type ? "#7C3AED" : "#2a2a3e",
                color: visualizerType === type ? "#a78bfa" : "#4b5563",
                cursor: "pointer",
              }}
            >
              {type === "bar" ? "▌" : type === "wave" ? "∿" : "◎"}
            </button>
          ))}
        </div>

        {visualizerType === "bar"    && <BarVisualizer isPlaying={isPlaying} height={48} />}
        {visualizerType === "wave"   && <WaveVisualizer isPlaying={isPlaying} />}
        {visualizerType === "circle" && (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <CircleVisualizer isPlaying={isPlaying} />
          </div>
        )}
      </div>

      {/* Info chips */}
      {song && (
        <div style={{ padding: "12px 20px 0", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[
            song.genre,
            song.year?.toString(),
            `${song.play_count ?? 0} plays`,
          ].filter(Boolean).map(chip => (
            <span key={chip} style={{
              fontSize: 10, padding: "3px 8px", borderRadius: 20,
              background: "#1a1a2e", color: "#9ca3af", border: "1px solid #2a2a3e",
            }}>{chip}</span>
          ))}
        </div>
      )}

      {/* Lyrics toggle button */}
      <div style={{ padding: "12px 20px 0" }}>
        <button
          onClick={toggleLyrics}
          style={{
            width: "100%", padding: "8px", borderRadius: 8, fontSize: 12,
            border: "1px solid", cursor: "pointer", fontFamily: "inherit",
            background: showLyrics ? "rgba(124,58,237,0.15)" : "transparent",
            borderColor: showLyrics ? "#7C3AED" : "#2a2a3e",
            color: showLyrics ? "#a78bfa" : "#6b7280",
            transition: "all 0.2s",
          }}
        >
          {showLyrics ? "🎵 Hide Lyrics" : "🎵 Show Lyrics"}
        </button>
      </div>

      {/* Lyrics panel (scrollable) */}
      {showLyrics && song && (
        <div style={{ flex: 1, overflow: "hidden", marginTop: 8 }}>
          <LyricsPanel
            songPath={song.path}
            currentTime={currentTime}
          />
        </div>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />
    </div>
  );
}

// ── Format Badge ──────────────────────────────────────────────────────────────
function FormatBadge({ format, bitrate }: { format: string; bitrate: number }) {
  const isLossless = ["FLAC", "WAV", "ALAC", "APE"].includes(format.toUpperCase());
  const bitrateStr = bitrate >= 1000
    ? `${(bitrate / 1000).toFixed(1)}k`
    : `${bitrate}`;

  return (
    <span style={{
      fontSize: 10, fontFamily: "Space Mono, monospace",
      padding: "3px 7px", borderRadius: 5,
      background: isLossless ? "rgba(16,185,129,0.15)" : "rgba(99,102,241,0.15)",
      border: `1px solid ${isLossless ? "#10B981" : "#6366F1"}`,
      color: isLossless ? "#34D399" : "#818CF8",
    }}>
      {format} {bitrateStr}
    </span>
  );
}