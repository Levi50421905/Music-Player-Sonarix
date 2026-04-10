/**
 * LibraryView.tsx — Main Song Library
 *
 * Fix & fitur baru:
 *   - Delete lagu (single & multi-select)
 *   - Folder grouping toggle
 *   - Add to playlist dari context menu
 *   - Tombol konfirmasi delete
 */

import { useState, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLibraryStore, usePlayerStore } from "../../store";
import { getDb, deleteSongs, getPlaylists, addToPlaylist } from "../../lib/db";
import type { Song } from "../../lib/db";
import CoverArt from "../CoverArt";
import StarRating from "../StarRating";

interface Props {
  onPlay: (song: Song) => void;
  onRating: (songId: number, stars: number) => void;
  searchRef?: React.RefObject<HTMLInputElement>;
}

type SortKey = "title" | "artist" | "album" | "stars" | "play_count" | "date_added" | "bitrate";
type GroupBy = "none" | "artist" | "album" | "folder";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function getFolderName(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 2] ?? "Unknown";
}

export default function LibraryView({ onPlay, onRating, searchRef }: Props) {
  const { songs, setSongs, isLoading, playlists, setPlaylists } = useLibraryStore() as any;
  const { currentSong, isPlaying } = usePlayerStore();

  const [search, setSearch]         = useState("");
  const [sortKey, setSortKey]       = useState<SortKey>("title");
  const [sortDir, setSortDir]       = useState<"asc" | "desc">("asc");
  const [filterFormat, setFilterFormat] = useState("all");
  const [groupBy, setGroupBy]       = useState<GroupBy>("none");
  const [selected, setSelected]     = useState<Set<number>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; song: Song } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number[] | null>(null);
  const [addToPlaylistMenu, setAddToPlaylistMenu] = useState<{ song: Song } | null>(null);

  const formats = useMemo(() => {
    const set = new Set(songs.map((s: Song) => s.format?.toUpperCase()).filter(Boolean));
    return ["all", ...Array.from(set as Set<string>).sort()];
  }, [songs]);

  const filtered = useMemo(() => {
    let result = songs.filter((s: Song) => {
      const q = search.toLowerCase();
      const matchSearch = !q ||
        s.title?.toLowerCase().includes(q) ||
        s.artist?.toLowerCase().includes(q) ||
        s.album?.toLowerCase().includes(q);
      const matchFormat = filterFormat === "all" || s.format?.toUpperCase() === filterFormat;
      return matchSearch && matchFormat;
    });

    result = [...result].sort((a: Song, b: Song) => {
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

  // Group songs by folder/artist/album
  const grouped = useMemo(() => {
    if (groupBy === "none") return null;
    const map = new Map<string, Song[]>();
    for (const song of filtered) {
      const key = groupBy === "folder" ? getFolderName(song.path)
                : groupBy === "artist" ? (song.artist || "Unknown")
                : (song.album || "Unknown");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(song);
    }
    return map;
  }, [filtered, groupBy]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const toggleSelect = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDelete = useCallback(async (ids: number[]) => {
    const db = await getDb();
    await deleteSongs(db, ids);
    setSongs((prev: Song[]) => prev.filter(s => !ids.includes(s.id)));
    setSelected(new Set());
    setConfirmDelete(null);
    setContextMenu(null);
  }, [setSongs]);

  const handleAddToPlaylist = useCallback(async (playlistId: number, song: Song) => {
    const db = await getDb();
    await addToPlaylist(db, playlistId, song.id);
    setAddToPlaylistMenu(null);
    setContextMenu(null);
  }, []);

  const handleContextMenu = useCallback(async (e: React.MouseEvent, song: Song) => {
    e.preventDefault();
    // Load playlists
    try {
      const db = await getDb();
      const pls = await getPlaylists(db);
      setPlaylists?.(pls);
    } catch {}
    setContextMenu({ x: e.clientX, y: e.clientY, song });
  }, []);

  const sortIcon = (key: SortKey) => sortKey !== key ? "" : sortDir === "asc" ? " ↑" : " ↓";

  const thStyle = (key: SortKey): React.CSSProperties => ({
    textAlign: "left", padding: "6px 8px", fontSize: 10,
    color: sortKey === key ? "#a78bfa" : "#4b5563",
    textTransform: "uppercase", letterSpacing: "0.08em",
    fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
    userSelect: "none",
  });

  if (isLoading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#4b5563" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🎵</div>
        <p>Loading library...</p>
      </div>
    </div>
  );

  if (songs.length === 0) return <EmptyLibrary />;

  const renderRow = (song: Song, i: number) => {
    const isActive   = song.id === currentSong?.id;
    const isSelected = selected.has(song.id);

    return (
      <tr
        key={song.id}
        onClick={() => { if (selected.size > 0) toggleSelect(song.id, { stopPropagation: () => {} } as any); else onPlay(song); }}
        onContextMenu={e => handleContextMenu(e, song)}
        style={{
          background: isSelected ? "rgba(124,58,237,0.2)" : isActive ? "rgba(124,58,237,0.12)" : "transparent",
          cursor: "pointer", transition: "background 0.1s",
        }}
        onMouseEnter={e => { if (!isActive && !isSelected) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)"; }}
        onMouseLeave={e => { if (!isActive && !isSelected) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
      >
        {/* Checkbox / number */}
        <td style={{ padding: "8px", textAlign: "center", width: 32 }}>
          {selected.size > 0 ? (
            <input type="checkbox" checked={isSelected}
              onChange={e => toggleSelect(song.id, e as any)}
              onClick={e => e.stopPropagation()}
              style={{ accentColor: "#7C3AED", cursor: "pointer" }}
            />
          ) : isActive && isPlaying ? (
            <PlayingIndicator />
          ) : (
            <span style={{ fontSize: 11, color: "#4b5563", fontFamily: "monospace" }}>{i + 1}</span>
          )}
        </td>
        <td style={{ padding: "6px 4px" }}>
          <CoverArt id={song.id} coverArt={song.cover_art} size={38} />
        </td>
        <td style={{ padding: "8px" }}>
          <div style={{ fontWeight: 500, fontSize: 13, color: isActive ? "#a78bfa" : "#e2e8f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 180 }}>
            {song.title}
          </div>
          {groupBy === "folder" && (
            <div style={{ fontSize: 10, color: "#4b5563" }}>{getFolderName(song.path)}</div>
          )}
        </td>
        <td style={{ padding: "8px" }}><span style={{ fontSize: 12, color: "#9ca3af" }}>{song.artist}</span></td>
        <td style={{ padding: "8px" }}><span style={{ fontSize: 12, color: "#6b7280" }}>{song.album}</span></td>
        <td style={{ padding: "8px" }} onClick={e => e.stopPropagation()}>
          <StarRating stars={song.stars ?? 0} onChange={s => onRating(song.id, s)} size={11} />
        </td>
        <td style={{ padding: "8px", textAlign: "center" }}>
          <span style={{ fontSize: 11, color: "#6b7280", fontFamily: "monospace" }}>{song.play_count ?? 0}</span>
        </td>
        <td style={{ padding: "8px" }}><FormatBadge format={song.format} bitrate={song.bitrate} /></td>
        <td style={{ padding: "8px" }}><span style={{ fontSize: 11, color: "#6b7280", fontFamily: "monospace" }}>{fmt(song.duration)}</span></td>
      </tr>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}
      onClick={() => { contextMenu && setContextMenu(null); addToPlaylistMenu && setAddToPlaylistMenu(null); }}>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center", flexWrap: "wrap", flexShrink: 0 }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#4b5563", fontSize: 13, pointerEvents: "none" }}>🔍</span>
          <input
            ref={searchRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
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
          {formats.map((f: string) => (
            <button key={f} onClick={() => setFilterFormat(f)} style={{
              padding: "5px 10px", borderRadius: 6, fontSize: 11,
              border: "1px solid", cursor: "pointer", fontFamily: "inherit",
              background: filterFormat === f ? "rgba(124,58,237,0.2)" : "transparent",
              borderColor: filterFormat === f ? "#7C3AED" : "#2a2a3e",
              color: filterFormat === f ? "#a78bfa" : "#6b7280",
            }}>{f === "all" ? "All" : f}</button>
          ))}
        </div>

        {/* Group by */}
        <select value={groupBy} onChange={e => setGroupBy(e.target.value as GroupBy)} style={{
          padding: "5px 10px", background: "#1a1a2e", border: "1px solid #2a2a3e",
          borderRadius: 6, color: "#9ca3af", fontSize: 11, fontFamily: "inherit", cursor: "pointer",
        }}>
          <option value="none">No grouping</option>
          <option value="folder">📁 By Folder</option>
          <option value="artist">🎤 By Artist</option>
          <option value="album">💿 By Album</option>
        </select>

        <span style={{ fontSize: 11, color: "#4b5563", whiteSpace: "nowrap" }}>
          {filtered.length} / {songs.length} tracks
        </span>

        {/* Multi-select delete bar */}
        {selected.size > 0 && (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "#a78bfa" }}>{selected.size} selected</span>
            <button onClick={() => setConfirmDelete([...selected])} style={{
              padding: "4px 12px", borderRadius: 6, fontSize: 11,
              background: "rgba(239,68,68,0.15)", border: "1px solid #EF4444",
              color: "#f87171", cursor: "pointer", fontFamily: "inherit",
            }}>🗑 Delete</button>
            <button onClick={() => setSelected(new Set())} style={{
              padding: "4px 10px", borderRadius: 6, fontSize: 11,
              background: "transparent", border: "1px solid #3f3f5a",
              color: "#9ca3af", cursor: "pointer", fontFamily: "inherit",
            }}>✕ Clear</button>
          </div>
        )}
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ position: "sticky", top: 0, background: "#0a0a14", zIndex: 10 }}>
              <th style={{ width: 32, padding: "6px 8px" }}></th>
              <th style={{ width: 44 }}></th>
              <th style={thStyle("title")} onClick={() => handleSort("title")}>Title{sortIcon("title")}</th>
              <th style={thStyle("artist")} onClick={() => handleSort("artist")}>Artist{sortIcon("artist")}</th>
              <th style={thStyle("album")} onClick={() => handleSort("album")}>Album{sortIcon("album")}</th>
              <th style={thStyle("stars")} onClick={() => handleSort("stars")}>Rating{sortIcon("stars")}</th>
              <th style={thStyle("play_count")} onClick={() => handleSort("play_count")}>Plays{sortIcon("play_count")}</th>
              <th style={{ ...thStyle("bitrate"), width: 90 }}>Format</th>
              <th style={{ ...thStyle("title"), width: 60 }}>Time</th>
            </tr>
          </thead>
          <tbody>
            {grouped ? (
              Array.from(grouped.entries()).map(([groupName, groupSongs]) => (
                <>
                  <tr key={`group-${groupName}`}>
                    <td colSpan={9} style={{
                      padding: "12px 8px 6px",
                      fontSize: 11, fontWeight: 700, color: "#a78bfa",
                      textTransform: "uppercase", letterSpacing: "0.1em",
                      borderBottom: "1px solid #1a1a2e",
                    }}>
                      {groupName} <span style={{ color: "#4b5563", fontWeight: 400 }}>({groupSongs.length})</span>
                    </td>
                  </tr>
                  {groupSongs.map((song, i) => renderRow(song, i))}
                </>
              ))
            ) : (
              filtered.map((song: Song, i: number) => renderRow(song, i))
            )}
          </tbody>
        </table>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div style={{
          position: "fixed", left: contextMenu.x, top: contextMenu.y, zIndex: 200,
          background: "#1a1a2e", border: "1px solid #2a2a3e",
          borderRadius: 10, padding: 6, minWidth: 200,
          boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
        }} onClick={e => e.stopPropagation()}>
          <p style={{ fontSize: 11, color: "#6b7280", padding: "4px 10px 6px", borderBottom: "1px solid #2a2a3e", marginBottom: 4, fontWeight: 600 }}>
            {contextMenu.song.title}
          </p>
          {[
            { label: "▶ Play Now", action: () => { onPlay(contextMenu.song); setContextMenu(null); } },
            { label: "➕ Add to Queue", action: () => { setContextMenu(null); } },
          ].map(item => (
            <button key={item.label} onClick={item.action} style={ctxBtnStyle}>
              {item.label}
            </button>
          ))}

          {/* Add to Playlist submenu */}
          <div style={{ position: "relative" }}>
            <button
              onClick={e => { e.stopPropagation(); setAddToPlaylistMenu({ song: contextMenu.song }); }}
              style={ctxBtnStyle}
            >
              📋 Add to Playlist ›
            </button>
            {addToPlaylistMenu?.song.id === contextMenu.song.id && (
              <div style={{
                position: "absolute", left: "100%", top: 0,
                background: "#1a1a2e", border: "1px solid #2a2a3e",
                borderRadius: 10, padding: 6, minWidth: 160,
                boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
              }}>
                {playlists?.length === 0 ? (
                  <p style={{ fontSize: 11, color: "#4b5563", padding: "6px 10px" }}>No playlists yet</p>
                ) : (
                  playlists?.map((pl: any) => (
                    <button key={pl.id} onClick={() => handleAddToPlaylist(pl.id, contextMenu.song)} style={ctxBtnStyle}>
                      ♫ {pl.name}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div style={{ borderTop: "1px solid #2a2a3e", margin: "4px 0" }} />

          <button onClick={() => { invoke("open_file_manager", { path: contextMenu.song.path }); setContextMenu(null); }} style={ctxBtnStyle}>
            📁 Show in Folder
          </button>
          <button onClick={() => { setConfirmDelete([contextMenu.song.id]); setContextMenu(null); }} style={{ ...ctxBtnStyle, color: "#f87171" }}>
            🗑 Delete from Library
          </button>
        </div>
      )}

      {/* Confirm delete modal */}
      {confirmDelete && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 300,
          background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }} onClick={() => setConfirmDelete(null)}>
          <div style={{
            background: "#0d0d1f", border: "1px solid #2a2a3e",
            borderRadius: 12, padding: 24, maxWidth: 360, textAlign: "center",
            boxShadow: "0 16px 48px rgba(0,0,0,0.8)",
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🗑️</div>
            <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Hapus dari Library?</h3>
            <p style={{ fontSize: 12, color: "#9ca3af", marginBottom: 20, lineHeight: 1.6 }}>
              {confirmDelete.length} lagu akan dihapus dari library.<br />
              File audio di disk tidak akan terhapus.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button onClick={() => setConfirmDelete(null)} style={{
                padding: "8px 20px", borderRadius: 8, fontSize: 13,
                background: "transparent", border: "1px solid #3f3f5a",
                color: "#9ca3af", cursor: "pointer", fontFamily: "inherit",
              }}>Batal</button>
              <button onClick={() => handleDelete(confirmDelete)} style={{
                padding: "8px 20px", borderRadius: 8, fontSize: 13,
                background: "rgba(239,68,68,0.2)", border: "1px solid #EF4444",
                color: "#f87171", cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
              }}>Hapus</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const ctxBtnStyle: React.CSSProperties = {
  display: "block", width: "100%", padding: "7px 12px",
  textAlign: "left", background: "none", border: "none",
  color: "#d1d5db", fontSize: 12, cursor: "pointer",
  borderRadius: 6, fontFamily: "inherit", transition: "background 0.1s",
};

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
      <style>{`@keyframes bar-dance { from { height: 3px; } to { height: var(--bar-h); } }`}</style>
    </div>
  );
}

function FormatBadge({ format, bitrate }: { format: string; bitrate: number }) {
  const isLossless = ["FLAC", "WAV", "ALAC", "APE"].includes((format ?? "").toUpperCase());
  return (
    <span style={{
      fontSize: 9, fontFamily: "monospace", padding: "2px 5px", borderRadius: 4,
      background: isLossless ? "rgba(16,185,129,0.12)" : "rgba(99,102,241,0.12)",
      border: `1px solid ${isLossless ? "#059669" : "#4f46e5"}`,
      color: isLossless ? "#34D399" : "#818CF8", whiteSpace: "nowrap",
    }}>
      {format} {bitrate >= 1000 ? `${(bitrate / 1000).toFixed(0)}k` : bitrate}
    </span>
  );
}

function EmptyLibrary() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, color: "#4b5563", textAlign: "center", padding: 40 }}>
      <div style={{ fontSize: 48 }}>🎵</div>
      <p style={{ fontWeight: 600, fontSize: 16, color: "#6b7280" }}>Library kosong</p>
      <p style={{ fontSize: 13 }}>Klik 📁 di kanan atas untuk scan folder musik</p>
    </div>
  );
}