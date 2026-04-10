/**
 * QueueView.tsx — Current playback queue (Fixed)
 *
 * Fixes:
 *   - Uses store's removeFromQueue and clearQueue actions
 *   - Shows only explicit queue (not full library)
 *   - Add to queue shows correctly
 *   - Clear queue keeps current song
 */

import { usePlayerStore } from "../../store";
import type { Song } from "../../lib/db";
import CoverArt from "../CoverArt";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

interface Props { onPlay: (song: Song) => void; }

export default function QueueView({ onPlay }: Props) {
  const { queue, queueIndex, currentSong, removeFromQueue, clearQueue } = usePlayerStore() as any;

  const safeQueue: Song[] = Array.isArray(queue) ? queue : [];
  const safeIndex: number = typeof queueIndex === "number" ? queueIndex : 0;

  const upcoming = safeQueue.slice(safeIndex + 1);
  const played   = safeQueue.slice(0, safeIndex);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 4, flexShrink: 0,
      }}>
        <div>
          <h3 style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.3px" }}>Queue</h3>
          <p style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
            {upcoming.length} tracks up next · {safeQueue.length} total
          </p>
        </div>
        {safeQueue.length > 1 && (
          <button
            onClick={() => clearQueue?.()}
            style={{
              padding: "5px 14px", borderRadius: 7, fontSize: 11,
              background: "transparent", border: "1px solid #3f3f5a",
              color: "#9ca3af", cursor: "pointer", fontFamily: "inherit",
              transition: "all 0.15s",
            }}
            onMouseEnter={e => {
              (e.currentTarget.style.borderColor) = "#EF4444";
              (e.currentTarget.style.color) = "#f87171";
            }}
            onMouseLeave={e => {
              (e.currentTarget.style.borderColor) = "#3f3f5a";
              (e.currentTarget.style.color) = "#9ca3af";
            }}
          >
            Clear queue
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflow: "auto" }}>
        {safeQueue.length === 0 ? (
          <div style={{
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            height: "60%", color: "#4b5563", gap: 10,
          }}>
            <div style={{ fontSize: 36 }}>📋</div>
            <p style={{ fontSize: 13, color: "#6b7280" }}>Queue is empty</p>
            <p style={{ fontSize: 12 }}>Play a song to start the queue</p>
          </div>
        ) : (
          <>
            {/* Now Playing */}
            {currentSong && (
              <div style={{ marginBottom: 20 }}>
                <SectionLabel color="#7C3AED">Now Playing</SectionLabel>
                <QueueRow
                  song={currentSong}
                  isActive
                  onPlay={onPlay}
                  index={-1}
                  onRemove={null}
                />
              </div>
            )}

            {/* Up Next */}
            {upcoming.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <SectionLabel color="#6b7280">Up Next ({upcoming.length})</SectionLabel>
                {upcoming.slice(0, 50).map((song: Song, i: number) => (
                  <QueueRow
                    key={`${song.id}-${i}`}
                    song={song}
                    onPlay={onPlay}
                    index={i + 1}
                    onRemove={() => removeFromQueue?.(song.id)}
                  />
                ))}
                {upcoming.length > 50 && (
                  <p style={{ fontSize: 11, color: "#4b5563", padding: "8px 12px" }}>
                    +{upcoming.length - 50} more tracks
                  </p>
                )}
              </div>
            )}

            {/* Previously Played */}
            {played.length > 0 && (
              <div>
                <SectionLabel color="#3f3f5a">Previously Played</SectionLabel>
                {played.slice(-10).reverse().map((song: Song, i: number) => (
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
          </>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <p style={{
      fontSize: 10, color, textTransform: "uppercase",
      letterSpacing: "0.1em", fontWeight: 700, marginBottom: 8,
      padding: "0 4px",
    }}>
      {children}
    </p>
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
        padding: "7px 10px", borderRadius: 8, marginBottom: 2,
        background: isActive ? "rgba(124,58,237,0.15)" : "transparent",
        cursor: "pointer", opacity: isPast ? 0.45 : 1,
        transition: "background 0.1s",
        border: isActive ? "1px solid rgba(124,58,237,0.25)" : "1px solid transparent",
      }}
      onMouseEnter={e => {
        if (!isActive) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)";
        const btn = (e.currentTarget as HTMLElement).querySelector(".remove-btn") as HTMLElement;
        if (btn) btn.style.opacity = "1";
      }}
      onMouseLeave={e => {
        if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent";
        const btn = (e.currentTarget as HTMLElement).querySelector(".remove-btn") as HTMLElement;
        if (btn) btn.style.opacity = "0";
      }}
    >
      <span style={{
        width: 26, textAlign: "center", fontSize: 11,
        color: isActive ? "#a78bfa" : "#4b5563",
        fontFamily: "monospace", flexShrink: 0, fontWeight: isActive ? 700 : 400,
      }}>
        {isActive ? "▶" : index > 0 ? index : ""}
      </span>

      <CoverArt id={song.id} coverArt={song.cover_art} size={36} />

      <div style={{ flex: 1, overflow: "hidden" }}>
        <div style={{
          fontWeight: 500, fontSize: 13,
          color: isActive ? "#c4b5fd" : "#e2e8f0",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {song.title}
        </div>
        <div style={{ fontSize: 11, color: "#6b7280" }}>{song.artist}</div>
      </div>

      <span style={{ fontSize: 11, color: "#4b5563", fontFamily: "monospace", flexShrink: 0 }}>
        {fmt(song.duration)}
      </span>

      {onRemove && (
        <button
          className="remove-btn"
          onClick={e => { e.stopPropagation(); onRemove(); }}
          style={{
            width: 24, height: 24, borderRadius: 6, fontSize: 12,
            background: "rgba(239,68,68,0.12)", border: "1px solid transparent",
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