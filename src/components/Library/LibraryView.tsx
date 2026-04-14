/**
 * LibraryView.tsx — v10 (Select Mode + Checkbox Fix)
 *
 * PERUBAHAN vs v9:
 *   [FIX] Checkbox tidak langsung muncul di semua baris — hanya muncul saat:
 *         1. selectionMode aktif (toggle via tombol "Select" di toolbar)
 *         2. Row di-hover saat selectionMode aktif
 *   [NEW] Tombol "Select" di toolbar untuk masuk/keluar selection mode
 *   [FIX] Klik baris saat TIDAK di selection mode = play lagu
 *   [FIX] Klik baris saat di selection mode = toggle select
 *   [FIX] Auto exit selection mode saat semua deselect
 *   [FIX] Kolom checkbox di header hanya tampil saat selectionMode aktif
 */

import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLibraryStore, usePlayerStore } from "../../store";
import { getDb, deleteSongs, getPlaylists, addToPlaylist, toggleLoved } from "../../lib/db";
import type { Song } from "../../lib/db";
import CoverArt from "../CoverArt";
import StarRating from "../StarRating";
import { toastInfo, toastSuccess } from "../Notification/ToastSystem";
import SongContextMenu, { ConfirmDeleteModal, BulkActionBar } from "../SongContextMenu";

interface Props {
  onPlay:      (song: Song, contextList?: Song[]) => void;
  onRating:    (songId: number, stars: number) => void;
  searchRef?:  React.RefObject<HTMLInputElement>;
  onPlayNext?: (song: Song) => void;
}

type SortKey = "title"|"artist"|"album"|"stars"|"play_count"|"date_added"|"bitrate"|"bpm"|"file_size"|"loved";
type GroupBy  = "none"|"artist"|"album"|"folder";

const fmt = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function getFolderName(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 2] ?? "Unknown";
}

function clampMenuPos(x: number, y: number, w = 220, h = 380) {
  return { x: Math.min(x, window.innerWidth - w - 8), y: Math.min(y, window.innerHeight - h - 8) };
}

function isNewTrack(dateAdded?: string, playCount?: number): boolean {
  if (!dateAdded) return false;
  if (playCount && playCount > 0) return false;
  return new Date(dateAdded).getTime() > Date.now() - 3 * 86400000;
}

const DEFAULT_COLS: Record<string, boolean> = {
  cover: true, title: true, artist: true, album: true,
  rating: true, plays: true, format: true,
  bpm: false, size: false, loved: true, duration: true,
};

export default function LibraryView({ onPlay, onRating, searchRef, onPlayNext }: Props) {
  const { songs, setSongs, isLoading, playlists, setPlaylists } = useLibraryStore() as any;
  const { currentSong, isPlaying } = usePlayerStore() as any;

  const [search, setSearch]             = useState("");
  const [sortKey, setSortKey]           = useState<SortKey>("title");
  const [sortDir, setSortDir]           = useState<"asc"|"desc">("asc");
  const [filterFormat, setFilterFormat] = useState("all");
  const [groupBy, setGroupBy]           = useState<GroupBy>("none");
  const [selected, setSelected]         = useState<Set<number>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false); // [NEW] explicit selection mode
  const [hoveredRowId, setHoveredRowId] = useState<number | null>(null); // [NEW] track hovered row
  const [contextMenu, setContextMenu]   = useState<{ x: number; y: number; songs: Song[] } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Song[] | null>(null);
  const [visibleCols, setVisibleCols]   = useState<Record<string, boolean>>(DEFAULT_COLS);
  const [showViewMenu, setShowViewMenu] = useState(false);
  const [showFormatDrop, setShowFormatDrop] = useState(false);
  const [focusedRowIdx, setFocusedRowIdx]   = useState(-1);

  const activeRowRef  = useRef<HTMLTableRowElement>(null);
  const focusedRowRef = useRef<HTMLTableRowElement>(null);
  const tableRef      = useRef<HTMLDivElement>(null);
  const lastClickRef  = useRef<{ id: number; time: number }>({ id: -1, time: 0 });
  const lastSelectedIdxRef = useRef<number>(-1);

  const safeSongs: Song[] = Array.isArray(songs) ? songs : [];

  const formats = useMemo(() => {
    const set = new Set(safeSongs.map(s => s.format?.toUpperCase()).filter(Boolean));
    return ["all", ...Array.from(set as Set<string>).sort()];
  }, [safeSongs]);

  const filtered = useMemo(() => {
    let result = safeSongs.filter(s => {
      const q = search.toLowerCase();
      const matchSearch = !q ||
        s.title?.toLowerCase().includes(q) ||
        s.artist?.toLowerCase().includes(q) ||
        s.album?.toLowerCase().includes(q);
      return matchSearch && (filterFormat === "all" || s.format?.toUpperCase() === filterFormat);
    });
    return [...result].sort((a, b) => {
      let va: any = a[sortKey as keyof Song] ?? "";
      let vb: any = b[sortKey as keyof Song] ?? "";
      if (typeof va === "string") va = va.toLowerCase();
      if (typeof vb === "string") vb = vb.toLowerCase();
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
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

  const flatList = useMemo(() => {
    if (grouped) { const r: Song[] = []; for (const s of grouped.values()) r.push(...s); return r; }
    return filtered;
  }, [grouped, filtered]);

  const selectedSongs = useMemo(() =>
    flatList.filter(s => selected.has(s.id)),
    [flatList, selected]
  );

  // Auto exit selection mode when nothing selected
  useEffect(() => {
    if (selected.size === 0 && selectionMode) {
      // Don't auto exit — user needs to click Exit to leave selection mode
    }
  }, [selected.size]);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelected(new Set());
    lastSelectedIdxRef.current = -1;
  }, []);

  const enterSelectionMode = useCallback(() => {
    setSelectionMode(true);
  }, []);

  useEffect(() => {
    if (!currentSong || !activeRowRef.current || !tableRef.current) return;
    const t = setTimeout(() => activeRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
    return () => clearTimeout(t);
  }, [currentSong?.id]);

  useEffect(() => {
    if (contextMenu) return;
    const handle = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowDown") { e.preventDefault(); setFocusedRowIdx(p => Math.min(p + 1, flatList.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setFocusedRowIdx(p => Math.max(p - 1, 0)); }
      else if (e.key === "Enter" && focusedRowIdx >= 0) { e.preventDefault(); const s = flatList[focusedRowIdx]; if (s) onPlay(s, flatList); }
      else if (e.key === "Escape") {
        setFocusedRowIdx(-1);
        if (selectionMode) exitSelectionMode();
      }
      else if (e.key === "a" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (!selectionMode) enterSelectionMode();
        setSelected(new Set(flatList.map(s => s.id)));
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [contextMenu, flatList, focusedRowIdx, onPlay, selectionMode]);

  useEffect(() => { if (focusedRowIdx >= 0) focusedRowRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [focusedRowIdx]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const toggleSelect = useCallback((id: number, idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (e.shiftKey && lastSelectedIdxRef.current >= 0) {
      const start = Math.min(lastSelectedIdxRef.current, idx);
      const end   = Math.max(lastSelectedIdxRef.current, idx);
      const rangeIds = flatList.slice(start, end + 1).map(s => s.id);
      setSelected(prev => {
        const next = new Set(prev);
        rangeIds.forEach(rid => next.add(rid));
        return next;
      });
    } else {
      setSelected(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      });
      lastSelectedIdxRef.current = idx;
    }
  }, [flatList]);

  const handleDelete = useCallback(async (songsToDelete: Song[]) => {
    const ids = songsToDelete.map(s => s.id);
    const db = await getDb();
    await deleteSongs(db, ids);
    setSongs((prev: Song[]) => Array.isArray(prev) ? prev.filter(s => !ids.includes(s.id)) : []);
    setSelected(new Set());
    setConfirmDelete(null);
    setContextMenu(null);
    if (selectionMode && ids.length === flatList.length) exitSelectionMode();
    toastSuccess(`${ids.length} lagu dihapus dari library`, {
      label: "Undo",
      onClick: async () => {
        const { upsertSong, getAllSongs } = await import("../../lib/db");
        for (const s of songsToDelete) try { await upsertSong(db, s); } catch {}
        setSongs(Array.isArray(await getAllSongs(db)) ? await getAllSongs(db) : []);
        toastSuccess(`${ids.length} lagu dikembalikan`);
      },
    });
  }, [setSongs, selectionMode, flatList.length, exitSelectionMode]);

  const handleAddToPlaylist = useCallback(async (playlistId: number, songsToAdd: Song[]) => {
    const db = await getDb();
    for (const s of songsToAdd) await addToPlaylist(db, playlistId, s.id);
    setContextMenu(null);
    toastSuccess(`${songsToAdd.length} lagu ditambahkan ke playlist`);
  }, []);

  const handleContextMenu = useCallback(async (e: React.MouseEvent, targetSongs: Song[]) => {
    e.preventDefault();
    try { const db = await getDb(); setPlaylists?.(await getPlaylists(db)); } catch {}
    const { x, y } = clampMenuPos(e.clientX, e.clientY);
    setContextMenu({ x, y, songs: targetSongs });
  }, []);

  const handleAddToQueue = useCallback((songsToAdd: Song[]) => {
    const store = usePlayerStore.getState() as any;
    songsToAdd.forEach(s => store.addToManualQueue(s));
    toastInfo(`${songsToAdd.length} lagu ditambahkan ke antrian`);
  }, []);

  const handlePlayNext = useCallback((songsToAdd: Song[]) => {
    const store = usePlayerStore.getState() as any;
    [...songsToAdd].reverse().forEach(s => store.playNextTrack(s));
    toastInfo(`${songsToAdd.length} lagu akan diputar berikutnya`);
  }, []);

  const handleToggleLoved = useCallback(async (song: Song) => {
    const db = await getDb();
    const newVal = await toggleLoved(db, song.id);
    setSongs((prev: Song[]) => Array.isArray(prev) ? prev.map(s => s.id === song.id ? { ...s, loved: newVal } : s) : prev);
    const { currentSong: cs, setCurrentSong: scs } = usePlayerStore.getState();
    if (cs && cs.id === song.id) scs({ ...cs, loved: newVal });
  }, [setSongs]);

  const handleRowClick = useCallback((song: Song, list: Song[], rowIdx: number, e: React.MouseEvent) => {
    // If clicking checkbox area do nothing extra
    if ((e.target as HTMLElement).closest("input[type=checkbox]")) return;

    if (selectionMode) {
      // In selection mode: toggle selection
      toggleSelect(song.id, rowIdx, e);
      return;
    }

    setFocusedRowIdx(rowIdx);
    const now = Date.now(); const last = lastClickRef.current;
    if (last.id === song.id && now - last.time < 400) {
      lastClickRef.current = { id: -1, time: 0 };
      handleAddToQueue([song]);
    } else {
      lastClickRef.current = { id: song.id, time: now };
      onPlay(song, list);
    }
  }, [onPlay, handleAddToQueue, selectionMode, toggleSelect]);

  const sortIcon = (key: SortKey) => sortKey !== key ? "" : sortDir === "asc" ? " ↑" : " ↓";

  const thStyle = (key: SortKey): React.CSSProperties => ({
    textAlign: "left", padding: "7px 10px", fontSize: 10,
    color: sortKey === key ? "var(--accent-light, #a78bfa)" : "var(--text-faint)",
    textTransform: "uppercase", letterSpacing: "0.08em",
    fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", userSelect: "none",
    background: "var(--bg-surface)",
    borderBottom: "1px solid var(--border)",
    position: "sticky" as const, top: 0, zIndex: 5,
  });

  if (isLoading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", border: "2.5px solid var(--accent, #7C3AED)", borderTopColor: "transparent", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Memuat library…</p>
      </div>
    </div>
  );

  if (safeSongs.length === 0) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 14, textAlign: "center", padding: 40 }}>
      <div style={{ width: 64, height: 64, borderRadius: 18, background: "var(--accent-dim, rgba(124,58,237,0.15))", border: "1px solid var(--accent-border, rgba(124,58,237,0.25))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>♪</div>
      <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text-muted)" }}>Library kosong</p>
      <p style={{ fontSize: 13, color: "var(--text-faint)" }}>Klik tombol scan di toolbar untuk menambah musik</p>
    </div>
  );

  let absoluteIdx = 0;

  const renderRow = (song: Song, i: number, contextList: Song[]) => {
    const rowIdx = absoluteIdx++;
    const isActive   = song.id === currentSong?.id;
    const isSelected = selected.has(song.id);
    const isFocused  = focusedRowIdx === rowIdx;
    const isNew      = isNewTrack(song.date_added, song.play_count);
    const isHovered  = hoveredRowId === song.id;
    // Show checkbox when: selection mode is active AND (row is hovered OR already selected)
    const showCheckbox = selectionMode && (isHovered || isSelected);

    return (
      <tr
        key={song.id}
        ref={isActive ? activeRowRef : isFocused ? focusedRowRef : undefined}
        onClick={e => handleRowClick(song, contextList, rowIdx, e)}
        onContextMenu={e => {
          const ctxSongs = isSelected && selected.size > 1 ? selectedSongs : [song];
          handleContextMenu(e, ctxSongs);
        }}
        onMouseEnter={() => setHoveredRowId(song.id)}
        onMouseLeave={() => setHoveredRowId(null)}
        style={{
          height: 50,
          background: isSelected
            ? "rgba(124,58,237,0.18)"
            : isFocused ? "rgba(124,58,237,0.12)"
            : isActive ? "rgba(124,58,237,0.1)"
            : isHovered ? "rgba(255,255,255,0.04)" : "transparent",
          cursor: selectionMode ? "default" : "pointer",
          borderBottom: "1px solid var(--border-subtle)",
          borderLeft: isActive ? "2px solid var(--accent, #7C3AED)" : "2px solid transparent",
          outline: isFocused ? "1px solid rgba(124,58,237,0.35)" : "none",
          outlineOffset: "-1px",
          transition: "background 0.1s",
        }}
      >
        {/* Checkbox column — always renders for layout, but content depends on mode */}
        <td style={{ padding: "0 10px", textAlign: "center", width: 40 }}>
          {isActive && isPlaying && !isSelected ? (
            // Playing bars when active + playing and not in select mode
            !selectionMode ? <PlayingBars /> : (
              showCheckbox ? (
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={e => toggleSelect(song.id, rowIdx, e as any)}
                  onClick={e => e.stopPropagation()}
                  style={{ accentColor: "var(--accent, #7C3AED)", cursor: "pointer" }}
                />
              ) : <PlayingBars />
            )
          ) : showCheckbox ? (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={e => toggleSelect(song.id, rowIdx, e as any)}
              onClick={e => e.stopPropagation()}
              style={{ accentColor: "var(--accent, #7C3AED)", cursor: "pointer" }}
            />
          ) : isSelected ? (
            // Always show checkbox if selected (even not hovered) in selection mode
            <input
              type="checkbox"
              checked={true}
              onChange={e => toggleSelect(song.id, rowIdx, e as any)}
              onClick={e => e.stopPropagation()}
              style={{ accentColor: "var(--accent, #7C3AED)", cursor: "pointer" }}
            />
          ) : (
            // Not in selection mode OR not hovered: show row number
            <span style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "monospace" }}>
              {rowIdx + 1}
            </span>
          )}
        </td>

        {/* Cover */}
        <td style={{ padding: "6px 6px 6px 0", width: 44 }}>
          <div style={{ position: "relative" }}>
            <CoverArt id={song.id} coverArt={song.cover_art} size={34} />
            {isNew && (
              <div style={{
                position: "absolute", top: -3, right: -3,
                fontSize: 10, fontWeight: 800,
                background: "var(--success)", color: "white",
                padding: "1px 4px", borderRadius: 3,
                fontFamily: "'Space Mono', monospace",
                lineHeight: 1.3,
              }}>NEW</div>
            )}
          </div>
        </td>

        {/* Title */}
        <td style={{ padding: "0 12px 0 0" }}>
          <div style={{
            fontWeight: 500, fontSize: 13,
            color: isActive ? "#c4b5fd" : "var(--text-primary)",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200,
          }}>
            {song.title}
          </div>
          {groupBy === "folder" && (
            <div style={{ fontSize: 10, color: "var(--text-faint)" }}>{getFolderName(song.path)}</div>
          )}
        </td>

        {/* Artist */}
        <td style={{ padding: "0 12px 0 0" }}>
          <span style={{ fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
            {song.artist}
          </span>
        </td>

        {/* Album */}
        <td style={{ padding: "0 12px 0 0" }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 140, display: "block" }}>
            {song.album}
          </span>
        </td>

        {visibleCols.rating && (
          <td style={{ padding: "0 12px 0 0" }} onClick={e => e.stopPropagation()}>
            <StarRating stars={song.stars ?? 0} onChange={s => onRating(song.id, s)} size={11} />
          </td>
        )}
        {visibleCols.plays && (
          <td style={{ padding: "0 12px 0 0", textAlign: "center" }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace" }}>{song.play_count ?? 0}</span>
          </td>
        )}
        {visibleCols.format && (
          <td style={{ padding: "0 12px 0 0" }}>
            <FormatBadge format={song.format} bitrate={song.bitrate} />
          </td>
        )}
        {visibleCols.bpm && (
          <td style={{ padding: "0 10px 0 0", textAlign: "center" }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace" }}>
              {song.bpm ? Math.round(song.bpm) : "—"}
            </span>
          </td>
        )}
        {visibleCols.size && (
          <td style={{ padding: "0 10px 0 0", textAlign: "right" }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace" }}>
              {song.file_size ? fmtSize(song.file_size) : "—"}
            </span>
          </td>
        )}
        {visibleCols.loved && (
          <td style={{ padding: "0 8px 0 0", textAlign: "center" }} onClick={e => e.stopPropagation()}>
            <button
              onClick={() => handleToggleLoved(song)}
              title={song.loved ? "Hapus dari favorit" : "Tambah ke favorit"}
              style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: 14, lineHeight: 1, padding: 2,
                color: song.loved ? "#EC4899" : "var(--border-medium)",
                transition: "color 0.15s, transform 0.1s",
              }}
              onMouseEnter={e => { e.currentTarget.style.color = "#EC4899"; e.currentTarget.style.transform = "scale(1.2)"; }}
              onMouseLeave={e => { e.currentTarget.style.color = song.loved ? "#EC4899" : "var(--border-medium)"; e.currentTarget.style.transform = "scale(1)"; }}
            >
              {song.loved ? "❤" : "♡"}
            </button>
          </td>
        )}
        {visibleCols.duration && (
          <td style={{ padding: "0 10px 0 0", textAlign: "right" }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace" }}>{fmt(song.duration)}</span>
          </td>
        )}
      </tr>
    );
  };

  absoluteIdx = 0;
  // +1 for checkbox col when selectionMode active (replaces number col which is always there)
  const colCount = 5 + Object.values(visibleCols).filter(Boolean).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {/* Context menu */}
      {contextMenu && (
        <SongContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          songs={contextMenu.songs}
          playlists={playlists ?? []}
          onClose={() => setContextMenu(null)}
          onPlayNow={ss => { const first = ss[0]; if (first) onPlay(first, ss.length > 1 ? ss : flatList); }}
          onPlayNext={handlePlayNext}
          onAddToQueue={handleAddToQueue}
          onAddToPlaylist={(pid, ss) => handleAddToPlaylist(pid, ss)}
          onToggleLoved={song => handleToggleLoved(song)}
          onShowInFolder={song => invoke("open_file_manager", { path: song.path })}
          onDelete={ss => setConfirmDelete(ss)}
        />
      )}

      {/* Confirm delete modal */}
      {confirmDelete && (
        <ConfirmDeleteModal
          songs={confirmDelete}
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* ── Toolbar ── */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "center", flexWrap: "wrap", flexShrink: 0 }}>
        {/* Search */}
        <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
          <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--text-faint)", fontSize: 12, pointerEvents: "none" }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="7" cy="7" r="5"/><line x1="10.5" y1="10.5" x2="14" y2="14"/></svg>
          </span>
          <input
            ref={searchRef} value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Cari ${safeSongs.length.toLocaleString()} lagu…`}
            style={{
              width: "100%", padding: "7px 28px 7px 28px",
              background: "var(--bg-overlay)", border: "1px solid var(--border)",
              borderRadius: "var(--radius-md, 8px)", color: "var(--text-primary)", fontSize: 12,
              fontFamily: "inherit", outline: "none",
            }}
            onFocus={e => e.currentTarget.style.borderColor = "rgba(124,58,237,0.4)"}
            onBlur={e => e.currentTarget.style.borderColor = "var(--border)"}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 13 }}>✕</button>
          )}
        </div>

        {/* Format filter */}
        {formats.length <= 6 ? (
          <div style={{ display: "flex", gap: 3 }}>
            {formats.map((f: string) => (
              <button key={f} onClick={() => setFilterFormat(f)} style={{
                padding: "4px 9px", borderRadius: "var(--radius-sm, 6px)", fontSize: 11,
                border: "1px solid",
                background: filterFormat === f ? "var(--accent-dim, rgba(124,58,237,0.18))" : "transparent",
                borderColor: filterFormat === f ? "var(--accent-border, rgba(124,58,237,0.35))" : "var(--border)",
                color: filterFormat === f ? "var(--accent-light, #a78bfa)" : "var(--text-muted)",
                cursor: "pointer", fontFamily: "inherit",
              }}>
                {f === "all" ? "Semua" : f}
              </button>
            ))}
          </div>
        ) : (
          <div style={{ position: "relative" }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowFormatDrop(v => !v)} style={{
              padding: "4px 10px", borderRadius: "var(--radius-sm, 6px)", fontSize: 11, cursor: "pointer",
              border: "1px solid",
              background: filterFormat !== "all" ? "var(--accent-dim, rgba(124,58,237,0.18))" : "transparent",
              borderColor: filterFormat !== "all" ? "var(--accent-border, rgba(124,58,237,0.35))" : "var(--border)",
              color: filterFormat !== "all" ? "var(--accent-light, #a78bfa)" : "var(--text-muted)",
              fontFamily: "inherit",
            }}>
              {filterFormat === "all" ? "Format ▾" : `${filterFormat} ▾`}
            </button>
            {showFormatDrop && (
              <div style={{
                position: "absolute", top: "calc(100% + 4px)", left: 0,
                background: "var(--bg-overlay)", border: "1px solid var(--border-medium)",
                borderRadius: "var(--radius-md, 8px)", padding: "4px", zIndex: 99, minWidth: 100,
                boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
              }}>
                {formats.map((f: string) => (
                  <button key={f} onClick={() => { setFilterFormat(f); setShowFormatDrop(false); }} style={{
                    display: "block", width: "100%", padding: "6px 12px", borderRadius: "var(--radius-sm, 6px)",
                    background: filterFormat === f ? "var(--accent-dim, rgba(124,58,237,0.18))" : "transparent",
                    border: "none", color: filterFormat === f ? "var(--accent-light, #a78bfa)" : "var(--text-secondary)",
                    fontSize: 12, cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                  }}>
                    {f === "all" ? "Semua format" : f}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* View menu */}
        <div style={{ position: "relative" }} onClick={e => e.stopPropagation()}>
          <button onClick={() => setShowViewMenu(v => !v)} style={{
            padding: "4px 10px", borderRadius: "var(--radius-sm, 6px)", fontSize: 11, cursor: "pointer",
            border: "1px solid var(--border)", background: "transparent",
            color: "var(--text-muted)", fontFamily: "inherit",
            display: "flex", alignItems: "center", gap: 4,
          }}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>
            Tampilan
          </button>
          {showViewMenu && (
            <div style={{
              position: "absolute", top: "calc(100% + 4px)", right: 0,
              background: "var(--bg-overlay)", border: "1px solid var(--border-medium)",
              borderRadius: "var(--radius-lg, 12px)", padding: "8px 4px", zIndex: 99,
              minWidth: 200, boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            }}>
              <p style={{ fontSize: 10, color: "var(--text-faint)", padding: "2px 12px 6px", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>Kelompokkan</p>
              {([["none","Tidak ada"],["artist","Artis"],["album","Album"],["folder","Folder"]] as [GroupBy,string][]).map(([val, label]) => (
                <button key={val} onClick={() => setGroupBy(val)} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  width: "100%", padding: "6px 12px", borderRadius: "var(--radius-sm, 6px)",
                  background: groupBy === val ? "var(--accent-dim, rgba(124,58,237,0.15))" : "transparent",
                  border: "none", color: groupBy === val ? "var(--accent-light, #a78bfa)" : "var(--text-secondary)",
                  fontSize: 12, cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                }}>
                  {label}
                  {groupBy === val && <span style={{ fontSize: 10 }}>✓</span>}
                </button>
              ))}
              <div style={{ height: 1, background: "var(--border-subtle)", margin: "6px 8px" }} />
              <p style={{ fontSize: 10, color: "var(--text-faint)", padding: "2px 12px 6px", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>Kolom</p>
              {([["rating","Rating"],["plays","Diputar"],["format","Format"],["bpm","BPM"],["size","Ukuran file"],["loved","Favorit"],["duration","Durasi"]] as [string,string][]).map(([col, label]) => (
                <label key={col} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "5px 12px", cursor: "pointer", borderRadius: "var(--radius-sm, 6px)",
                  fontSize: 12, color: visibleCols[col] ? "var(--text-primary)" : "var(--text-muted)",
                }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <input type="checkbox" checked={!!visibleCols[col]}
                    onChange={() => setVisibleCols(p => ({ ...p, [col]: !p[col] }))}
                    style={{ accentColor: "var(--accent, #7C3AED)", cursor: "pointer" }}
                  />
                  {label}
                </label>
              ))}
            </div>
          )}
        </div>

        <span style={{ fontSize: 11, color: "var(--text-faint)", whiteSpace: "nowrap" }}>
          {filtered.length.toLocaleString()} lagu
        </span>

        {/* [NEW] Select mode toggle button */}
        {!selectionMode ? (
          <button
            onClick={enterSelectionMode}
            style={{
              padding: "4px 10px", borderRadius: "var(--radius-sm, 6px)", fontSize: 11,
              border: "1px solid var(--border)", background: "transparent",
              color: "var(--text-muted)", cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", gap: 4,
            }}
            title="Masuk mode pilih (Ctrl+A untuk pilih semua)"
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="1" y="1" width="6" height="6" rx="1"/><path d="M9 3h6M9 8h6M3 11h12"/></svg>
            Pilih
          </button>
        ) : (
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            {/* Select all */}
            <button onClick={() => setSelected(new Set(flatList.map(s => s.id)))} style={{
              padding: "4px 9px", borderRadius: "var(--radius-sm, 6px)", fontSize: 11,
              border: "1px solid var(--accent-border, rgba(124,58,237,0.35))",
              background: "var(--accent-dim, rgba(124,58,237,0.1))",
              color: "var(--accent-light, #a78bfa)", cursor: "pointer", fontFamily: "inherit",
            }}>
              Pilih semua
            </button>
            {/* Exit selection mode */}
            <button onClick={exitSelectionMode} style={{
              padding: "4px 9px", borderRadius: "var(--radius-sm, 6px)", fontSize: 11,
              border: "1px solid var(--border)", background: "transparent",
              color: "var(--text-muted)", cursor: "pointer", fontFamily: "inherit",
            }}>
              ✕ Selesai
            </button>
          </div>
        )}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div style={{ marginBottom: 8, flexShrink: 0 }}>
          <BulkActionBar
            count={selected.size}
            playlists={playlists ?? []}
            onPlayNow={() => {
              const ss = selectedSongs;
              if (ss[0]) onPlay(ss[0], ss);
            }}
            onPlayNext={() => handlePlayNext(selectedSongs)}
            onAddToQueue={() => handleAddToQueue(selectedSongs)}
            onAddToPlaylist={pid => handleAddToPlaylist(pid, selectedSongs)}
            onDelete={() => setConfirmDelete(selectedSongs)}
            onClear={() => { setSelected(new Set()); }}
          />
        </div>
      )}

      {/* ── Table ── */}
      <div ref={tableRef} style={{ flex: 1, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {/* Header for number/checkbox column */}
              <th style={{ ...thStyle("title" as any), width: 40, cursor: selectionMode ? "pointer" : "default" }}
                onClick={() => {
                  if (!selectionMode) return;
                  if (selected.size === flatList.length) setSelected(new Set());
                  else setSelected(new Set(flatList.map(s => s.id)));
                }}
              >
                {selectionMode ? (
                  <input
                    type="checkbox"
                    checked={selected.size === flatList.length && flatList.length > 0}
                    onChange={() => {
                      if (selected.size === flatList.length) setSelected(new Set());
                      else setSelected(new Set(flatList.map(s => s.id)));
                    }}
                    style={{ accentColor: "var(--accent, #7C3AED)", cursor: "pointer" }}
                  />
                ) : (
                  <span style={{ fontSize: 9, color: "var(--text-faint)", fontWeight: 700, letterSpacing: "0.05em" }}>#</span>
                )}
              </th>
              <th style={{ ...thStyle("title" as any), width: 44, cursor: "default" }}></th>
              <th style={thStyle("title")} onClick={() => handleSort("title")}>Judul{sortIcon("title")}</th>
              <th style={thStyle("artist")} onClick={() => handleSort("artist")}>Artis{sortIcon("artist")}</th>
              <th style={thStyle("album")} onClick={() => handleSort("album")}>Album{sortIcon("album")}</th>
              {visibleCols.rating   && <th style={thStyle("stars" as any)} onClick={() => handleSort("stars" as any)}>Rating{sortIcon("stars" as any)}</th>}
              {visibleCols.plays    && <th style={thStyle("play_count")} onClick={() => handleSort("play_count")}>Diputar{sortIcon("play_count")}</th>}
              {visibleCols.format   && <th style={{ ...thStyle("bitrate" as any), width: 96 }}>Format</th>}
              {visibleCols.bpm      && <th style={{ ...thStyle("bpm"), width: 60 }} onClick={() => handleSort("bpm")}>BPM{sortIcon("bpm")}</th>}
              {visibleCols.size     && <th style={{ ...thStyle("file_size"), width: 70 }} onClick={() => handleSort("file_size")}>Ukuran{sortIcon("file_size")}</th>}
              {visibleCols.loved    && <th style={{ ...thStyle("loved" as any), width: 36, textAlign: "center" as const }}>❤</th>}
              {visibleCols.duration && <th style={{ ...thStyle("title" as any), width: 52, textAlign: "right" as const }}>Durasi</th>}
            </tr>
          </thead>
          <tbody>
            {grouped
              ? Array.from(grouped.entries()).map(([gName, gSongs]) => (
                <React.Fragment key={`group-${gName}`}>
                  <tr>
                    <td colSpan={colCount} style={{
                      padding: "12px 10px 5px",
                      fontSize: 10, fontWeight: 700,
                      color: "var(--accent-light, #a78bfa)",
                      textTransform: "uppercase", letterSpacing: "0.12em",
                      borderBottom: "1px solid var(--border)",
                    }}>
                      <span style={{
                        background: "var(--accent-dim, rgba(124,58,237,0.12))",
                        padding: "2px 9px", borderRadius: 4,
                        border: "1px solid var(--accent-border, rgba(124,58,237,0.2))",
                      }}>
                        {gName}
                      </span>
                      <span style={{ color: "var(--text-faint)", fontWeight: 400, marginLeft: 8 }}>
                        {gSongs.length} lagu
                      </span>
                    </td>
                  </tr>
                  {gSongs.map((song, i) => renderRow(song, i, gSongs))}
                </React.Fragment>
              ))
              : filtered.map((song: Song, i: number) => renderRow(song, i, filtered))}
          </tbody>
        </table>
      </div>

      {/* Selection mode hint */}
      {selectionMode && selected.size === 0 && (
        <div style={{
          position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)",
          background: "var(--bg-overlay)", border: "1px solid var(--border-medium)",
          borderRadius: "var(--radius-lg)", padding: "8px 16px",
          fontSize: 12, color: "var(--text-muted)",
          pointerEvents: "none", zIndex: 10,
          boxShadow: "var(--shadow-md)",
        }}>
          Klik lagu untuk memilih · Shift+klik untuk range · Ctrl+A untuk semua
        </div>
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function FormatBadge({ format, bitrate }: { format: string; bitrate: number }) {
  const isLossless = ["FLAC","WAV","ALAC","APE"].includes((format ?? "").toUpperCase());
  const br = bitrate >= 1000 ? `${Math.round(bitrate / 10) / 100}k` : `${bitrate || "?"}`;
  return (
    <span style={{
      fontSize: 10, fontFamily: "monospace", padding: "2px 5px", borderRadius: 4,
      background: isLossless ? "rgba(16,185,129,0.1)" : "rgba(99,102,241,0.1)",
      border: `1px solid ${isLossless ? "rgba(16,185,129,0.3)" : "rgba(99,102,241,0.3)"}`,
      color: isLossless ? "#34D399" : "#818CF8", whiteSpace: "nowrap",
    }}>
      {format} {br}
    </span>
  );
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 ** 3)).toFixed(2)} GB`;
}

function PlayingBars() {
  return (
    <div style={{ display: "flex", gap: 1.5, alignItems: "flex-end", height: 14, justifyContent: "center" }}>
      {[1,2,3].map(i => (
        <div key={i} style={{
          width: 2, background: "var(--accent-light, #a78bfa)", borderRadius: 1,
          animation: `bar-dance ${0.5 + i * 0.15}s ease-in-out ${i * 0.1}s infinite alternate`,
          height: `${4 + i * 3}px`,
        }} />
      ))}
      <style>{`@keyframes bar-dance{from{height:3px}to{height:14px}}`}</style>
    </div>
  );
}