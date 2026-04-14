/**
 * FolderView.tsx — v3 (Multi-select + Context Menu)
 *
 * PERUBAHAN vs v2:
 *   [NEW] Klik kanan di lagu → context menu
 *   [NEW] Multi-select di detail folder + bulk action bar
 *   [NEW] Confirm delete 2x
 */

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLibraryStore, usePlayerStore } from "../../store";
import { getDb, deleteSongs, getPlaylists, addToPlaylist } from "../../lib/db";
import type { Song } from "../../lib/db";
import CoverArt from "../CoverArt";
import SongContextMenu, { ConfirmDeleteModal, BulkActionBar } from "../SongContextMenu";
import { toastInfo, toastSuccess } from "../Notification/ToastSystem";

interface Props {
  onPlay: (songs: Song[], startIndex?: number, folderName?: string) => void;
}

function getFolderPath(song: Song): string {
  const parts = song.path.replace(/\\/g, "/").split("/");
  parts.pop();
  return parts.join("/");
}

function getFolderName(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export default function FolderView({ onPlay }: Props) {
  const { songs } = useLibraryStore();
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch]     = useState("");

  const folders = useMemo(() => {
    const map = new Map<string, Song[]>();
    for (const song of songs) {
      const folder = getFolderPath(song);
      if (!map.has(folder)) map.set(folder, []);
      map.get(folder)!.push(song);
    }
    return Array.from(map.entries())
      .map(([path, songs]) => ({ path, name: getFolderName(path), songs }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [songs]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return folders;
    return folders.filter(f => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q));
  }, [folders, search]);

  const selectedFolder = selected ? folders.find(f => f.path === selected) : null;

  // ── Folder detail ─────────────────────────────────────────────────────────────
  if (selectedFolder) {
    return (
      <FolderDetail
        folder={selectedFolder}
        onBack={() => setSelected(null)}
        onPlay={onPlay}
      />
    );
  }

  // ── Folder list ───────────────────────────────────────────────────────────────
  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <h3 style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)", letterSpacing: "-0.3px", marginBottom: 2 }}>
          Folder
        </h3>
        <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {filtered.length} folder · {songs.length} total lagu
        </p>
      </div>

      {/* Search */}
      <div style={{ position: "relative", marginBottom: 14 }}>
        <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--text-faint)", pointerEvents: "none" }}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="7" cy="7" r="5"/><line x1="10.5" y1="10.5" x2="14" y2="14"/></svg>
        </span>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari folder…"
          style={{
            width: "100%", padding: "8px 12px 8px 30px",
            background: "var(--bg-overlay)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-md, 8px)", color: "var(--text-primary)", fontSize: 13,
            fontFamily: "inherit", outline: "none",
          }}
          onFocus={e => e.currentTarget.style.borderColor = "rgba(124,58,237,0.4)"}
          onBlur={e => e.currentTarget.style.borderColor = "var(--border)"}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {filtered.map(folder => (
          <div key={folder.path} onClick={() => setSelected(folder.path)} style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "10px 13px", borderRadius: "var(--radius-lg, 12px)",
            background: "var(--bg-overlay)", border: "1px solid var(--border)",
            cursor: "pointer", transition: "all 0.15s",
          }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.borderColor = "var(--accent-border, rgba(124,58,237,0.3))";
              (e.currentTarget as HTMLElement).style.background = "rgba(124,58,237,0.05)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
              (e.currentTarget as HTMLElement).style.background = "var(--bg-overlay)";
            }}
          >
            <div style={{
              width: 38, height: 38, borderRadius: "var(--radius-md, 8px)", flexShrink: 0,
              background: "linear-gradient(135deg, rgba(124,58,237,0.25), rgba(59,130,246,0.2))",
              border: "1px solid var(--border-medium)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-light, #a78bfa)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
              </svg>
            </div>
            <div style={{ flex: 1, overflow: "hidden" }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {folder.name}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 1 }}>
                {folder.path}
              </div>
            </div>
            <div style={{
              fontSize: 11, color: "var(--text-muted)",
              background: "var(--bg-muted)", padding: "2px 8px",
              borderRadius: 10, flexShrink: 0,
              border: "1px solid var(--border)",
            }}>
              {folder.songs.length} lagu
            </div>
            <span style={{ color: "var(--text-muted)", fontSize: 16, flexShrink: 0 }}>›</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Folder Detail ─────────────────────────────────────────────────────────────
function FolderDetail({ folder, onBack, onPlay }: {
  folder: { path: string; name: string; songs: Song[] };
  onBack: () => void;
  onPlay: (songs: Song[], startIndex?: number, folderName?: string) => void;
}) {
  const [selected, setSelected]       = useState<Set<number>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; songs: Song[] } | null>(null);
  const [confirmDel, setConfirmDel]   = useState<Song[] | null>(null);
  const [playlists, setPlaylists]     = useState<any[]>([]);
  const lastSelIdx = useRef(-1);

  useEffect(() => {
    getDb().then(db => getPlaylists(db)).then(setPlaylists).catch(() => {});
  }, []);

  const selectedSongs = useMemo(() => folder.songs.filter(s => selected.has(s.id)), [folder.songs, selected]);

  const toggleSelect = useCallback((id: number, idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (e.shiftKey && lastSelIdx.current >= 0) {
      const start = Math.min(lastSelIdx.current, idx);
      const end   = Math.max(lastSelIdx.current, idx);
      const ids = folder.songs.slice(start, end + 1).map(s => s.id);
      setSelected(prev => { const n = new Set(prev); ids.forEach(id => n.add(id)); return n; });
    } else {
      setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
      lastSelIdx.current = idx;
    }
  }, [folder.songs]);

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

  const handleAddToPlaylist = useCallback(async (pid: number, ss: Song[]) => {
    const db = await getDb();
    for (const s of ss) await addToPlaylist(db, pid, s.id);
    toastSuccess(`${ss.length} lagu ditambahkan ke playlist`);
  }, []);

  const handleDeleteSongs = useCallback(async (ss: Song[]) => {
    const { setSongs } = useLibraryStore.getState() as any;
    const db = await getDb();
    await deleteSongs(db, ss.map(s => s.id));
    setSongs((prev: Song[]) => Array.isArray(prev) ? prev.filter(s => !ss.find(d => d.id === s.id)) : prev);
    setSelected(new Set());
    setConfirmDel(null);
    toastSuccess(`${ss.length} lagu dihapus dari library`);
  }, []);

  const handleCtxMenu = useCallback(async (e: React.MouseEvent, ss: Song[]) => {
    e.preventDefault();
    try { const db = await getDb(); setPlaylists(await getPlaylists(db)); } catch {}
    const x = Math.min(e.clientX, window.innerWidth - 240);
    const y = Math.min(e.clientY, window.innerHeight - 380);
    setContextMenu({ x, y, songs: ss });
  }, []);

  return (
    <div>
      {contextMenu && (
        <SongContextMenu
          x={contextMenu.x} y={contextMenu.y}
          songs={contextMenu.songs}
          playlists={playlists}
          onClose={() => setContextMenu(null)}
          onPlayNow={ss => onPlay(folder.songs, folder.songs.findIndex(s => s.id === ss[0].id), folder.name)}
          onPlayNext={handlePlayNext}
          onAddToQueue={handleAddToQueue}
          onAddToPlaylist={handleAddToPlaylist}
          onShowInFolder={song => invoke("open_file_manager", { path: song.path })}
          onDelete={ss => setConfirmDel(ss)}
        />
      )}

      {confirmDel && (
        <ConfirmDeleteModal
          songs={confirmDel}
          onConfirm={() => handleDeleteSongs(confirmDel)}
          onCancel={() => setConfirmDel(null)}
        />
      )}

      <button onClick={onBack} style={{
        background: "none", border: "none", cursor: "pointer",
        color: "var(--text-muted)", fontSize: 13, marginBottom: 16,
        display: "flex", alignItems: "center", gap: 5, fontFamily: "inherit", padding: 0,
      }}
        onMouseEnter={e => e.currentTarget.style.color = "var(--text-primary)"}
        onMouseLeave={e => e.currentTarget.style.color = "var(--text-muted)"}
      >
        ← Kembali ke folder
      </button>

      <div style={{ display: "flex", gap: 16, marginBottom: 22, alignItems: "center" }}>
        <div style={{
          width: 60, height: 60, borderRadius: "var(--radius-lg, 12px)", flexShrink: 0,
          background: "linear-gradient(135deg, var(--accent-dim, rgba(124,58,237,0.3)), rgba(59,130,246,0.25))",
          border: "1px solid var(--accent-border, rgba(124,58,237,0.25))",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26,
        }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--accent-light, #a78bfa)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
          </svg>
        </div>
        <div>
          <h2 style={{ fontWeight: 700, fontSize: 19, letterSpacing: "-0.4px", color: "var(--text-primary)" }}>
            {folder.name}
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 3 }}>{folder.path}</p>
          <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 2 }}>{folder.songs.length} lagu</p>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={() => onPlay(folder.songs, 0, folder.name)} style={{
              padding: "7px 15px", borderRadius: "var(--radius-md, 8px)", fontSize: 12,
              background: "linear-gradient(135deg, var(--accent, #7C3AED), #EC4899)",
              border: "none", color: "white", cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
            }}>Putar semua</button>
            <button onClick={() => {
              const shuffled = [...folder.songs].sort(() => Math.random() - 0.5);
              onPlay(shuffled, 0, folder.name);
            }} style={{
              padding: "7px 13px", borderRadius: "var(--radius-md, 8px)", fontSize: 12,
              background: "var(--accent-dim, rgba(124,58,237,0.15))",
              border: "1px solid var(--accent-border, rgba(124,58,237,0.4))",
              color: "var(--accent-light, #a78bfa)", cursor: "pointer", fontFamily: "inherit",
            }}>Acak</button>
          </div>
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div style={{ marginBottom: 10 }}>
          <BulkActionBar
            count={selected.size}
            playlists={playlists}
            onPlayNow={() => { const ss = selectedSongs; if (ss[0]) onPlay(folder.songs, folder.songs.findIndex(s => s.id === ss[0].id), folder.name); }}
            onPlayNext={() => handlePlayNext(selectedSongs)}
            onAddToQueue={() => handleAddToQueue(selectedSongs)}
            onAddToPlaylist={pid => handleAddToPlaylist(pid, selectedSongs)}
            onDelete={() => setConfirmDel(selectedSongs)}
            onClear={() => setSelected(new Set())}
          />
        </div>
      )}

      {folder.songs.map((song, i) => {
        const isSelected = selected.has(song.id);
        return (
          <div
            key={song.id}
            onClick={e => {
              if (selected.size > 0) { toggleSelect(song.id, i, e); return; }
              onPlay(folder.songs, i, folder.name);
            }}
            onContextMenu={e => {
              const ctxSongs = isSelected && selected.size > 1 ? selectedSongs : [song];
              handleCtxMenu(e, ctxSongs);
            }}
            style={{
              display: "flex", alignItems: "center", gap: 11,
              padding: "7px 9px", borderRadius: "var(--radius-md, 8px)", marginBottom: 2, cursor: "pointer",
              background: isSelected ? "rgba(124,58,237,0.15)" : "transparent",
              border: isSelected ? "1px solid rgba(124,58,237,0.3)" : "1px solid transparent",
              transition: "background 0.1s",
            }}
            onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
            onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={e => toggleSelect(song.id, i, e as any)}
              onClick={e => e.stopPropagation()}
              style={{ accentColor: "var(--accent)", cursor: "pointer", flexShrink: 0 }}
            />
            <span style={{ width: 22, textAlign: "center", fontSize: 11, color: "var(--text-faint)", fontFamily: "monospace", flexShrink: 0 }}>
              {i + 1}
            </span>
            <CoverArt id={song.id} coverArt={song.cover_art} size={34} />
            <div style={{ flex: 1, overflow: "hidden" }}>
              <div style={{ fontWeight: 500, fontSize: 13, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {song.title}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{song.artist}</div>
            </div>
            <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace", flexShrink: 0 }}>
              {fmt(song.duration)}
            </span>
          </div>
        );
      })}
    </div>
  );
}