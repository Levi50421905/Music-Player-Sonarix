/**
 * QueueView.tsx — Current playback queue
 */

import { usePlayerStore } from "../../store";
import type { Song } from "../../lib/db";
import CoverArt from "../CoverArt";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

interface Props { onPlay: (song: Song) => void; }

export default function QueueView({ onPlay }: Props) {
  const { queue, queueIndex, currentSong } = usePlayerStore();

  const upcoming = queue.slice(queueIndex + 1);
  const played = queue.slice(0, queueIndex);

  return (
    <div>
      <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 4, letterSpacing: "-0.3px" }}>Queue</h3>
      <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 20 }}>
        {upcoming.length} tracks remaining
      </p>

      {/* Now Playing */}
      {currentSong && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 10, color: "#7C3AED", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600, marginBottom: 8 }}>
            Now Playing
          </p>
          <QueueRow song={currentSong} isActive onPlay={onPlay} index={-1} />
        </div>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600, marginBottom: 8 }}>
            Up Next
          </p>
          {upcoming.slice(0, 20).map((song, i) => (
            <QueueRow key={song.id} song={song} onPlay={onPlay} index={i + 1} />
          ))}
          {upcoming.length > 20 && (
            <p style={{ fontSize: 11, color: "#4b5563", padding: "8px 0" }}>
              +{upcoming.length - 20} more tracks
            </p>
          )}
        </div>
      )}

      {/* History */}
      {played.length > 0 && (
        <div>
          <p style={{ fontSize: 10, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600, marginBottom: 8 }}>
            Previously Played
          </p>
          {played.slice(-5).reverse().map((song, i) => (
            <QueueRow key={song.id} song={song} onPlay={onPlay} index={-(i + 1)} isPast />
          ))}
        </div>
      )}
    </div>
  );
}

function QueueRow({ song, isActive, isPast, onPlay, index }: {
  song: Song; isActive?: boolean; isPast?: boolean;
  onPlay: (s: Song) => void; index: number;
}) {
  return (
    <div
      onClick={() => onPlay(song)}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "8px 12px", borderRadius: 8, marginBottom: 2,
        background: isActive ? "rgba(124,58,237,0.15)" : "transparent",
        cursor: "pointer", opacity: isPast ? 0.5 : 1,
        transition: "background 0.1s",
      }}
      onMouseEnter={e => !isActive && ((e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)")}
      onMouseLeave={e => !isActive && ((e.currentTarget as HTMLElement).style.background = "transparent")}
    >
      <span style={{ width: 24, textAlign: "center", fontSize: 11, color: "#4b5563", fontFamily: "monospace", flexShrink: 0 }}>
        {isActive ? "▶" : index > 0 ? index : ""}
      </span>
      <CoverArt id={song.id} coverArt={song.cover_art} size={38} />
      <div style={{ flex: 1, overflow: "hidden" }}>
        <div style={{ fontWeight: 500, fontSize: 13, color: isActive ? "#a78bfa" : "#e2e8f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {song.title}
        </div>
        <div style={{ fontSize: 11, color: "#6b7280" }}>{song.artist}</div>
      </div>
      <span style={{ fontSize: 11, color: "#6b7280", fontFamily: "monospace", flexShrink: 0 }}>
        {fmt(song.duration)}
      </span>
    </div>
  );
}