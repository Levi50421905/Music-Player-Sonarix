/**
 * PlaylistsView.tsx — v2 (fix: playlist play sets correct queue)
 *
 * FIX:
 *   - Tambah prop onPlayAll(songs) → set queue dari playlist, bukan library
 *   - Tombol ▶ Play All memanggil onPlayAll dengan lagu-lagu playlist
 *   - onPlay(song) hanya play 1 lagu tetap tersedia untuk klik row
 */

import { useState, useCallback } from "react";
import { useLibraryStore } from "../../store";
import { getDb, createPlaylist, getPlaylistSongs, getPlaylists, removeFromPlaylist, deletePlaylist } from "../../lib/db";
import type { Song } from "../../lib/db";
import CoverArt from "../CoverArt";

interface Props {
  onPlay: (song: Song) => void;
  onPlayAll: (songs: Song[]) => void;  // ← BARU: play seluruh playlist
}

export default function PlaylistsView({ onPlay, onPlayAll }: Props) {
  const { playlists, setPlaylists } = useLibraryStore();
  const [selected, setSelected]     = useState<number | null>(null);
  const [songs, setSongs]           = useState<Song[]>([]);
  const [newName, setNewName]       = useState("");
  const [creating, setCreating]     = useState(false);
  const [confirmDeletePl, setConfirmDeletePl] = useState<number | null>(null);

  const handleSelect = async (id: number) => {
    setSelected(id);
    const db = await getDb();
    const s  = await getPlaylistSongs(db, id);
    setSongs(s);
  };

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;
    const db      = await getDb();
    await createPlaylist(db, newName.trim());
    const updated = await getPlaylists(db);
    setPlaylists(updated);
    setNewName(""); setCreating(false);
  }, [newName]);

  const handleRemoveSong = useCallback(async (songId: number) => {
    if (selected === null) return;
    const db = await getDb();
    await removeFromPlaylist(db, selected, songId);
    setSongs(prev => prev.filter(s => s.id !== songId));
    const updated = await getPlaylists(db);
    setPlaylists(updated);
  }, [selected]);

  const handleDeletePlaylist = useCallback(async (id: number) => {
    const db = await getDb();
    await deletePlaylist(db, id);
    const updated = await getPlaylists(db);
    setPlaylists(updated);
    if (selected === id) { setSelected(null); setSongs([]); }
    setConfirmDeletePl(null);
  }, [selected]);

  // Play semua lagu playlist → set queue dari playlist ini
  const handlePlayAll = useCallback(() => {
    if (songs.length === 0) return;
    onPlayAll(songs);
  }, [songs, onPlayAll]);

  // Play lagu tertentu dari playlist → set queue dari playlist mulai index itu
  const handlePlaySong = useCallback((song: Song, index: number) => {
    if (songs.length > 1) {
      onPlayAll(songs);           // set queue ke semua lagu playlist
      // delay sedikit lalu skip ke index yang dipilih
      setTimeout(() => onPlay(song), 50);
    } else {
      onPlay(song);
    }
  }, [songs, onPlay, onPlayAll]);

  const selectedPlaylist = playlists.find((p: any) => p.id === selected);
  const totalDuration    = songs.reduce((a, s) => a + (s.duration || 0), 0);
  const totalMin         = Math.round(totalDuration / 60);

  return (
    <div style={{ display: "flex", gap: 20, height: "100%" }}>
      {/* ── Left: Playlist list ── */}
      <div style={{ width: 240, flexShrink: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ fontWeight: 700, fontSize: 15 }}>Playlists</h3>
          <button onClick={() => setCreating(true)} style={{
            width: 26, height: 26, borderRadius: 7, fontSize: 14,
            background: "rgba(124,58,237,0.2)", border: "1px solid #7C3AED",
            color: "#a78bfa", cursor: "pointer",
          }}>+</button>
        </div>

        {creating && (
          <div style={{ marginBottom: 10, display: "flex", gap: 6 }}>
            <input
              autoFocus value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleCreate()}
              placeholder="Nama playlist..."
              style={{
                flex: 1, padding: "6px 10px",
                background: "#1a1a2e", border: "1px solid #7C3AED",
                borderRadius: 6, color: "#e2e8f0", fontSize: 12,
                fontFamily: "inherit", outline: "none",
              }}
            />
            <button onClick={handleCreate} style={{
              padding: "6px 10px", borderRadius: 6, fontSize: 11,
              background: "rgba(124,58,237,0.3)", border: "1px solid #7C3AED",
              color: "#a78bfa", cursor: "pointer", fontFamily: "inherit",
            }}>OK</button>
          </div>
        )}

        <div style={{ flex: 1, overflowY: "auto" }}>
          {playlists.length === 0 ? (
            <p style={{ fontSize: 12, color: "#4b5563" }}>Belum ada playlist.</p>
          ) : (
            playlists.map((pl: any) => (
              <div
                key={pl.id}
                onClick={() => handleSelect(pl.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 12px", borderRadius: 8, marginBottom: 4,
                  background: selected === pl.id ? "rgba(124,58,237,0.15)" : "transparent",
                  cursor: "pointer", transition: "background 0.1s",
                  position: "relative",
                }}
                onMouseEnter={e => {
                  if (selected !== pl.id) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)";
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
                  width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                  background: "linear-gradient(135deg,#7C3AED,#EC4899)",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
                }}>♫</div>
                <div style={{ overflow: "hidden", flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 13, color: selected === pl.id ? "#a78bfa" : "#e2e8f0" }}>
                    {pl.name}
                  </div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>{pl.count} lagu</div>
                </div>
                <button
                  className="pl-del"
                  onClick={e => { e.stopPropagation(); setConfirmDeletePl(pl.id); }}
                  style={{
                    width: 20, height: 20, borderRadius: 4, fontSize: 11,
                    background: "rgba(239,68,68,0.15)", border: "none",
                    color: "#f87171", cursor: "pointer", opacity: 0,
                    transition: "opacity 0.15s", flexShrink: 0,
                  }}
                  title="Hapus playlist"
                >✕</button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Divider */}
      <div style={{ width: 1, background: "#1a1a2e", flexShrink: 0 }} />

      {/* ── Right: Playlist songs ── */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {!selected ? (
          <div style={{
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            height: "100%", color: "#4b5563", gap: 8,
          }}>
            <div style={{ fontSize: 36, opacity: 0.3 }}>♫</div>
            <p style={{ fontSize: 13, color: "#6b7280" }}>Pilih playlist untuk melihat lagu</p>
          </div>
        ) : (
          <>
            {/* Playlist header */}
            <div style={{
              display: "flex", alignItems: "center", gap: 16, marginBottom: 20,
              padding: "14px 16px",
              background: "rgba(124,58,237,0.06)",
              border: "1px solid rgba(124,58,237,0.15)",
              borderRadius: 10,
            }}>
              <div style={{
                width: 52, height: 52, borderRadius: 12, flexShrink: 0,
                background: "linear-gradient(135deg,#7C3AED,#EC4899)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 22, boxShadow: "0 4px 16px rgba(124,58,237,0.3)",
              }}>♫</div>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontWeight: 700, fontSize: 16 }}>
                  {selectedPlaylist?.name}
                </h3>
                <p style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                  {songs.length} lagu · {totalMin} menit
                </p>
              </div>
              {songs.length > 0 && (
                <button
                  onClick={handlePlayAll}
                  style={{
                    padding: "9px 20px", borderRadius: 8,
                    background: "linear-gradient(135deg,#7C3AED,#EC4899)",
                    border: "none", color: "white", cursor: "pointer",
                    fontFamily: "inherit", fontWeight: 600, fontSize: 13,
                    boxShadow: "0 4px 14px rgba(124,58,237,0.4)",
                    flexShrink: 0,
                  }}
                >
                  ▶ Play Semua
                </button>
              )}
            </div>

            {songs.length === 0 ? (
              <p style={{ fontSize: 12, color: "#4b5563", padding: "20px 8px" }}>
                Belum ada lagu. Klik kanan lagu di Library → Tambah ke Playlist.
              </p>
            ) : (
              <div>
                {songs.map((song, i) => (
                  <div
                    key={song.id}
                    onClick={() => handlePlaySong(song, i)}
                    style={{
                      display: "flex", gap: 12, padding: "8px 8px",
                      borderRadius: 8, cursor: "pointer", alignItems: "center", marginBottom: 2,
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)";
                      const btn = (e.currentTarget as HTMLElement).querySelector(".rem-btn") as HTMLElement;
                      if (btn) btn.style.opacity = "1";
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.background = "transparent";
                      const btn = (e.currentTarget as HTMLElement).querySelector(".rem-btn") as HTMLElement;
                      if (btn) btn.style.opacity = "0";
                    }}
                  >
                    <span style={{ width: 24, textAlign: "center", fontSize: 11, color: "#4b5563", fontFamily: "monospace" }}>
                      {i + 1}
                    </span>
                    <CoverArt id={song.id} coverArt={song.cover_art} size={38} />
                    <div style={{ flex: 1, overflow: "hidden" }}>
                      <div style={{ fontWeight: 500, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {song.title}
                      </div>
                      <div style={{ fontSize: 11, color: "#6b7280" }}>{song.artist} · {song.album}</div>
                    </div>
                    <span style={{ fontSize: 11, color: "#6b7280", fontFamily: "monospace", flexShrink: 0 }}>
                      {Math.floor(song.duration / 60)}:{String(Math.floor(song.duration % 60)).padStart(2, "0")}
                    </span>
                    <button
                      className="rem-btn"
                      onClick={e => { e.stopPropagation(); handleRemoveSong(song.id); }}
                      style={{
                        padding: "3px 10px", borderRadius: 5, fontSize: 11,
                        background: "rgba(239,68,68,0.12)", border: "1px solid transparent",
                        color: "#f87171", cursor: "pointer", opacity: 0,
                        transition: "opacity 0.15s", fontFamily: "inherit",
                      }}
                    >Hapus</button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Confirm delete playlist modal ── */}
      {confirmDeletePl !== null && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 300,
            background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={() => setConfirmDeletePl(null)}
        >
          <div
            style={{
              background: "#0d0d1f", border: "1px solid #2a2a3e",
              borderRadius: 12, padding: 24, maxWidth: 340, textAlign: "center",
              boxShadow: "0 16px 48px rgba(0,0,0,0.8)",
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: 32, marginBottom: 12 }}>🗑️</div>
            <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Hapus Playlist?</h3>
            <p style={{ fontSize: 12, color: "#9ca3af", marginBottom: 20 }}>
              Playlist <strong style={{ color: "#e2e8f0" }}>
                {playlists.find((p: any) => p.id === confirmDeletePl)?.name}
              </strong> akan dihapus.<br />
              <span style={{ fontSize: 11, color: "#6b7280" }}>Lagu tidak akan ikut terhapus.</span>
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button onClick={() => setConfirmDeletePl(null)} style={{
                padding: "8px 20px", borderRadius: 8, fontSize: 13,
                background: "transparent", border: "1px solid #3f3f5a",
                color: "#9ca3af", cursor: "pointer", fontFamily: "inherit",
              }}>Batal</button>
              <button onClick={() => handleDeletePlaylist(confirmDeletePl)} style={{
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