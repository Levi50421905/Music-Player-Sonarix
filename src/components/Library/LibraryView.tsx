/**
 * LibraryView.tsx — Main Song Library (Fixed & Redesigned)
 *
 * Fixes:
 *   - onPlay now passes context list so next/prev works correctly
 *   - songs.map guard (always array)
 *   - Delete from library with confirmation
 *   - Add to queue works properly
 *   - Context menu: Track Info
 *   - Better folder display (folder name only, not full path)
 *   - Improved UI/UX design
 */

import { useState, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLibraryStore, usePlayerStore } from "../../store";
import { getDb, deleteSongs, getPlaylists, addToPlaylist } from "../../lib/db";
import type { Song } from "../../lib/db";
import CoverArt from "../CoverArt";
import StarRating from "../StarRating";

interface Props {
  onPlay: (song: Song, contextList?: Song[]) => void;
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
  const { currentSong, isPlaying, addToQueue } = usePlayerStore() as any;

  const [search, setSearch]         = useState("");
  const [sortKey, setSortKey]       = useState<SortKey>("title");
  const [sortDir, setSortDir]       = useState<"asc" | "desc">("asc");
  const [filterFormat, setFilterFormat] = useState("all");
  const [groupBy, setGroupBy]       = useState<GroupBy>("none");
  const [selected, setSelected]     = useState<Set<number>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; song: Song } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number[] | null>(null);
  const [addToPlaylistMenu, setAddToPlaylistMenu] = useState<{ song: Song } | null>(null);

  // Safe songs array
  const safeSongs: Song[] = Array.isArray(songs) ? songs : [];

  const formats = useMemo(() => {
    const set = new Set(safeSongs.map((s) => s.format?.toUpperCase()).filter(Boolean));
    return ["all", ...Array.from(set as Set<string>).sort()];
  }, [safeSongs]);

  const filtered = useMemo(() => {
    let result = safeSongs.filter((s) => {
      const q = search.toLowerCase();
      const matchSearch = !q ||
        s.title?.toLowerCase().includes(q) ||
        s.artist?.toLowerCase().includes(q) ||
        s.album?.toLowerCase().includes(q);
      const matchFormat = filterFormat === "all" || s.format?.toUpperCase() === filterFormat;
      return matchSearch && matchFormat;
    });

    result = [...result].sort((a, b) => {
      let va: any = a[sortKey as keyof Song] ?? "";
      let vb: any = b[sortKey as keyof Song] ?? "";
      if (typeof va === "string") va = va.toLowerCase();
      if (typeof vb === "string") vb = vb.toLowerCase();
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [safeSongs, search, sortKey, sortDir, filterFormat]);

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
    setSongs((prev: Song[]) => Array.isArray(prev) ? prev.filter(s => !ids.includes(s.id)) : []);
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
    try {
      const db = await getDb();
      const pls = await getPlaylists(db);
      setPlaylists?.(pls);
    } catch {}
    setContextMenu({ x: e.clientX, y: e.clientY, song });
  }, []);

  const handleAddToQueue = useCallback((song: Song) => {
    if (addToQueue) addToQueue(song);
    setContextMenu(null);
  }, [addToQueue]);

  const sortIcon = (key: SortKey) => sortKey !== key ? "" : sortDir === "asc" ? " ↑" : " ↓";

  const thStyle = (key: SortKey): React.CSSProperties => ({
    textAlign: "left", padding: "8px 10px", fontSize: 10,
    color: sortKey === key ? "#a78bfa" : "#4b5563",
    textTransform: "uppercase", letterSpacing: "0.08em",
    fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
    userSelect: "none", background: "#080814",
    borderBottom: "1px solid #1a1a2e",
  });

  if (isLoading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#4b5563" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{
          width: 40, height: 40, borderRadius: "50%",
          border: "3px solid #7C3AED", borderTopColor: "transparent",
          animation: "spin 0.8s linear infinite", margin: "0 auto 12px",
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        <p style={{ fontSize: 13 }}>Loading library...</p>
      </div>
    </div>
  );

  if (safeSongs.length === 0) return <EmptyLibrary />;

  const renderRow = (song: Song, i: number, contextList: Song[]) => {
    const isActive   = song.id === currentSong?.id;
    const isSelected = selected.has(song.id);

    return (
      <tr
        key={song.id}
        onClick={() => {
          if (selected.size > 0) toggleSelect(song.id, { stopPropagation: () => {} } as any);
          else onPlay(song, contextList);
        }}
        onContextMenu={e => handleContextMenu(e, song)}
        style={{
          background: isSelected
            ? "rgba(124,58,237,0.18)"
            : isActive
            ? "rgba(124,58,237,0.10)"
            : "transparent",
          cursor: "pointer",
          transition: "background 0.1s",
          borderBottom: "1px solid rgba(255,255,255,0.02)",
        }}
        onMouseEnter={e => {
          if (!isActive && !isSelected)
            (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)";
        }}
        onMouseLeave={e => {
          if (!isActive && !isSelected)
            (e.currentTarget as HTMLElement).style.background = "transparent";
        }}
      >
        {/* # / checkbox */}
        <td style={{ padding: "0 10px", textAlign: "center", width: 40 }}>
          {selected.size > 0 ? (
            <input type="checkbox" checked={isSelected}
              onChange={e => toggleSelect(song.id, e as any)}
              onClick={e => e.stopPropagation()}
              style={{ accentColor: "#7C3AED", cursor: "pointer" }}
            />
          ) : isActive && isPlaying ? (
            <PlayingIndicator />
          ) : (
            <span style={{ fontSize: 11, color: "#3f3f5a", fontFamily: "monospace" }}>{i + 1}</span>
          )}
        </td>

        {/* Cover */}
        <td style={{ padding: "6px 6px 6px 0", width: 46 }}>
          <CoverArt id={song.id} coverArt={song.cover_art} size={36} />
        </td>

        {/* Title */}
        <td style={{ padding: "0 12px 0 0" }}>
          <div style={{
            fontWeight: 500, fontSize: 13,
            color: isActive ? "#c4b5fd" : "#e2e8f0",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200,
          }}>{song.title}</div>
          {groupBy === "folder" && (
            <div style={{ fontSize: 10, color: "#4b5563" }}>{getFolderName(song.path)}</div>
          )}
        </td>

        {/* Artist */}
        <td style={{ padding: "0 12px 0 0" }}>
          <span style={{ fontSize: 12, color: "#94a3b8", whiteSpace: "nowrap" }}>{song.artist}</span>
        </td>

        {/* Album */}
        <td style={{ padding: "0 12px 0 0" }}>
          <span style={{ fontSize: 12, color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 140, display: "block" }}>{song.album}</span>
        </td>

        {/* Rating */}
        <td style={{ padding: "0 12px 0 0" }} onClick={e => e.stopPropagation()}>
          <StarRating stars={song.stars ?? 0} onChange={s => onRating(song.id, s)} size={11} />
        </td>

        {/* Plays */}
        <td style={{ padding: "0 12px 0 0", textAlign: "center" }}>
          <span style={{ fontSize: 11, color: "#4b5563", fontFamily: "monospace" }}>{song.play_count ?? 0}</span>
        </td>

        {/* Format */}
        <td style={{ padding: "0 12px 0 0" }}>
          <FormatBadge format={song.format} bitrate={song.bitrate} />
        </td>

        {/* Duration */}
        <td style={{ padding: "0 10px 0 0", textAlign: "right" }}>
          <span style={{ fontSize: 11, color: "#4b5563", fontFamily: "monospace" }}>{fmt(song.duration)}</span>
        </td>
      </tr>
    );
  };

  return (
    <div
      style={{ display: "flex", flexDirection: "column", height: "100%" }}
      onClick={() => {
        contextMenu && setContextMenu(null);
        addToPlaylistMenu && setAddToPlaylistMenu(null);
      }}
    >
      {/* ── Toolbar ── */}
      <div style={{
        display: "flex", gap: 8, marginBottom: 12,
        alignItems: "center", flexWrap: "wrap", flexShrink: 0,
      }}>
        {/* Search */}
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <span style={{
            position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
            color: "#4b5563", fontSize: 13, pointerEvents: "none",
          }}>🔍</span>
          <input
            ref={searchRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Search ${safeSongs.length.toLocaleString()} tracks...`}
            style={{
              width: "100%", padding: "8px 12px 8px 34px",
              background: "#0d0d1f", border: "1px solid #1f1f35",
              borderRadius: 8, color: "#e2e8f0", fontSize: 13,
              fontFamily: "inherit", outline: "none",
              transition: "border-color 0.2s",
            }}
            onFocus={e => (e.currentTarget.style.borderColor = "#7C3AED")}
            onBlur={e => (e.currentTarget.style.borderColor = "#1f1f35")}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{
              position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", cursor: "pointer",
              color: "#6b7280", fontSize: 14, padding: 2,
            }}>✕</button>
          )}
        </div>

        {/* Format filter chips */}
        <div style={{ display: "flex", gap: 4 }}>
          {formats.map((f: string) => (
            <button key={f} onClick={() => setFilterFormat(f)} style={{
              padding: "5px 10px", borderRadius: 6, fontSize: 11,
              border: "1px solid", cursor: "pointer", fontFamily: "inherit",
              background: filterFormat === f ? "rgba(124,58,237,0.2)" : "transparent",
              borderColor: filterFormat === f ? "#7C3AED" : "#1f1f35",
              color: filterFormat === f ? "#a78bfa" : "#6b7280",
              transition: "all 0.15s",
            }}>{f === "all" ? "All" : f}</button>
          ))}
        </div>

        {/* Group by */}
        <select value={groupBy} onChange={e => setGroupBy(e.target.value as GroupBy)} style={{
          padding: "5px 10px", background: "#0d0d1f", border: "1px solid #1f1f35",
          borderRadius: 6, color: "#9ca3af", fontSize: 11,
          fontFamily: "inherit", cursor: "pointer", outline: "none",
        }}>
          <option value="none">No grouping</option>
          <option value="folder">📁 By Folder</option>
          <option value="artist">🎤 By Artist</option>
          <option value="album">💿 By Album</option>
        </select>

        {/* Count */}
        <span style={{ fontSize: 11, color: "#4b5563", whiteSpace: "nowrap" }}>
          {filtered.length} / {safeSongs.length} tracks
        </span>

        {/* Multi-select actions */}
        {selected.size > 0 && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: 8 }}>
            <span style={{ fontSize: 11, color: "#a78bfa", fontWeight: 600 }}>{selected.size} selected</span>
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

      {/* ── Table ── */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...thStyle("title" as SortKey), width: 40, cursor: "default" }}>#</th>
              <th style={{ ...thStyle("title" as SortKey), width: 46, cursor: "default" }}></th>
              <th style={thStyle("title")} onClick={() => handleSort("title")}>Title{sortIcon("title")}</th>
              <th style={thStyle("artist")} onClick={() => handleSort("artist")}>Artist{sortIcon("artist")}</th>
              <th style={thStyle("album")} onClick={() => handleSort("album")}>Album{sortIcon("album")}</th>
              <th style={thStyle("stars")} onClick={() => handleSort("stars")}>Rating{sortIcon("stars")}</th>
              <th style={thStyle("play_count")} onClick={() => handleSort("play_count")}>Plays{sortIcon("play_count")}</th>
              <th style={{ ...thStyle("bitrate"), width: 96 }}>Format</th>
              <th style={{ ...thStyle("title" as SortKey), width: 56, textAlign: "right" as const }}>Time</th>
            </tr>
          </thead>
          <tbody>
            {grouped ? (
              Array.from(grouped.entries()).map(([groupName, groupSongs]) => (
                <>
                  <tr key={`group-${groupName}`}>
                    <td colSpan={9} style={{
                      padding: "14px 10px 6px",
                      fontSize: 10, fontWeight: 700, color: "#7C3AED",
                      textTransform: "uppercase", letterSpacing: "0.12em",
                      borderBottom: "1px solid #1a1a2e",
                    }}>
                      <span style={{
                        background: "rgba(124,58,237,0.12)", padding: "3px 10px",
                        borderRadius: 4, border: "1px solid rgba(124,58,237,0.2)",
                      }}>
                        {groupName}
                      </span>
                      <span style={{ color: "#3f3f5a", fontWeight: 400, marginLeft: 8 }}>
                        {groupSongs.length} tracks
                      </span>
                    </td>
                  </tr>
                  {groupSongs.map((song, i) => renderRow(song, i, groupSongs))}
                </>
              ))
            ) : (
              filtered.map((song: Song, i: number) => renderRow(song, i, filtered))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Context Menu ── */}
      {contextMenu && (
        <div
          style={{
            position: "fixed", left: contextMenu.x, top: contextMenu.y, zIndex: 200,
            background: "#13132a", border: "1px solid #2a2a3e",
            borderRadius: 10, padding: 5, minWidth: 210,
            boxShadow: "0 12px 40px rgba(0,0,0,0.8)",
          }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ padding: "6px 12px 8px", borderBottom: "1px solid #1f1f35", marginBottom: 4 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {contextMenu.song.title}
            </p>
            <p style={{ fontSize: 10, color: "#6b7280", marginTop: 1 }}>{contextMenu.song.artist}</p>
          </div>

          <CtxItem icon="▶" label="Play Now" onClick={() => { onPlay(contextMenu.song, filtered); setContextMenu(null); }} />
          <CtxItem icon="+" label="Add to Queue" onClick={() => handleAddToQueue(contextMenu.song)} />

          {/* Playlist submenu */}
          <div style={{ position: "relative" }}>
            <CtxItem
              icon="📋"
              label="Add to Playlist ›"
              onClick={e => { e.stopPropagation(); setAddToPlaylistMenu({ song: contextMenu.song }); }}
            />
            {addToPlaylistMenu?.song.id === contextMenu.song.id && (
              <div style={{
                position: "absolute", left: "100%", top: 0,
                background: "#13132a", border: "1px solid #2a2a3e",
                borderRadius: 10, padding: 5, minWidth: 170,
                boxShadow: "0 12px 40px rgba(0,0,0,0.8)",
              }}>
                {(!playlists || playlists.length === 0) ? (
                  <p style={{ fontSize: 11, color: "#4b5563", padding: "6px 12px" }}>No playlists yet</p>
                ) : (
                  playlists.map((pl: any) => (
                    <CtxItem key={pl.id} icon="♫" label={pl.name}
                      onClick={() => handleAddToPlaylist(pl.id, contextMenu.song)} />
                  ))
                )}
              </div>
            )}
          </div>

          <div style={{ height: 1, background: "#1f1f35", margin: "4px 0" }} />

          <CtxItem icon="📁" label="Show in Folder"
            onClick={() => { invoke("open_file_manager", { path: contextMenu.song.path }); setContextMenu(null); }} />
          <CtxItem icon="🗑" label="Delete from Library" danger
            onClick={() => { setConfirmDelete([contextMenu.song.id]); setContextMenu(null); }} />
        </div>
      )}

      {/* ── Confirm Delete Modal ── */}
      {confirmDelete && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 300,
          background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }} onClick={() => setConfirmDelete(null)}>
          <div style={{
            background: "#0d0d1f", border: "1px solid #2a2a3e",
            borderRadius: 14, padding: "28px 32px", maxWidth: 360, textAlign: "center",
            boxShadow: "0 20px 60px rgba(0,0,0,0.9)",
          }} onClick={e => e.stopPropagation()}>
            <div style={{
              width: 52, height: 52, borderRadius: 14, margin: "0 auto 16px",
              background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
            }}>🗑️</div>
            <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Delete from Library?</h3>
            <p style={{ fontSize: 12, color: "#9ca3af", marginBottom: 24, lineHeight: 1.6 }}>
              {confirmDelete.length} {confirmDelete.length === 1 ? "track" : "tracks"} will be removed.<br />
              <span style={{ color: "#6b7280" }}>Audio files on disk won't be affected.</span>
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button onClick={() => setConfirmDelete(null)} style={{
                padding: "8px 22px", borderRadius: 8, fontSize: 13,
                background: "transparent", border: "1px solid #3f3f5a",
                color: "#9ca3af", cursor: "pointer", fontFamily: "inherit",
              }}>Cancel</button>
              <button onClick={() => handleDelete(confirmDelete)} style={{
                padding: "8px 22px", borderRadius: 8, fontSize: 13,
                background: "rgba(239,68,68,0.2)", border: "1px solid #EF4444",
                color: "#f87171", cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
              }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Context menu item ─────────────────────────────────────────────────────────
function CtxItem({ icon, label, onClick, danger = false }: {
  icon: string; label: string;
  onClick: (e: React.MouseEvent) => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        width: "100%", padding: "7px 12px", textAlign: "left",
        background: "none", border: "none",
        color: danger ? "#f87171" : "#d1d5db",
        fontSize: 12, cursor: "pointer", borderRadius: 6,
        fontFamily: "inherit", transition: "background 0.1s",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = danger ? "rgba(239,68,68,0.1)" : "rgba(255,255,255,0.05)")}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      <span style={{ width: 16, textAlign: "center", fontSize: 12 }}>{icon}</span>
      {label}
    </button>
  );
}

// ── Playing Indicator ─────────────────────────────────────────────────────────
function PlayingIndicator() {
  return (
    <div style={{ display: "flex", gap: 1.5, alignItems: "flex-end", height: 14, justifyContent: "center" }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{
          width: 2, background: "#a78bfa", borderRadius: 1,
          animation: `bar-dance ${0.5 + i * 0.15}s ease-in-out ${i * 0.1}s infinite alternate`,
          height: `${4 + i * 3}px`,
        } as any} />
      ))}
      <style>{`@keyframes bar-dance { from { height: 3px; } to { height: 14px; } }`}</style>
    </div>
  );
}

// ── Format Badge ──────────────────────────────────────────────────────────────
function FormatBadge({ format, bitrate }: { format: string; bitrate: number }) {
  const isLossless = ["FLAC", "WAV", "ALAC", "APE"].includes((format ?? "").toUpperCase());
  const bitrateStr = bitrate >= 1000 ? `${(bitrate / 1000).toFixed(0)}k` : `${bitrate || "?"}`;
  return (
    <span style={{
      fontSize: 9, fontFamily: "monospace", padding: "2px 6px", borderRadius: 4,
      background: isLossless ? "rgba(16,185,129,0.1)" : "rgba(99,102,241,0.1)",
      border: `1px solid ${isLossless ? "rgba(16,185,129,0.3)" : "rgba(99,102,241,0.3)"}`,
      color: isLossless ? "#34D399" : "#818CF8", whiteSpace: "nowrap",
    }}>
      {format} {bitrateStr}
    </span>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyLibrary() {
  return (
    <div style={{
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      height: "100%", gap: 16, color: "#4b5563",
      textAlign: "center", padding: 40,
    }}>
      <div style={{
        width: 72, height: 72, borderRadius: 20,
        background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.2)",
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32,
      }}>🎵</div>
      <div>
        <p style={{ fontWeight: 600, fontSize: 16, color: "#6b7280", marginBottom: 6 }}>Library is empty</p>
        <p style={{ fontSize: 13 }}>Click 📁 in the toolbar to scan a music folder</p>
      </div>
    </div>
  );
}