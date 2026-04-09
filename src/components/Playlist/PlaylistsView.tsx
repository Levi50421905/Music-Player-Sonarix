/**
 * PlaylistsView.tsx — Playlists management
 */

import { useState, useCallback } from "react";
import { useLibraryStore } from "../../store";
import { getDb, createPlaylist, getPlaylistSongs, getPlaylists } from "../../lib/db";
import type { Song } from "../../lib/db";
import CoverArt from "../CoverArt";

interface Props { onPlay: (song: Song) => void; }

export default function PlaylistsView({ onPlay }: Props) {
  const { playlists, setPlaylists } = useLibraryStore();
  const [selected, setSelected] = useState<number | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const handleSelect = async (id: number) => {
    setSelected(id);
    const db = await getDb();
    const s = await getPlaylistSongs(db, id);
    setSongs(s);
  };

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;
    const db = await getDb();
    await createPlaylist(db, newName.trim());
    const updated = await getPlaylists(db);
    setPlaylists(updated);
    setNewName(""); setCreating(false);
  }, [newName]);

  const selectedPlaylist = playlists.find(p => p.id === selected);

  return (
    <div style={{ display: "flex", gap: 20, height: "100%" }}>
      {/* Left: Playlist list */}
      <div style={{ width: 220, flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ fontWeight: 700, fontSize: 15 }}>Playlists</h3>
          <button onClick={() => setCreating(true)} style={{
            width: 24, height: 24, borderRadius: 6, fontSize: 14,
            background: "rgba(124,58,237,0.2)", border: "1px solid #7C3AED",
            color: "#a78bfa", cursor: "pointer",
          }}>+</button>
        </div>

        {/* New playlist input */}
        {creating && (
          <div style={{ marginBottom: 10, display: "flex", gap: 6 }}>
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleCreate()}
              placeholder="Playlist name..."
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

        {playlists.length === 0 ? (
          <p style={{ fontSize: 12, color: "#4b5563" }}>No playlists yet. Create one!</p>
        ) : (
          playlists.map(pl => (
            <div
              key={pl.id}
              onClick={() => handleSelect(pl.id)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px", borderRadius: 8, marginBottom: 4,
                background: selected === pl.id ? "rgba(124,58,237,0.15)" : "transparent",
                cursor: "pointer", transition: "background 0.1s",
              }}
              onMouseEnter={e => selected !== pl.id && ((e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)")}
              onMouseLeave={e => selected !== pl.id && ((e.currentTarget as HTMLElement).style.background = "transparent")}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                background: "linear-gradient(135deg,#7C3AED,#EC4899)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16,
              }}>♫</div>
              <div style={{ overflow: "hidden" }}>
                <div style={{ fontWeight: 500, fontSize: 13, color: selected === pl.id ? "#a78bfa" : "#e2e8f0" }}>
                  {pl.name}
                </div>
                <div style={{ fontSize: 11, color: "#6b7280" }}>{pl.count} tracks</div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Divider */}
      <div style={{ width: 1, background: "#1a1a2e", flexShrink: 0 }} />

      {/* Right: Playlist songs */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {!selected ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#4b5563", fontSize: 13 }}>
            Select a playlist to view tracks
          </div>
        ) : (
          <>
            <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>
              {selectedPlaylist?.name}
              <span style={{ fontWeight: 400, fontSize: 12, color: "#6b7280", marginLeft: 8 }}>
                {songs.length} tracks
              </span>
            </h3>
            {songs.length === 0 ? (
              <p style={{ fontSize: 12, color: "#4b5563" }}>
                No tracks yet. Right-click a song in Library → Add to Playlist
              </p>
            ) : (
              songs.map((song, i) => (
                <div key={song.id} onClick={() => onPlay(song)} style={{
                  display: "flex", gap: 12, padding: "8px 0",
                  borderBottom: "1px solid #1a1a2e", cursor: "pointer",
                  alignItems: "center",
                }}>
                  <span style={{ width: 24, textAlign: "center", fontSize: 11, color: "#4b5563", fontFamily: "monospace" }}>
                    {i + 1}
                  </span>
                  <CoverArt id={song.id} coverArt={song.cover_art} size={38} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{song.title}</div>
                    <div style={{ fontSize: 11, color: "#6b7280" }}>{song.artist}</div>
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}