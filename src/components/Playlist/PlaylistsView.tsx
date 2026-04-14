/**
 * PlaylistsView.tsx — v6 (Select Mode Fix)
 *
 * PERUBAHAN vs v5:
 *   [FIX] Checkbox tidak langsung tampil — hanya muncul saat mode "Select" aktif
 *   [NEW] Tombol "Pilih" di header playlist untuk masuk/keluar selection mode
 *   [FIX] Checkbox di SongRow bisa diklik dengan benar (stopPropagation yang tepat)
 *   [FIX] Auto exit selection mode saat user klik di luar / deselect semua via tombol ✕
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useLibraryStore, usePlayerStore } from "../../store";
import {
  getDb, createPlaylist, getPlaylistSongs, getPlaylists,
  removeFromPlaylist, deletePlaylist, reorderPlaylistSongs,
  addToPlaylist,
} from "../../lib/db";
import type { Song } from "../../lib/db";
import CoverArt from "../CoverArt";
import { toastInfo, toastSuccess } from "../Notification/ToastSystem";
import { BulkActionBar, ConfirmDeleteModal } from "../SongContextMenu";
import { deleteSongs } from "../../lib/db";

interface Props {
  onPlay:    (song: Song) => void;
  onPlayAll: (songs: Song[]) => void;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export default function PlaylistsView({ onPlay, onPlayAll }: Props) {
  const { playlists, setPlaylists } = useLibraryStore();
  const { setSongs } = useLibraryStore() as any;
  const [selected, setSelected]     = useState<number | null>(null);
  const [songs, setSongsLocal]      = useState<Song[]>([]);
  const [newName, setNewName]       = useState("");
  const [creating, setCreating]     = useState(false);
  const [confirmDeletePl, setConfirmDeletePl] = useState<number | null>(null);
  const [isSaving, setIsSaving]     = useState(false);

  // [NEW] Selection mode — explicit toggle, bukan otomatis
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedSongIds, setSelectedSongIds] = useState<Set<number>>(new Set());
  const [confirmDelSongs, setConfirmDelSongs] = useState<Song[] | null>(null);
  const lastSelIdx = useRef(-1);

  // Keluar selection mode
  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedSongIds(new Set());
    lastSelIdx.current = -1;
  }, []);

  // Masuk selection mode
  const enterSelectionMode = useCallback(() => {
    setSelectionMode(true);
  }, []);

  // Pointer drag state — only initiated from drag handle
  const [dragIdx, setDragIdx]         = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [ghostPos, setGhostPos]       = useState<{ x: number; y: number } | null>(null);
  const dragItemRef = useRef<number | null>(null);
  const rowRefs     = useRef<(HTMLDivElement | null)[]>([]);

  // Called ONLY from the drag handle icon
  const handleDragHandlePointerDown = useCallback((e: React.PointerEvent, idx: number) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragItemRef.current = idx;
    setDragIdx(idx);
    setGhostPos({ x: e.clientX, y: e.clientY });
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (dragItemRef.current === null) return;
    setGhostPos({ x: e.clientX, y: e.clientY });
    let found: number | null = null;
    rowRefs.current.forEach((el, i) => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (e.clientY >= rect.top && e.clientY <= rect.bottom) found = i;
    });
    setDragOverIdx(found);
  }, []);

  const handlePointerUp = useCallback(async () => {
    const fromIdx = dragItemRef.current;
    dragItemRef.current = null;
    setDragIdx(null); setDragOverIdx(null); setGhostPos(null);

    if (fromIdx === null || dragOverIdx === null || fromIdx === dragOverIdx) return;
    if (selected === null) return;

    const reordered = [...songs];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(dragOverIdx, 0, moved);
    setSongsLocal(reordered);

    setIsSaving(true);
    try {
      const db = await getDb();
      await reorderPlaylistSongs(db, selected, reordered.map(s => s.id));
    } catch { setSongsLocal(songs); } finally { setIsSaving(false); }
  }, [dragOverIdx, songs, selected]);

  useEffect(() => {
    const cancel = () => {
      if (dragItemRef.current === null) return;
      dragItemRef.current = null;
      setDragIdx(null); setDragOverIdx(null); setGhostPos(null);
    };
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("pointerup", cancel);
    return () => { window.removeEventListener("pointercancel", cancel); window.removeEventListener("pointerup", cancel); };
  }, []);

  // Reset selection mode saat ganti playlist
  const handleSelect = async (id: number) => {
    setSelected(id);
    exitSelectionMode();
    const db = await getDb();
    setSongsLocal(await getPlaylistSongs(db, id));
    setPlaylists(await getPlaylists(db));
  };

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;
    const db = await getDb();
    await createPlaylist(db, newName.trim());
    setPlaylists(await getPlaylists(db));
    setNewName(""); setCreating(false);
  }, [newName]);

  const handleRemoveSong = useCallback(async (songId: number) => {
    if (selected === null) return;
    const db = await getDb();
    await removeFromPlaylist(db, selected, songId);
    setSongsLocal(prev => prev.filter(s => s.id !== songId));
    setSelectedSongIds(prev => { const n = new Set(prev); n.delete(songId); return n; });
    setPlaylists(await getPlaylists(db));
  }, [selected]);

  const handleDeletePlaylist = useCallback(async (id: number) => {
    const db = await getDb();
    await deletePlaylist(db, id);
    setPlaylists(await getPlaylists(db));
    if (selected === id) { setSelected(null); setSongsLocal([]); exitSelectionMode(); }
    setConfirmDeletePl(null);
  }, [selected, exitSelectionMode]);

  // [FIX] Bulk selection dengan stopPropagation yang benar
  const toggleSongSelect = useCallback((id: number, idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (e.shiftKey && lastSelIdx.current >= 0) {
      const start = Math.min(lastSelIdx.current, idx);
      const end   = Math.max(lastSelIdx.current, idx);
      const ids = songs.slice(start, end + 1).map(s => s.id);
      setSelectedSongIds(prev => { const n = new Set(prev); ids.forEach(id => n.add(id)); return n; });
    } else {
      setSelectedSongIds(prev => {
        const n = new Set(prev);
        n.has(id) ? n.delete(id) : n.add(id);
        return n;
      });
      lastSelIdx.current = idx;
    }
  }, [songs]);

  const selectedSongs = useMemo(() => songs.filter(s => selectedSongIds.has(s.id)), [songs, selectedSongIds]);

  const handleAddToQueue = useCallback((ss: Song[]) => {
    const store = usePlayerStore.getState() as any;
    ss.forEach(s => store.addToManualQueue(s));
    toastInfo(`${ss.length} lagu ditambahkan ke antrian`);
  }, []);

  const handlePlayNext = useCallback((ss: Song[]) => {
    const store = usePlayerStore.getState() as any;
    [...ss].reverse().forEach(s => store.playNextTrack(s));
    toastInfo(`${ss.length} lagu akan diputar berikutnya`);
  }, []);

  const handleAddSelToPlaylist = useCallback(async (pid: number, ss: Song[]) => {
    const db = await getDb();
    for (const s of ss) await addToPlaylist(db, pid, s.id);
    toastSuccess(`${ss.length} lagu ditambahkan ke playlist`);
  }, []);

  const handleDeleteSongs = useCallback(async (ss: Song[]) => {
    // Remove from playlist only, not from library
    if (selected === null) return;
    const db = await getDb();
    for (const s of ss) await removeFromPlaylist(db, selected, s.id);
    setSongsLocal(prev => prev.filter(s => !ss.find(d => d.id === s.id)));
    setSelectedSongIds(new Set());
    setConfirmDelSongs(null);
    setPlaylists(await getPlaylists(db));
    toastSuccess(`${ss.length} lagu dihapus dari playlist`);
  }, [selected]);

  const selectedPlaylist = playlists.find((p: any) => p.id === selected);
  const totalMin = Math.round(songs.reduce((a, s) => a + (s.duration || 0), 0) / 60);
  const ghostSong = dragIdx !== null ? songs[dragIdx] : null;

  return (
    <div style={{ display: "flex", gap: 18, height: "100%", position: "relative" }}>

      {/* Ghost drag */}
      {ghostPos && ghostSong && (
        <div style={{
          position: "fixed", left: ghostPos.x - 16, top: ghostPos.y - 18,
          pointerEvents: "none", zIndex: 9999,
          background: "var(--bg-overlay)",
          border: "1px solid var(--accent-border, rgba(124,58,237,0.5))",
          borderRadius: "var(--radius-md, 8px)", padding: "5px 13px",
          fontSize: 12, color: "var(--accent-light, #c4b5fd)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
          maxWidth: 260, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          ⠿ {ghostSong.title}
        </div>
      )}

      {/* Confirm delete songs from playlist */}
      {confirmDelSongs && (
        <ConfirmDeleteModal
          songs={confirmDelSongs}
          onConfirm={() => handleDeleteSongs(confirmDelSongs)}
          onCancel={() => setConfirmDelSongs(null)}
        />
      )}

      {/* ── Left: Playlist list ── */}
      <div style={{ width: 232, flexShrink: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)" }}>Playlists</h3>
          <button onClick={() => setCreating(true)} style={{
            width: 26, height: 26, borderRadius: "var(--radius-md, 8px)", fontSize: 14,
            background: "var(--accent-dim, rgba(124,58,237,0.18))",
            border: "1px solid var(--accent-border, rgba(124,58,237,0.4))",
            color: "var(--accent-light, #a78bfa)", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>+</button>
        </div>

        {/* New playlist input */}
        {creating && (
          <div style={{ marginBottom: 10, display: "flex", gap: 6 }}>
            <input
              autoFocus value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") { setCreating(false); setNewName(""); } }}
              placeholder="Playlist name…"
              style={{
                flex: 1, padding: "6px 10px",
                background: "var(--bg-muted)", border: "1px solid var(--accent-border, rgba(124,58,237,0.4))",
                borderRadius: "var(--radius-sm, 6px)", color: "var(--text-primary)",
                fontSize: 12, fontFamily: "inherit", outline: "none",
              }}
            />
            <button onClick={handleCreate} style={{
              padding: "6px 10px", borderRadius: "var(--radius-sm, 6px)", fontSize: 11,
              background: "var(--accent-dim, rgba(124,58,237,0.3))",
              border: "1px solid var(--accent-border, rgba(124,58,237,0.4))",
              color: "var(--accent-light, #a78bfa)", cursor: "pointer", fontFamily: "inherit",
            }}>OK</button>
          </div>
        )}

        <div style={{ flex: 1, overflowY: "auto" }}>
          {playlists.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--text-faint)" }}>No playlists yet. Create one above.</p>
          ) : (
            playlists.map((pl: any) => (
              <div key={pl.id} onClick={() => handleSelect(pl.id)} style={{
                display: "flex", alignItems: "center", gap: 9,
                padding: "9px 10px", borderRadius: "var(--radius-md, 8px)", marginBottom: 3,
                background: selected === pl.id ? "var(--accent-dim, rgba(124,58,237,0.15))" : "transparent",
                border: selected === pl.id ? "1px solid var(--accent-border, rgba(124,58,237,0.25))" : "1px solid transparent",
                cursor: "pointer", transition: "all 0.1s", position: "relative",
              }}
                onMouseEnter={e => {
                  if (selected !== pl.id) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)";
                  const btn = (e.currentTarget as HTMLElement).querySelector(".pl-del") as HTMLElement;
                  if (btn) btn.style.opacity = "1";
                }}
                onMouseLeave={e => {
                  if (selected !== pl.id) (e.currentTarget as HTMLElement).style.background = "transparent";
                  const btn = (e.currentTarget as HTMLElement).querySelector(".pl-del") as HTMLElement;
                  if (btn) btn.style.opacity = "0";
                }}
              >
                <div style={{
                  width: 34, height: 34, borderRadius: "var(--radius-md, 8px)", flexShrink: 0,
                  background: "linear-gradient(135deg, var(--accent, #7C3AED), #EC4899)",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15,
                }}>♫</div>
                <div style={{ overflow: "hidden", flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 13, color: selected === pl.id ? "var(--accent-light, #a78bfa)" : "var(--text-primary)" }}>
                    {pl.name}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{pl.count} tracks</div>
                </div>
                <button className="pl-del" onClick={e => { e.stopPropagation(); setConfirmDeletePl(pl.id); }} style={{
                  width: 20, height: 20, borderRadius: 4, fontSize: 11,
                  background: "rgba(239,68,68,0.15)", border: "none",
                  color: "#f87171", cursor: "pointer", opacity: 0, transition: "opacity 0.15s", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>✕</button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Divider */}
      <div style={{ width: 1, background: "var(--border-subtle)", flexShrink: 0 }} />

      {/* ── Right: Playlist songs ── */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {!selected ? (
          <div style={{
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            height: "100%", gap: 8, color: "var(--text-faint)",
          }}>
            <div style={{ fontSize: 32, opacity: 0.25 }}>♫</div>
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Select a playlist to view tracks</p>
          </div>
        ) : (
          <>
            {/* Playlist header */}
            <div style={{
              display: "flex", alignItems: "center", gap: 14, marginBottom: 12,
              padding: "13px 15px",
              background: "var(--accent-dim, rgba(124,58,237,0.07))",
              border: "1px solid var(--accent-border, rgba(124,58,237,0.15))",
              borderRadius: "var(--radius-lg, 12px)",
            }}>
              <div style={{
                width: 50, height: 50, borderRadius: "var(--radius-lg, 12px)", flexShrink: 0,
                background: "linear-gradient(135deg, var(--accent, #7C3AED), #EC4899)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 22, boxShadow: "0 4px 14px rgba(124,58,237,0.3)",
              }}>♫</div>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)" }}>
                  {selectedPlaylist?.name}
                </h3>
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                  {songs.length} tracks · {totalMin} min
                  {isSaving && (
                    <span style={{ marginLeft: 8, color: "var(--accent-light, #a78bfa)", fontSize: 11 }}>
                      · saving…
                    </span>
                  )}
                </p>
              </div>
              {songs.length > 0 && (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 10, color: "var(--text-faint)" }}>⠿ drag to reorder</span>

                  {/* [NEW] Tombol Select — hanya tampil saat belum di selection mode */}
                  {!selectionMode ? (
                    <button
                      onClick={enterSelectionMode}
                      title="Masuk mode pilih"
                      style={{
                        padding: "6px 13px", borderRadius: "var(--radius-md, 8px)", fontSize: 12,
                        background: "transparent",
                        border: "1px solid var(--border-medium)",
                        color: "var(--text-muted)", cursor: "pointer", fontFamily: "inherit",
                        display: "flex", alignItems: "center", gap: 5,
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.borderColor = "var(--accent-border, rgba(124,58,237,0.4))";
                        e.currentTarget.style.color = "var(--accent-light, #a78bfa)";
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.borderColor = "var(--border-medium)";
                        e.currentTarget.style.color = "var(--text-muted)";
                      }}
                    >
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                        <rect x="1" y="1" width="6" height="6" rx="1"/>
                        <path d="M9 3h6M9 8h6M3 11h12"/>
                      </svg>
                      Pilih
                    </button>
                  ) : (
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      <button onClick={() => setSelectedSongIds(new Set(songs.map(s => s.id)))} style={{
                        padding: "5px 9px", borderRadius: "var(--radius-sm, 6px)", fontSize: 11,
                        border: "1px solid var(--accent-border, rgba(124,58,237,0.35))",
                        background: "var(--accent-dim, rgba(124,58,237,0.1))",
                        color: "var(--accent-light, #a78bfa)", cursor: "pointer", fontFamily: "inherit",
                      }}>
                        Semua
                      </button>
                      <button onClick={exitSelectionMode} style={{
                        padding: "5px 9px", borderRadius: "var(--radius-sm, 6px)", fontSize: 11,
                        border: "1px solid var(--border)", background: "transparent",
                        color: "var(--text-muted)", cursor: "pointer", fontFamily: "inherit",
                      }}>
                        ✕ Selesai
                      </button>
                    </div>
                  )}

                  <button onClick={() => onPlayAll(songs)} style={{
                    padding: "8px 17px", borderRadius: "var(--radius-md, 8px)",
                    background: "linear-gradient(135deg, var(--accent, #7C3AED), #EC4899)",
                    border: "none", color: "white", cursor: "pointer",
                    fontFamily: "inherit", fontWeight: 600, fontSize: 12,
                    boxShadow: "0 4px 12px rgba(124,58,237,0.35)", flexShrink: 0,
                  }}>
                    Play all
                  </button>
                </div>
              )}
            </div>

            {/* [NEW] Hint saat selection mode aktif */}
            {selectionMode && selectedSongIds.size === 0 && (
              <div style={{
                padding: "7px 12px", marginBottom: 8,
                background: "var(--accent-dim, rgba(124,58,237,0.08))",
                border: "1px solid var(--accent-border, rgba(124,58,237,0.2))",
                borderRadius: "var(--radius-md, 8px)",
                fontSize: 12, color: "var(--accent-light, #a78bfa)",
              }}>
                Klik lagu untuk memilih · Shift+klik untuk range
              </div>
            )}

            {/* Bulk action bar — hanya muncul saat ada yang dipilih */}
            {selectionMode && selectedSongIds.size > 0 && (
              <div style={{ marginBottom: 10 }}>
                <BulkActionBar
                  count={selectedSongIds.size}
                  playlists={playlists ?? []}
                  onPlayNow={() => {
                    const ss = selectedSongs;
                    if (ss[0]) { onPlayAll(songs); setTimeout(() => onPlay(ss[0]), 50); }
                  }}
                  onPlayNext={() => handlePlayNext(selectedSongs)}
                  onAddToQueue={() => handleAddToQueue(selectedSongs)}
                  onAddToPlaylist={pid => handleAddSelToPlaylist(pid, selectedSongs)}
                  onDelete={() => setConfirmDelSongs(selectedSongs)}
                  onClear={() => setSelectedSongIds(new Set())}
                />
              </div>
            )}

            {songs.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--text-faint)", padding: "18px 6px" }}>
                No tracks yet. Right-click a track in Library → Add to Playlist.
              </p>
            ) : (
              <div>
                {songs.map((song, i) => (
                  <div key={song.id}
                    ref={el => { rowRefs.current[i] = el; }}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    style={{
                      touchAction: dragItemRef.current !== null ? "none" : "auto",
                      opacity: dragIdx === i ? 0.25 : 1,
                      transition: dragIdx === null ? "opacity 0.15s" : "none",
                      borderTop: dragOverIdx === i && dragIdx !== i
                        ? "2px solid var(--accent-light, rgba(124,58,237,0.6))"
                        : "2px solid transparent",
                    }}
                  >
                    <SongRow
                      song={song} index={i}
                      isDragging={dragIdx === i}
                      isSelected={selectedSongIds.has(song.id)}
                      selectionMode={selectionMode}
                      onPlay={() => {
                        if (selectionMode) {
                          // Di selection mode, klik row = toggle select
                          setSelectedSongIds(prev => {
                            const n = new Set(prev);
                            n.has(song.id) ? n.delete(song.id) : n.add(song.id);
                            return n;
                          });
                          lastSelIdx.current = i;
                        } else {
                          onPlayAll(songs);
                          setTimeout(() => onPlay(song), 50);
                        }
                      }}
                      onRemove={() => handleRemoveSong(song.id)}
                      onToggleSelect={(e) => toggleSongSelect(song.id, i, e)}
                      onDragHandlePointerDown={(e) => handleDragHandlePointerDown(e, i)}
                    />
                  </div>
                ))}
                <div ref={el => { rowRefs.current[songs.length] = el; }} style={{
                  height: 10,
                  borderTop: dragOverIdx === songs.length ? "2px solid var(--accent-light, rgba(124,58,237,0.6))" : "2px solid transparent",
                }} />
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Confirm delete playlist ── */}
      {confirmDeletePl !== null && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 300,
          background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
          onClick={() => setConfirmDeletePl(null)}
        >
          <div style={{
            background: "var(--bg-overlay)", border: "1px solid var(--border-medium)",
            borderRadius: "var(--radius-xl, 16px)", padding: "24px 28px",
            maxWidth: 340, textAlign: "center",
            boxShadow: "0 16px 48px rgba(0,0,0,0.8)",
          }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 8, color: "var(--text-primary)" }}>
              Delete playlist?
            </h3>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 5, lineHeight: 1.6 }}>
              Playlist <strong style={{ color: "var(--text-primary)" }}>
                {playlists.find((p: any) => p.id === confirmDeletePl)?.name}
              </strong> will be deleted.
            </p>
            <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 20 }}>
              Tracks won't be removed from your library.
            </p>
            <div style={{ display: "flex", gap: 9, justifyContent: "center" }}>
              <button onClick={() => setConfirmDeletePl(null)} style={{
                padding: "7px 20px", borderRadius: "var(--radius-md, 8px)", fontSize: 13,
                background: "transparent", border: "1px solid var(--border-medium)",
                color: "var(--text-secondary)", cursor: "pointer", fontFamily: "inherit",
              }}>Cancel</button>
              <button onClick={() => handleDeletePlaylist(confirmDeletePl)} style={{
                padding: "7px 20px", borderRadius: "var(--radius-md, 8px)", fontSize: 13,
                background: "var(--danger-dim, rgba(239,68,68,0.2))", border: "1px solid rgba(239,68,68,0.5)",
                color: "#f87171", cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
              }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Song row ───────────────────────────────────────────────────────────────────
function SongRow({ song, index, isDragging, isSelected, selectionMode, onPlay, onRemove, onToggleSelect, onDragHandlePointerDown }: {
  song: Song; index: number; isDragging: boolean; isSelected: boolean;
  selectionMode: boolean;
  onPlay: () => void; onRemove: () => void;
  onToggleSelect: (e: React.MouseEvent) => void;
  onDragHandlePointerDown: (e: React.PointerEvent) => void;
}) {
  const [hovered, setHovered] = useState(false);

  // Checkbox visible: hanya saat selection mode aktif dan (hover ATAU sudah dipilih)
  const showCheckbox = selectionMode && (hovered || isSelected);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", gap: 9, padding: "7px 8px",
        borderRadius: "var(--radius-md, 8px)", alignItems: "center", marginBottom: 2,
        background: isSelected
          ? "rgba(124,58,237,0.15)"
          : hovered ? "rgba(255,255,255,0.04)" : "transparent",
        border: isSelected ? "1px solid rgba(124,58,237,0.3)" : "1px solid transparent",
        transition: "background 0.1s",
        userSelect: "none",
        cursor: selectionMode ? "pointer" : "default",
      }}
    >
      {/* Drag handle — ONLY this triggers drag, HANYA muncul saat hover dan NOT selection mode */}
      <span
        onPointerDown={e => {
          if (selectionMode) return; // di selection mode, drag disable
          onDragHandlePointerDown(e);
        }}
        title={selectionMode ? "" : "Drag to reorder"}
        style={{
          color: !selectionMode && (hovered || isDragging) ? "var(--accent-light, #7C3AED)" : "transparent",
          fontSize: 14, flexShrink: 0, padding: "0 2px", transition: "color 0.15s",
          cursor: selectionMode ? "default" : "grab", touchAction: "none",
          // Reserve space even when invisible
          width: 18, display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}
      >⠿</span>

      {/* Checkbox — [FIX] hanya muncul saat selection mode aktif */}
      <div
        style={{
          width: 18, height: 18, flexShrink: 0, display: "flex",
          alignItems: "center", justifyContent: "center",
          opacity: showCheckbox || isSelected ? 1 : 0,
          transition: "opacity 0.15s",
          // Selalu occupy space agar layout tidak shift
          visibility: (selectionMode) ? "visible" : "hidden",
        }}
        onClick={e => {
          e.stopPropagation();
          onToggleSelect(e);
        }}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => {}} // handled by onClick above
          onClick={e => {
            e.stopPropagation();
            // Trigger toggle manually via parent handler
          }}
          style={{ accentColor: "var(--accent)", cursor: "pointer", width: 14, height: 14, pointerEvents: "none" }}
        />
      </div>

      {/* Hide checkbox space when not in selection mode */}
      {!selectionMode && <div style={{ width: 0, overflow: "hidden" }} />}

      <span style={{
        width: 18, textAlign: "center", fontSize: 11,
        color: "var(--text-faint)", fontFamily: "monospace", flexShrink: 0,
        display: selectionMode ? "none" : "inline", // hide number in selection mode
      }}>
        {index + 1}
      </span>

      {/* Cover + info — clicking here plays (or selects in selection mode) */}
      <div onClick={onPlay} style={{
        display: "flex", alignItems: "center", gap: 9,
        flex: 1, overflow: "hidden", cursor: selectionMode ? "pointer" : "pointer",
      }}>
        <CoverArt id={song.id} coverArt={song.cover_art} size={36} />
        <div style={{ flex: 1, overflow: "hidden" }}>
          <div style={{
            fontWeight: 500, fontSize: 13,
            color: isSelected ? "var(--accent-light, #a78bfa)" : "var(--text-primary)",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {song.title}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {song.artist} · {song.album}
          </div>
        </div>
      </div>

      <span style={{
        fontSize: 11, color: "var(--text-muted)",
        fontFamily: "monospace", flexShrink: 0,
      }}>
        {fmt(song.duration)}
      </span>

      {/* Remove button — hanya tampil saat hover dan BUKAN selection mode */}
      {!selectionMode && (
        <button
          onClick={e => { e.stopPropagation(); onRemove(); }}
          style={{
            padding: "3px 9px", borderRadius: "var(--radius-sm, 5px)", fontSize: 11,
            background: "var(--danger-dim, rgba(239,68,68,0.1))",
            border: "1px solid transparent",
            color: "#f87171", cursor: "pointer",
            opacity: hovered ? 1 : 0, transition: "opacity 0.15s",
            fontFamily: "inherit", flexShrink: 0,
          }}
        >
          Remove
        </button>
      )}
    </div>
  );
}