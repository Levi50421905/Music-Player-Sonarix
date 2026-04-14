/**
 * TrackInfoModal.tsx — v2 (Design Fix)
 *
 * PERUBAHAN vs v1:
 *   [FIX] Semua hardcode hex (#0d0d1f, #1a1a2e, #2a2a3e, #9ca3af, #6b7280, #4b5563, #e2e8f0, #F59E0B) → CSS variable
 */

import React from "react";
import CoverArt from "../CoverArt";
import type { Song } from "../../lib/db";

interface Props {
  song: Song;
  onClose: () => void;
}

export default function TrackInfoModal({ song, onClose }: Props) {
  const fields: { label: string; value: string | number | null | undefined; mono?: boolean }[] = [
    { label: "Title",      value: song.title },
    { label: "Artist",     value: song.artist },
    { label: "Album",      value: song.album },
    { label: "Genre",      value: song.genre },
    { label: "Year",       value: song.year },
    { label: "Duration",   value: formatDuration(song.duration), mono: true },
    { label: "Format",     value: song.format, mono: true },
    { label: "Bitrate",    value: song.bitrate ? `${song.bitrate} kbps` : "—", mono: true },
    { label: "BPM",        value: song.bpm ? Math.round(song.bpm) : "—", mono: true },
    { label: "Play Count", value: song.play_count ?? 0, mono: true },
    { label: "Rating",     value: song.stars ? "★".repeat(song.stars) + "☆".repeat(5 - song.stars) : "Not rated" },
    { label: "Added",      value: song.date_added ? new Date(song.date_added).toLocaleDateString() : "—" },
  ];

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        background: "rgba(0,0,0,0.8)",
        display: "flex", alignItems: "center", justifyContent: "center",
        backdropFilter: "blur(8px)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 480,
          background: "var(--bg-overlay)",
          border: "1px solid var(--border-medium)",
          borderRadius: "var(--radius-xl)",
          overflow: "hidden",
          boxShadow: "var(--shadow-lg)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: "flex", gap: 16, padding: 20,
          background: "var(--bg-surface)",
          borderBottom: "1px solid var(--border-subtle)",
        }}>
          <CoverArt id={song.id} coverArt={song.cover_art} size={72} />
          <div style={{ flex: 1, overflow: "hidden" }}>
            <h2 style={{
              fontWeight: 700, fontSize: 17, letterSpacing: "-0.3px",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              color: "var(--text-primary)",
            }}>
              {song.title}
            </h2>
            <p style={{ color: "var(--text-secondary)", fontSize: 13, marginTop: 3 }}>
              {song.artist}
            </p>
            <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 1 }}>
              {song.album}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              color: "var(--text-muted)",
              width: 28, height: 28,
              alignSelf: "flex-start",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14,
              flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.color = "var(--text-primary)"; e.currentTarget.style.borderColor = "var(--border-medium)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.borderColor = "var(--border)"; }}
          >
            ✕
          </button>
        </div>

        {/* Metadata table */}
        <div style={{ padding: "12px 20px 20px" }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 2fr",
            gap: "1px 0",
            borderRadius: "var(--radius-md)",
            overflow: "hidden",
            border: "1px solid var(--border-subtle)",
          }}>
            {fields.map(({ label, value, mono }, idx) => (
              <React.Fragment key={label}>
                <div style={{
                  padding: "7px 10px",
                  fontSize: 11,
                  color: "var(--text-muted)",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  borderBottom: idx < fields.length - 1 ? "1px solid var(--border-subtle)" : "none",
                  background: idx % 2 === 0 ? "var(--bg-muted)" : "transparent",
                }}>
                  {label}
                </div>
                <div style={{
                  padding: "7px 10px",
                  fontSize: 12,
                  borderBottom: idx < fields.length - 1 ? "1px solid var(--border-subtle)" : "none",
                  background: idx % 2 === 0 ? "var(--bg-muted)" : "transparent",
                  fontFamily: mono ? "'Space Mono', monospace" : "inherit",
                  color: label === "Rating" ? "var(--warning)" : "var(--text-primary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {value ?? "—"}
                </div>
              </React.Fragment>
            ))}
          </div>

          {/* File path */}
          <div style={{ marginTop: 12 }}>
            <p style={{
              fontSize: 10,
              color: "var(--text-faint)",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 4,
            }}>
              File Path
            </p>
            <p style={{
              fontSize: 10,
              color: "var(--text-muted)",
              fontFamily: "'Space Mono', monospace",
              wordBreak: "break-all",
              background: "var(--bg-muted)",
              border: "1px solid var(--border-subtle)",
              padding: "6px 8px",
              borderRadius: "var(--radius-sm)",
              lineHeight: 1.5,
              userSelect: "text",
            }}>
              {song.path}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}