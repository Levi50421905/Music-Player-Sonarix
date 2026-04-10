/**
 * QueueView.tsx — Current playback queue with remove functionality
 */

import { usePlayerStore } from "../../store";
import type { Song } from "../../lib/db";
import CoverArt from "../CoverArt";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

interface Props { onPlay: (song: Song) => void; }

export default function QueueView({ onPlay }: Props) {
  const { queue, queueIndex, currentSong, setQueue } = usePlayerStore() as any;

  const upcoming = queue.slice(queueIndex + 1);
  const played   = queue.slice(0, queueIndex);

  const removeFromQueue = (songId: number) => {
    const newQueue = queue.filter((s: Song) => s.id !== songId);
    // Recalculate index
    const newIndex = newQueue.findIndex((s: Song) => s.id === currentSong?.id);
    setQueue(newQueue, Math.max(0, newIndex));
  };

  const clearQueue = () => {
    if (currentSong) {
      setQueue([currentSong], 0);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <h3 style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.3px" }}>Queue</h3>
        {upcoming.length > 0 && (
          <button onClick={clearQueue} style={{
            padding: "4px 12px", borderRadius: 6, fontSize: 11,
            background: "transparent", border: "1px solid #3f3f5a",
            color: "#9ca3af", cursor: "pointer", fontFamily: "inherit",
          }}>
            Clear queue
          </button>
        )}
      </div>
      <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 20 }}>
        {upcoming.length} tracks remaining
      </p>

      {/* Now Playing */}
      {currentSong && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 10, color: "#7C3AED", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600, marginBottom: 8 }}>
            Now Playing
          </p>
          <QueueRow song={currentSong} isActive onPlay={onPlay} index={-1} onRemove={null} />
        </div>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600, marginBottom: 8 }}>
            Up Next
          </p>
          {upcoming.slice(0, 30).map((song: Song, i: number) => (
            <QueueRow
              key={`${song.id}-${i}`}
              song={song}
              onPlay={onPlay}
              index={i + 1}
              onRemove={() => removeFromQueue(song.id)}
            />
          ))}
          {upcoming.length > 30 && (
            <p style={{ fontSize: 11, color: "#4b5563", padding: "8px 0" }}>
              +{upcoming.length - 30} more tracks
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
          {played.slice(-5).reverse().map((song: Song, i: number) => (
            <QueueRow
              key={`${song.id}-past-${i}`}
              song={song}
              onPlay={onPlay}
              index={-(i + 1)}
              isPast
              onRemove={null}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function QueueRow({ song, isActive, isPast, onPlay, index, onRemove }: {
  song: Song; isActive?: boolean; isPast?: boolean;
  onPlay: (s: Song) => void;
  index: number;
  onRemove: (() => void) | null;
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
        group: "row",
      } as any}
      onMouseEnter={e => {
        if (!isActive) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)";
        const btn = (e.currentTarget as HTMLElement).querySelector(".remove-btn") as HTMLElement;
        if (btn) btn.style.opacity = "1";
      }}
      onMouseLeave={e => {
        if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent";
        const btn = (e.currentTarget as HTMLElement).querySelector(".remove-btn") as HTMLElement;
        if (btn) btn.style.opacity = "0";
      }}
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
      {onRemove && (
        <button
          className="remove-btn"
          onClick={e => { e.stopPropagation(); onRemove(); }}
          style={{
            width: 22, height: 22, borderRadius: 5, fontSize: 12,
            background: "rgba(239,68,68,0.15)", border: "1px solid transparent",
            color: "#f87171", cursor: "pointer",
            opacity: 0, transition: "opacity 0.15s",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}
          title="Remove from queue"
        >✕</button>
      )}
    </div>
  );
}