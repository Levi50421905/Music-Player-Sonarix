/**
 * TrackInfoModal.tsx — Detail metadata lagu
 *
 * Muncul saat user klik "Track Info" dari context menu.
 * Tampilkan semua metadata: path, format, bitrate, sample rate,
 * cover art besar, dan statistik (play count, rating, tanggal ditambah).
 */

import CoverArt from "../CoverArt";
import type { Song } from "../../lib/db";

interface Props {
  song: Song;
  onClose: () => void;
}

export default function TrackInfoModal({ song, onClose }: Props) {
  const fields: { label: string; value: string | number | null | undefined }[] = [
    { label: "Title",      value: song.title },
    { label: "Artist",     value: song.artist },
    { label: "Album",      value: song.album },
    { label: "Genre",      value: song.genre },
    { label: "Year",       value: song.year },
    { label: "Duration",   value: formatDuration(song.duration) },
    { label: "Format",     value: song.format },
    { label: "Bitrate",    value: song.bitrate ? `${song.bitrate} kbps` : "—" },
    { label: "BPM",        value: song.bpm ? Math.round(song.bpm) : "—" },
    { label: "Play Count", value: song.play_count ?? 0 },
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
          width: 480, background: "#0d0d1f",
          border: "1px solid #2a2a3e", borderRadius: 14,
          overflow: "hidden",
          boxShadow: "0 24px 80px rgba(0,0,0,0.8)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: "flex", gap: 16, padding: 20,
          background: "linear-gradient(to bottom, #1a1a2e, #0d0d1f)",
          borderBottom: "1px solid #1a1a2e",
        }}>
          <CoverArt id={song.id} coverArt={song.cover_art} size={72} />
          <div style={{ flex: 1, overflow: "hidden" }}>
            <h2 style={{
              fontWeight: 700, fontSize: 17, letterSpacing: "-0.3px",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>{song.title}</h2>
            <p style={{ color: "#9ca3af", fontSize: 13, marginTop: 3 }}>{song.artist}</p>
            <p style={{ color: "#6b7280", fontSize: 12, marginTop: 1 }}>{song.album}</p>
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "none", cursor: "pointer",
            color: "#6b7280", fontSize: 18, alignSelf: "flex-start",
          }}>✕</button>
        </div>

        {/* Metadata table */}
        <div style={{ padding: "12px 20px 20px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "1px 0" }}>
            {fields.map(({ label, value }) => (
              <React.Fragment key={label}>
                <div style={{
                  padding: "7px 0", fontSize: 11,
                  color: "#6b7280", fontWeight: 600,
                  textTransform: "uppercase", letterSpacing: "0.06em",
                  borderBottom: "1px solid #1a1a2e",
                }}>{label}</div>
                <div style={{
                  padding: "7px 8px", fontSize: 12, color: "#e2e8f0",
                  borderBottom: "1px solid #1a1a2e",
                  fontFamily: typeof value === "number" || label === "Bitrate" || label === "BPM"
                    ? "Space Mono, monospace" : "inherit",
                  color: label === "Rating" ? "#F59E0B" : "#e2e8f0",
                }}>{value ?? "—"}</div>
              </React.Fragment>
            ))}
          </div>

          {/* File path */}
          <div style={{ marginTop: 12 }}>
            <p style={{ fontSize: 10, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
              File Path
            </p>
            <p style={{
              fontSize: 10, color: "#4b5563",
              fontFamily: "Space Mono, monospace",
              wordBreak: "break-all",
              background: "#1a1a2e", padding: "6px 8px", borderRadius: 6,
              lineHeight: 1.5,
            }}>{song.path}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Need React import for Fragment
import React from "react";

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  return `${m}:${String(s).padStart(2,"0")}`;
}