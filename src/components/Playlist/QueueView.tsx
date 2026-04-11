/**
 * QueueView.tsx — v5 (drag-and-drop fixed + VLC-style)
 *
 * FIX:
 *   - Drag menggunakan absolute INDEX bukan song.id → benar saat ada duplikat
 *   - dragOverIndex sebagai state visual
 *   - Drop logic recalculate queueIndex dengan benar
 *   - Hover state per-row untuk show/hide controls
 */

import { useState, useRef, useCallback } from "react";
import { usePlayerStore } from "../../store";
import type { Song } from "../../lib/db";
import CoverArt from "../CoverArt";

const fmt = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

interface Props {
  onPlay: (song: Song) => void;
}

export default function QueueView({ onPlay }: Props) {
  const {
    queue, queueIndex, currentSong,
    removeFromQueue, clearQueue, setQueue,
    shuffle, getUpNext,
  } = usePlayerStore() as any;

  const [showHistory, setShowHistory] = useState(false);
  const dragFromIndex = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const safeQueue: Song[] = Array.isArray(queue) ? queue : [];
  const safeIndex: number = typeof queueIndex === "number" ? queueIndex : 0;

  const upcoming = safeQueue.slice(safeIndex + 1);
  const played   = safeQueue.slice(0, safeIndex);
  const upNextPreview: Song[] = getUpNext ? getUpNext(5) : upcoming.slice(0, 5);

  const upcomingDuration = upcoming.reduce((a: number, s: Song) => a + (s.duration || 0), 0);
  const upcomingMin      = Math.round(upcomingDuration / 60);

  // ── Drag handlers — pakai absolute index dalam safeQueue ──────────────────
  const handleDragStart = useCallback((e: React.DragEvent, absIdx: number) => {
    dragFromIndex.current = absIdx;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(absIdx));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, absIdx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragFromIndex.current !== null && dragFromIndex.current !== absIdx) {
      setDragOverIndex(absIdx);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetAbsIdx: number) => {
    e.preventDefault();
    const fromAbsIdx = dragFromIndex.current;
    if (fromAbsIdx === null || fromAbsIdx === targetAbsIdx) {
      setDragOverIndex(null);
      dragFromIndex.current = null;
      return;
    }

    const newQueue = [...safeQueue];
    const [moved]  = newQueue.splice(fromAbsIdx, 1);
    newQueue.splice(targetAbsIdx, 0, moved);

    // Recalculate queueIndex agar lagu yang sedang play tidak bergeser
    let newIdx = safeIndex;
    if (fromAbsIdx === safeIndex) {
      newIdx = targetAbsIdx;
    } else if (fromAbsIdx < safeIndex && targetAbsIdx >= safeIndex) {
      newIdx = safeIndex - 1;
    } else if (fromAbsIdx > safeIndex && targetAbsIdx <= safeIndex) {
      newIdx = safeIndex + 1;
    }

    setQueue(newQueue, Math.max(0, Math.min(newIdx, newQueue.length - 1)));
    setDragOverIndex(null);
    dragFromIndex.current = null;
  }, [safeQueue, safeIndex, setQueue]);

  const handleDragEnd = useCallback(() => {
    setDragOverIndex(null);
    dragFromIndex.current = null;
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* ── Header ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 16, flexShrink: 0,
      }}>
        <div>
          <h3 style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.3px" }}>Queue</h3>
          <p style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
            {upcoming.length} lagu berikutnya
            {upcomingMin > 0 && ` · ~${upcomingMin} menit`}
            {shuffle && (
              <span style={{
                marginLeft: 8, fontSize: 10, color: "#a78bfa",
                background: "rgba(124,58,237,0.15)",
                padding: "1px 7px", borderRadius: 10,
                border: "1px solid rgba(124,58,237,0.3)",
              }}>⇄ Shuffle</span>
            )}
            {!shuffle && upcoming.length > 0 && (
              <span style={{ marginLeft: 8, fontSize: 10, color: "#4b5563" }}>
                ⠿ drag to reorder
              </span>
            )}
          </p>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {played.length > 0 && (
            <button
              onClick={() => setShowHistory(v => !v)}
              style={{
                padding: "5px 12px", borderRadius: 7, fontSize: 11,
                background: showHistory ? "rgba(124,58,237,0.15)" : "transparent",
                border: `1px solid ${showHistory ? "#7C3AED" : "#3f3f5a"}`,
                color: showHistory ? "#a78bfa" : "#9ca3af",
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              {showHistory ? "Sembunyikan" : `Riwayat (${played.length})`}
            </button>
          )}
          {safeQueue.length > 1 && (
            <button
              onClick={() => clearQueue?.()}
              style={{
                padding: "5px 14px", borderRadius: 7, fontSize: 11,
                background: "transparent", border: "1px solid #3f3f5a",
                color: "#9ca3af", cursor: "pointer", fontFamily: "inherit",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor="#EF4444"; e.currentTarget.style.color="#f87171"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor="#3f3f5a"; e.currentTarget.style.color="#9ca3af"; }}
            >
              Bersihkan
            </button>
          )}
        </div>
      </div>

      {/* ── List ── */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {safeQueue.length === 0 ? (
          <div style={{
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            height: "60%", color: "#6b7280", gap: 10,
          }}>
            <div style={{ fontSize: 36 }}>📋</div>
            <p style={{ fontSize: 13 }}>Queue kosong</p>
            <p style={{ fontSize: 12, color: "#4b5563" }}>
              Play lagu atau klik "+ Queue" untuk menambahkan
            </p>
          </div>
        ) : (
          <>
            {/* Now Playing */}
            {currentSong && (
              <div style={{ marginBottom: 16 }}>
                <SectionLabel color="#7C3AED">Sedang Diputar</SectionLabel>
                <QueueRow
                  song={currentSong} displayIndex={-1} isActive
                  onPlay={onPlay} onRemove={null}
                  draggable={false} isDragOver={false}
                  onDragStart={() => {}} onDragOver={() => {}}
                  onDrop={() => {}} onDragEnd={() => {}}
                />
              </div>
            )}

            {/* Up Next */}
            {upNextPreview.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <SectionLabel color="#a78bfa">
                  Selanjutnya{shuffle ? " (Acak)" : ""}
                </SectionLabel>
                {upNextPreview.map((song: Song, i: number) => {
                  const absIdx = safeIndex + 1 + i;
                  return (
                    <QueueRow
                      key={`upnext-${song.id}-${i}`}
                      song={song} displayIndex={i + 1}
                      onPlay={onPlay}
                      onRemove={shuffle ? null : () => removeFromQueue?.(song.id)}
                      dim={i >= 3}
                      draggable={!shuffle}
                      isDragOver={dragOverIndex === absIdx}
                      onDragStart={e => handleDragStart(e, absIdx)}
                      onDragOver={e => handleDragOver(e, absIdx)}
                      onDrop={e => handleDrop(e, absIdx)}
                      onDragEnd={handleDragEnd}
                    />
                  );
                })}
                {!shuffle && upcoming.length > 5 && (
                  <p style={{ fontSize: 12, color: "#6b7280", padding: "6px 12px", fontStyle: "italic" }}>
                    +{upcoming.length - 5} lagu lagi dalam queue...
                  </p>
                )}
              </div>
            )}

            {/* Full queue */}
            {!shuffle && upcoming.length > 5 && (
              <div style={{ marginBottom: 16 }}>
                <SectionLabel color="#6b7280">
                  Semua Queue ({upcoming.length} lagu)
                </SectionLabel>
                {upcoming.slice(5, 100).map((song: Song, i: number) => {
                  const absIdx = safeIndex + 6 + i;
                  return (
                    <QueueRow
                      key={`${song.id}-full-${i}`}
                      song={song} displayIndex={i + 6}
                      onPlay={onPlay}
                      onRemove={() => removeFromQueue?.(song.id)}
                      draggable
                      isDragOver={dragOverIndex === absIdx}
                      onDragStart={e => handleDragStart(e, absIdx)}
                      onDragOver={e => handleDragOver(e, absIdx)}
                      onDrop={e => handleDrop(e, absIdx)}
                      onDragEnd={handleDragEnd}
                    />
                  );
                })}
                {upcoming.length > 100 && (
                  <p style={{ fontSize: 11, color: "#4b5563", padding: "4px 12px" }}>
                    ... dan {upcoming.length - 100} lagu lagi
                  </p>
                )}
              </div>
            )}

            {/* History */}
            {showHistory && played.length > 0 && (
              <div>
                <SectionLabel color="#6b7280">Riwayat</SectionLabel>
                {played.slice(-20).reverse().map((song: Song, i: number) => (
                  <QueueRow
                    key={`${song.id}-past-${i}`}
                    song={song} displayIndex={-(i + 1)}
                    onPlay={onPlay} isPast onRemove={null}
                    draggable={false} isDragOver={false}
                    onDragStart={() => {}} onDragOver={() => {}}
                    onDrop={() => {}} onDragEnd={() => {}}
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

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionLabel({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <p style={{
      fontSize: 10, color,
      textTransform: "uppercase", letterSpacing: "0.1em",
      fontWeight: 700, marginBottom: 8, padding: "0 4px",
    }}>{children}</p>
  );
}

function QueueRow({
  song, displayIndex, isActive, isPast, dim, onPlay, onRemove,
  draggable, isDragOver, onDragStart, onDragOver, onDrop, onDragEnd,
}: {
  song: Song;
  displayIndex: number;
  isActive?: boolean;
  isPast?: boolean;
  dim?: boolean;
  onPlay: (s: Song) => void;
  onRemove: (() => void) | null;
  draggable: boolean;
  isDragOver: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      onDragOver={draggable ? onDragOver : undefined}
      onDrop={draggable ? onDrop : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "7px 10px", borderRadius: 8, marginBottom: 2,
        background: isDragOver
          ? "rgba(124,58,237,0.25)"
          : isActive ? "rgba(124,58,237,0.15)"
          : hovered ? "rgba(255,255,255,0.04)" : "transparent",
        opacity: isPast ? 0.4 : dim ? 0.6 : 1,
        border: isDragOver
          ? "1px dashed rgba(124,58,237,0.6)"
          : isActive ? "1px solid rgba(124,58,237,0.25)" : "1px solid transparent",
        userSelect: "none",
        cursor: "default",
      }}
    >
      {/* Drag handle */}
      {draggable && !isPast && (
        <span
          onClick={e => e.stopPropagation()}
          style={{
            color: hovered ? "#9ca3af" : "#3f3f5a",
            fontSize: 14, cursor: "grab",
            flexShrink: 0, padding: "0 2px",
            transition: "color 0.15s",
          }}
        >⠿</span>
      )}

      {/* Index */}
      <span style={{
        width: 26, textAlign: "center", fontSize: 11,
        color: isActive ? "#a78bfa" : "#6b7280",
        fontFamily: "monospace", flexShrink: 0,
        fontWeight: isActive ? 700 : 400,
      }}>
        {isActive ? "▶" : isPast ? "·" : displayIndex}
      </span>

      {/* Song info */}
      <div
        onClick={() => onPlay(song)}
        style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, overflow: "hidden", cursor: "pointer" }}
      >
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
      </div>

      {/* Duration */}
      <span style={{ fontSize: 11, color: "#8b95a3", fontFamily: "monospace", flexShrink: 0 }}>
        {fmt(song.duration)}
      </span>

      {/* Remove */}
      {onRemove && (
        <button
          onClick={e => { e.stopPropagation(); onRemove(); }}
          style={{
            width: 24, height: 24, borderRadius: 6, fontSize: 12,
            background: "rgba(239,68,68,0.12)", border: "1px solid transparent",
            color: "#f87171", cursor: "pointer",
            opacity: hovered ? 1 : 0, transition: "opacity 0.15s",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}
          title="Hapus dari queue"
        >✕</button>
      )}
    </div>
  );
}