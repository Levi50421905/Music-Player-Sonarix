/**
 * LibraryView.tsx — Main Song Library
 *
 * Fitur:
 *   - Search real-time (title/artist/album)
 *   - Sort: title, artist, rating, plays, date added
 *   - Filter: format (FLAC/MP3/WAV...), genre
 *   - Context menu: add to playlist, show in folder
 *   - Double click / click → play
 *   - Inline star rating
 */

import { useState, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLibraryStore, usePlayerStore } from "../../store";
import type { Song } from "../../lib/db";
import CoverArt from "../CoverArt";
import StarRating from "../StarRating";

interface Props {
  onPlay: (song: Song) => void;
  onRating: (songId: number, stars: number) => void;
}

type SortKey = "title" | "artist" | "album" | "stars" | "play_count" | "date_added" | "bitrate";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export default function LibraryView({ onPlay, onRating }: Props) {
  const { songs, isLoading } = useLibraryStore();
  const { currentSong, isPlaying } = usePlayerStore();

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("title");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filterFormat, setFilterFormat] = useState("all");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; song: Song } | null>(null);

  // Unique formats in library
  const formats = useMemo(() => {
    const set = new Set(songs.map(s => s.format?.toUpperCase()).filter(Boolean));
    return ["all", ...Array.from(set).sort()];
  }, [songs]);

  // Filter + sort
  const filtered = useMemo(() => {
    let result = songs.filter(s => {
      const q = search.toLowerCase();
      const matchSearch = !q ||
        s.title?.toLowerCase().includes(q) ||
        s.artist?.toLowerCase().includes(q) ||
        s.album?.toLowerCase().includes(q);
      const matchFormat = filterFormat === "all" ||
        s.format?.toUpperCase() === filterFormat;
      return matchSearch && matchFormat;
    });

    result = [...result].sort((a, b) => {
      let va: any = a[sortKey] ?? "";
      let vb: any = b[sortKey] ?? "";
      if (typeof va === "string") va = va.toLowerCase();
      if (typeof vb === "string") vb = vb.toLowerCase();
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [songs, search, sortKey, sortDir, filterFormat]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const handleContextMenu = useCallback((e: React.MouseEvent, song: Song) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, song });
  }, []);

  const sortIcon = (key: SortKey) =>
    sortKey !== key ? "" : sortDir === "asc" ? " ↑" : " ↓";

  const thStyle = (key: SortKey): React.CSSProperties => ({
    textAlign: "left", padding: "6px 8px", fontSize: 10,
    color: sortKey === key ? "#a78bfa" : "#4b5563",
    textTransform: "uppercase", letterSpacing: "0.08em",
    fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
    userSelect: "none",
  });

  if (isLoading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, color: "#4b5563" }}>
      <div>
        <div style={{ fontSize: 32, textAlign: "center", marginBottom: 8 }}>🎵</div>
        <p>Loading library...</p>
      </div>
    </div>
  );

  if (songs.length === 0) return <EmptyLibrary />;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}
      onClick={() => contextMenu && setContextMenu(null)}>

      {/* Toolbar */}
      <div style={{
        display: "flex", gap: 10, marginBottom: 14,
        alignItems: "center", flexWrap: "wrap",
      }}>
        {/* Search */}
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <span style={{
            position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
            color: "#4b5563", fontSize: 13, pointerEvents: "none",
          }}>🔍</span>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search tracks, artists, albums..."
            style={{
              width: "100%", padding: "8px 12px 8px 32px",
              background: "#0d0d1f", border: "1px solid #2a2a3e",
              borderRadius: 8, color: "#e2e8f0", fontSize: 13,
              fontFamily: "inherit", outline: "none",
            }}
          />
        </div>

        {/* Format filter */}
        <div style={{ display: "flex", gap: 4 }}>
          {formats.map(f => (
            <button key={f} onClick={() => setFilterFormat(f)} style={{
              padding: "5px 10px", borderRadius: 6, fontSize: 11,
              border: "1px solid", cursor: "pointer", fontFamily: "inherit",
              background: filterFormat === f ? "rgba(124,58,237,0.2)" : "transparent",
              borderColor: filterFormat === f ? "#7C3AED" : "#2a2a3e",
              color: filterFormat === f ? "#a78bfa" : "#6b7280",
            }}>{f === "all" ? "All" : f}</button>
          ))}
        </div>

        {/* Stats */}
        <span style={{ fontSize: 11, color: "#4b5563", whiteSpace: "nowrap" }}>
          {filtered.length} / {songs.length} tracks
        </span>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ position: "sticky", top: 0, background: "#0a0a14", zIndex: 10 }}>
              <th style={{ width: 32, padding: "6px 8px" }}></th>
              <th style={{ width: 44 }}></th>
              <th style={thStyle("title")} onClick={() => handleSort("title")}>
                Title{sortIcon("title")}
              </th>
              <th style={thStyle("artist")} onClick={() => handleSort("artist")}>
                Artist{sortIcon("artist")}
              </th>
              <th style={thStyle("album")} onClick={() => handleSort("album")}>
                Album{sortIcon("album")}
              </th>
              <th style={thStyle("stars")} onClick={() => handleSort("stars")}>
                Rating{sortIcon("stars")}
              </th>
              <th style={thStyle("play_count")} onClick={() => handleSort("play_count")}>
                Plays{sortIcon("play_count")}
              </th>
              <th style={{ ...thStyle("bitrate"), width: 90 }}>Format</th>
              <th style={{ ...thStyle("title"), width: 60 }}>Time</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((song, i) => {
              const isActive = song.id === currentSong?.id;
              return (
                <tr
                  key={song.id}
                  onClick={() => onPlay(song)}
                  onContextMenu={e => handleContextMenu(e, song)}
                  style={{
                    background: isActive ? "rgba(124,58,237,0.12)" : "transparent",
                    cursor: "pointer",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={e => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)";
                  }}
                  onMouseLeave={e => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                >
                  {/* Row number / playing indicator */}
                  <td style={{ padding: "8px", textAlign: "center", width: 32 }}>
                    {isActive && isPlaying ? (
                      <PlayingIndicator />
                    ) : (
                      <span style={{ fontSize: 11, color: "#4b5563", fontFamily: "monospace" }}>
                        {i + 1}
                      </span>
                    )}
                  </td>

                  {/* Cover */}
                  <td style={{ padding: "6px 4px" }}>
                    <CoverArt id={song.id} coverArt={song.cover_art} size={38} />
                  </td>

                  {/* Title */}
                  <td style={{ padding: "8px" }}>
                    <div style={{
                      fontWeight: 500, fontSize: 13,
                      color: isActive ? "#a78bfa" : "#e2e8f0",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      maxWidth: 180,
                    }}>{song.title}</div>
                  </td>

                  {/* Artist */}
                  <td style={{ padding: "8px" }}>
                    <span style={{ fontSize: 12, color: "#9ca3af" }}>{song.artist}</span>
                  </td>

                  {/* Album */}
                  <td style={{ padding: "8px" }}>
                    <span style={{ fontSize: 12, color: "#6b7280" }}>{song.album}</span>
                  </td>

                  {/* Rating */}
                  <td style={{ padding: "8px" }} onClick={e => e.stopPropagation()}>
                    <StarRating
                      stars={song.stars ?? 0}
                      onChange={s => onRating(song.id, s)}
                      size={11}
                    />
                  </td>

                  {/* Plays */}
                  <td style={{ padding: "8px", textAlign: "center" }}>
                    <span style={{ fontSize: 11, color: "#6b7280", fontFamily: "monospace" }}>
                      {song.play_count ?? 0}
                    </span>
                  </td>

                  {/* Format badge */}
                  <td style={{ padding: "8px" }}>
                    <FormatBadge format={song.format} bitrate={song.bitrate} />
                  </td>

                  {/* Duration */}
                  <td style={{ padding: "8px" }}>
                    <span style={{ fontSize: 11, color: "#6b7280", fontFamily: "monospace" }}>
                      {fmt(song.duration)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x} y={contextMenu.y} song={contextMenu.song}
          onClose={() => setContextMenu(null)}
          onShowInFolder={async () => {
            await invoke("open_file_manager", { path: contextMenu.song.path });
            setContextMenu(null);
          }}
        />
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PlayingIndicator() {
  return (
    <div style={{ display: "flex", gap: 1.5, alignItems: "flex-end", height: 14, justifyContent: "center" }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{
          width: 2, background: "#a78bfa", borderRadius: 1,
          animation: `bar-dance ${0.5 + i * 0.15}s ease-in-out ${i * 0.1}s infinite alternate`,
          "--bar-h": `${6 + i * 3}px`,
        } as any} />
      ))}
      <style>{`
        @keyframes bar-dance { from { height: 3px; } to { height: var(--bar-h); } }
      `}</style>
    </div>
  );
}

function FormatBadge({ format, bitrate }: { format: string; bitrate: number }) {
  const isLossless = ["FLAC", "WAV", "ALAC", "APE"].includes((format ?? "").toUpperCase());
  return (
    <span style={{
      fontSize: 9, fontFamily: "monospace",
      padding: "2px 5px", borderRadius: 4,
      background: isLossless ? "rgba(16,185,129,0.12)" : "rgba(99,102,241,0.12)",
      border: `1px solid ${isLossless ? "#059669" : "#4f46e5"}`,
      color: isLossless ? "#34D399" : "#818CF8",
      whiteSpace: "nowrap",
    }}>
      {format} {bitrate >= 1000 ? `${(bitrate / 1000).toFixed(0)}k` : bitrate}
    </span>
  );
}

function EmptyLibrary() {
  return (
    <div style={{
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      flex: 1, gap: 12, color: "#4b5563",
      textAlign: "center", padding: 40,
    }}>
      <div style={{ fontSize: 48 }}>🎵</div>
      <p style={{ fontWeight: 600, fontSize: 16, color: "#6b7280" }}>Library kosong</p>
      <p style={{ fontSize: 13 }}>Klik 📁 di kanan atas untuk scan folder musik</p>
      <p style={{ fontSize: 11 }}>Support: MP3, FLAC, WAV, OGG, AAC, ALAC, dan lainnya</p>
    </div>
  );
}

function ContextMenu({ x, y, song, onClose, onShowInFolder }: {
  x: number; y: number; song: Song;
  onClose: () => void;
  onShowInFolder: () => void;
}) {
  const items = [
    { label: "▶ Play Now", action: onClose },
    { label: "➕ Add to Queue", action: onClose },
    { label: "📋 Add to Playlist", action: onClose },
    { label: "📁 Show in Folder", action: onShowInFolder },
    { label: "ℹ️ Track Info", action: onClose },
  ];

  return (
    <div
      style={{
        position: "fixed", left: x, top: y, zIndex: 100,
        background: "#1a1a2e", border: "1px solid #2a2a3e",
        borderRadius: 8, padding: 4,
        boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
        minWidth: 180,
      }}
    >
      <p style={{ fontSize: 11, color: "#6b7280", padding: "6px 12px 4px", borderBottom: "1px solid #2a2a3e", marginBottom: 4 }}>
        {song.title}
      </p>
      {items.map(item => (
        <button key={item.label} onClick={item.action} style={{
          display: "block", width: "100%", padding: "7px 12px",
          textAlign: "left", background: "none", border: "none",
          color: "#d1d5db", fontSize: 12, cursor: "pointer",
          borderRadius: 6, fontFamily: "inherit",
          transition: "background 0.1s",
        }}
          onMouseEnter={e => (e.currentTarget.style.background = "rgba(124,58,237,0.15)")}
          onMouseLeave={e => (e.currentTarget.style.background = "none")}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}