/**
 * AlbumView.tsx — v5 (Multi-select + Context Menu)
 *
 * PERUBAHAN vs v4:
 *   [NEW] Klik kanan di lagu → context menu (putar, antrian, playlist, hapus)
 *   [NEW] Multi-select di detail album: checkbox + shift-click + bulk action bar
 *   [NEW] Confirm delete 2x via ConfirmDeleteModal
 */

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useLibraryStore, usePlayerStore } from "../../store";
import { getDb, deleteSongs, getPlaylists, addToPlaylist } from "../../lib/db";
import type { Song } from "../../lib/db";
import CoverArt from "../CoverArt";
import SongContextMenu, { ConfirmDeleteModal, BulkActionBar } from "../SongContextMenu";
import { toastInfo, toastSuccess } from "../Notification/ToastSystem";

interface Props {
  onPlay: (songs: Song[], startIndex?: number) => void;
}

const CHUNK_SIZE = 40;

function SearchBar({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <div style={{ position: "relative", marginBottom: 16 }}>
      <span style={{
        position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)",
        color: "var(--text-faint)", fontSize: 13, pointerEvents: "none",
      }}>
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="7" cy="7" r="5"/><line x1="10.5" y1="10.5" x2="14" y2="14"/></svg>
      </span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%", padding: "8px 30px 8px 30px",
          background: "var(--bg-overlay)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-md, 8px)", color: "var(--text-primary)",
          fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box",
        }}
        onFocus={e => e.currentTarget.style.borderColor = "rgba(124,58,237,0.4)"}
        onBlur={e => e.currentTarget.style.borderColor = "var(--border)"}
      />
      {value && (
        <button onClick={() => onChange("")} style={{
          position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
          background: "none", border: "none", cursor: "pointer",
          color: "var(--text-muted)", fontSize: 14,
        }}>✕</button>
      )}
    </div>
  );
}

function useLazyRender<T>(items: T[], chunkSize = CHUNK_SIZE) {
  const [visibleCount, setVisibleCount] = useState(chunkSize);
  const idleRef = useRef<number | null>(null);

  useEffect(() => { setVisibleCount(chunkSize); }, [items.length, chunkSize]);

  useEffect(() => {
    if (visibleCount >= items.length) return;
    const schedule = () => {
      if ("requestIdleCallback" in window) {
        idleRef.current = (window as any).requestIdleCallback(
          () => setVisibleCount(prev => Math.min(prev + chunkSize, items.length)),
          { timeout: 300 }
        );
      } else {
        idleRef.current = setTimeout(
          () => setVisibleCount(prev => Math.min(prev + chunkSize, items.length)), 16
        ) as unknown as number;
      }
    };
    schedule();
    return () => {
      if (idleRef.current !== null) {
        if ("cancelIdleCallback" in window) (window as any).cancelIdleCallback(idleRef.current);
        else clearTimeout(idleRef.current);
      }
    };
  }, [visibleCount, items.length, chunkSize]);

  return items.slice(0, visibleCount);
}

// ── Album View ─────────────────────────────────────────────────────────────────
export function AlbumView({ onPlay }: Props) {
  const { songs, setSongs } = useLibraryStore() as any;
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch]     = useState("");

  const albums = useMemo(() => {
    const map = new Map<string, {
      name: string; artist: string; songs: Song[];
      year: number | null; representativeId: number; coverArt: string | null;
    }>();
    for (const song of songs) {
      const key = `${song.album}__${song.artist}`;
      if (!map.has(key)) {
        map.set(key, {
          name: song.album ?? "Unknown Album",
          artist: song.artist ?? "Unknown Artist",
          songs: [], year: song.year ?? null,
          representativeId: song.id, coverArt: song.cover_art ?? null,
        });
      }
      map.get(key)!.songs.push(song);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [songs]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return albums;
    return albums.filter(a => a.name.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q));
  }, [albums, search]);

  const visible = useLazyRender(filtered);

  const handleDeleteAlbum = useCallback(async (albumSongs: Song[]) => {
    const db = await getDb();
    const ids = albumSongs.map(s => s.id);
    await deleteSongs(db, ids);
    setSongs((prev: Song[]) => Array.isArray(prev) ? prev.filter(s => !ids.includes(s.id)) : []);
    setSelected(null);
    toastSuccess(`${ids.length} lagu dihapus dari library`);
  }, [setSongs]);

  const selectedAlbum = selected ? albums.find(a => `${a.name}__${a.artist}` === selected) : null;

  if (selectedAlbum) {
    return (
      <AlbumDetail
        album={selectedAlbum}
        onBack={() => setSelected(null)}
        onPlay={onPlay}
        onDelete={handleDeleteAlbum}
      />
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <h3 style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)", letterSpacing: "-0.3px", marginBottom: 2 }}>
          Album
        </h3>
        <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {filtered.length} / {albums.length} album
          {visible.length < filtered.length && (
            <span style={{ color: "var(--text-faint)", marginLeft: 8 }}>
              (memuat {visible.length}…)
            </span>
          )}
        </p>
      </div>

      <SearchBar value={search} onChange={setSearch} placeholder={`Cari ${albums.length} album…`} />

      {filtered.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-faint)", textAlign: "center", marginTop: 40 }}>
          Tidak ada album yang cocok dengan "{search}"
        </p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))", gap: 16 }}>
          {visible.map(album => (
            <AlbumCard
              key={`${album.name}__${album.artist}`}
              album={album}
              onClick={() => setSelected(`${album.name}__${album.artist}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AlbumCard({ album, onClick }: { album: any; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} style={{ cursor: "pointer" }}>
      <div style={{
        position: "relative", borderRadius: "var(--radius-md, 8px)", overflow: "hidden",
        marginBottom: 8,
        transform: hovered ? "scale(1.03)" : "scale(1)",
        transition: "transform 0.18s ease, box-shadow 0.18s",
        boxShadow: hovered ? "0 8px 20px rgba(0,0,0,0.4)" : "none",
      }}>
        <CoverArt id={album.representativeId} coverArt={album.coverArt} size={148}
          style={{ width: "100%", height: 148, borderRadius: "var(--radius-md, 8px)" }} />
        {hovered && (
          <div style={{
            position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: "var(--radius-md, 8px)",
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: "50%",
              background: "linear-gradient(135deg, var(--accent, #7C3AED), #EC4899)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, color: "white",
            }}>▶</div>
          </div>
        )}
      </div>
      <div style={{ overflow: "hidden" }}>
        <div style={{ fontWeight: 600, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--text-primary)" }}>
          {album.name}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 1 }}>{album.artist}</div>
        <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 1 }}>
          {album.songs.length} lagu{album.year ? ` · ${album.year}` : ""}
        </div>
      </div>
    </div>
  );
}

function AlbumDetail({ album, onBack, onPlay, onDelete }: {
  album: any; onBack: () => void;
  onPlay: Props["onPlay"];
  onDelete: (songs: Song[]) => Promise<void>;
}) {
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const totalDur = album.songs.reduce((a: number, s: Song) => a + (s.duration || 0), 0);

  const [deleteStep, setDeleteStep]   = useState<0|1|2>(0);
  const [isDeleting, setIsDeleting]   = useState(false);
  const [selected, setSelected]       = useState<Set<number>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; songs: Song[] } | null>(null);
  const [confirmDel, setConfirmDel]   = useState<Song[] | null>(null);
  const [playlists, setPlaylists]     = useState<any[]>([]);
  const lastSelIdx = useRef(-1);

  useEffect(() => {
    getDb().then(db => getPlaylists(db)).then(setPlaylists).catch(() => {});
  }, []);

  const sortedSongs = useMemo(() => {
    return [...album.songs].sort((a: Song, b: Song) => {
      const ta = (a as any).track; const tb = (b as any).track;
      if (ta != null && tb != null) return Number(ta) - Number(tb);
      if (ta != null) return -1; if (tb != null) return 1;
      return (a.title ?? "").localeCompare(b.title ?? "");
    });
  }, [album.songs]);

  const selectedSongs = useMemo(() => sortedSongs.filter(s => selected.has(s.id)), [sortedSongs, selected]);

  const toggleSelect = useCallback((id: number, idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (e.shiftKey && lastSelIdx.current >= 0) {
      const start = Math.min(lastSelIdx.current, idx);
      const end   = Math.max(lastSelIdx.current, idx);
      const ids = sortedSongs.slice(start, end + 1).map(s => s.id);
      setSelected(prev => { const n = new Set(prev); ids.forEach(id => n.add(id)); return n; });
    } else {
      setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
      lastSelIdx.current = idx;
    }
  }, [sortedSongs]);

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
          onPlayNow={ss => { onPlay(sortedSongs, sortedSongs.findIndex(s => s.id === ss[0].id)); }}
          onPlayNext={handlePlayNext}
          onAddToQueue={handleAddToQueue}
          onAddToPlaylist={handleAddToPlaylist}
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
        ← Kembali ke album
      </button>

      {/* Album header */}
      <div style={{ display: "flex", gap: 18, marginBottom: 16 }}>
        <CoverArt id={album.representativeId} coverArt={album.coverArt} size={110} />
        <div style={{ flex: 1 }}>
          <h2 style={{ fontWeight: 700, fontSize: 19, letterSpacing: "-0.4px", color: "var(--text-primary)" }}>
            {album.name}
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: 13, marginTop: 4 }}>{album.artist}</p>
          <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 5 }}>
            {album.songs.length} lagu · {Math.round(totalDur / 60)} menit
            {album.year ? ` · ${album.year}` : ""}
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button onClick={() => onPlay(sortedSongs, 0)} style={{
              padding: "7px 16px", borderRadius: "var(--radius-md, 8px)", fontSize: 12,
              background: "linear-gradient(135deg, var(--accent, #7C3AED), #EC4899)",
              border: "none", color: "white", cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
            }}>Putar album</button>
            <button onClick={() => { const s = [...sortedSongs].sort(() => Math.random() - 0.5); onPlay(s, 0); }} style={{
              padding: "7px 13px", borderRadius: "var(--radius-md, 8px)", fontSize: 12,
              background: "var(--accent-dim, rgba(124,58,237,0.15))",
              border: "1px solid var(--accent-border, rgba(124,58,237,0.4))",
              color: "var(--accent-light, #a78bfa)", cursor: "pointer", fontFamily: "inherit",
            }}>Acak</button>
            <button onClick={() => setDeleteStep(1)} style={{
              padding: "7px 13px", borderRadius: "var(--radius-md, 8px)", fontSize: 12,
              background: "var(--danger-dim, rgba(239,68,68,0.1))", border: "1px solid rgba(239,68,68,0.3)",
              color: "#f87171", cursor: "pointer", fontFamily: "inherit",
            }}>Hapus album</button>
          </div>
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div style={{ marginBottom: 10 }}>
          <BulkActionBar
            count={selected.size}
            playlists={playlists}
            onPlayNow={() => { const ss = selectedSongs; if (ss[0]) onPlay(sortedSongs, sortedSongs.findIndex(s => s.id === ss[0].id)); }}
            onPlayNext={() => handlePlayNext(selectedSongs)}
            onAddToQueue={() => handleAddToQueue(selectedSongs)}
            onAddToPlaylist={pid => handleAddToPlaylist(pid, selectedSongs)}
            onDelete={() => setConfirmDel(selectedSongs)}
            onClear={() => setSelected(new Set())}
          />
        </div>
      )}

      {/* Track list */}
      {sortedSongs.map((song: Song, i: number) => {
        const isSelected = selected.has(song.id);
        return (
          <div
            key={song.id}
            onClick={e => {
              if (selected.size > 0) { toggleSelect(song.id, i, e); return; }
              onPlay(sortedSongs, i);
            }}
            onContextMenu={e => {
              const ctxSongs = isSelected && selected.size > 1 ? selectedSongs : [song];
              handleCtxMenu(e, ctxSongs);
            }}
            style={{
              display: "flex", alignItems: "center", gap: 11,
              padding: "8px 8px", borderRadius: "var(--radius-md, 8px)", marginBottom: 2, cursor: "pointer",
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
              {(song as any).track ?? i + 1}
            </span>
            <div style={{ flex: 1, overflow: "hidden" }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>{song.title}</span>
            </div>
            {(song.stars ?? 0) > 0 && (
              <span style={{ fontSize: 10, color: "#F59E0B", flexShrink: 0 }}>{"★".repeat(song.stars ?? 0)}</span>
            )}
            <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace", flexShrink: 0 }}>
              {fmt(Math.floor(song.duration))}
            </span>
          </div>
        );
      })}

      {/* Album delete confirm (whole album) */}
      {deleteStep === 1 && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setDeleteStep(0)}>
          <div style={{
            background: "var(--bg-overlay)", border: "1px solid var(--border-medium)",
            borderRadius: "var(--radius-xl, 16px)", padding: "26px 30px", maxWidth: 360, textAlign: "center",
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 8, color: "var(--text-primary)" }}>Hapus album dari library?</h3>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 5, lineHeight: 1.6 }}>
              <strong style={{ color: "var(--text-primary)" }}>{album.name}</strong> oleh{" "}
              <strong style={{ color: "var(--text-primary)" }}>{album.artist}</strong>
            </p>
            <p style={{ fontSize: 12, color: "var(--warning, #F59E0B)", marginBottom: 20 }}>
              {album.songs.length} lagu akan dihapus dari library.
            </p>
            <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 18 }}>File audio di disk tidak terpengaruh.</p>
            <div style={{ display: "flex", gap: 9, justifyContent: "center" }}>
              <button onClick={() => setDeleteStep(0)} style={{ padding: "7px 20px", borderRadius: "var(--radius-md, 8px)", fontSize: 13, background: "transparent", border: "1px solid var(--border-medium)", color: "var(--text-secondary)", cursor: "pointer", fontFamily: "inherit" }}>Batal</button>
              <button onClick={() => setDeleteStep(2)} style={{ padding: "7px 20px", borderRadius: "var(--radius-md, 8px)", fontSize: 13, background: "var(--danger-dim, rgba(239,68,68,0.2))", border: "1px solid rgba(239,68,68,0.5)", color: "#f87171", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Lanjutkan →</button>
            </div>
          </div>
        </div>
      )}

      {deleteStep === 2 && (
        <div style={{ position: "fixed", inset: 0, zIndex: 301, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setDeleteStep(0)}>
          <div style={{
            background: "var(--bg-overlay)", border: "2px solid rgba(239,68,68,0.5)",
            borderRadius: "var(--radius-xl, 16px)", padding: "26px 30px", maxWidth: 340, textAlign: "center",
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 8, color: "#f87171" }}>Konfirmasi penghapusan</h3>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 5 }}>
              <strong style={{ color: "#f87171" }}>{album.songs.length} lagu</strong> dari{" "}
              <strong style={{ color: "var(--text-primary)" }}>"{album.name}"</strong> akan dihapus permanen.
            </p>
            <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 22 }}>Tindakan ini tidak bisa diurungkan.</p>
            <div style={{ display: "flex", gap: 9, justifyContent: "center" }}>
              <button onClick={() => setDeleteStep(0)} style={{ padding: "7px 20px", borderRadius: "var(--radius-md, 8px)", fontSize: 13, background: "transparent", border: "1px solid var(--border-medium)", color: "var(--text-secondary)", cursor: "pointer", fontFamily: "inherit" }}>Batal</button>
              <button onClick={async () => { setIsDeleting(true); try { await onDelete(album.songs); } finally { setIsDeleting(false); setDeleteStep(0); } }}
                disabled={isDeleting} style={{ padding: "7px 20px", borderRadius: "var(--radius-md, 8px)", fontSize: 13, background: "#EF4444", border: "1px solid #EF4444", color: "white", cursor: isDeleting ? "wait" : "pointer", fontFamily: "inherit", fontWeight: 700, opacity: isDeleting ? 0.6 : 1 }}>
                {isDeleting ? "Menghapus…" : "Hapus sekarang"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Artist View ────────────────────────────────────────────────────────────────
export function ArtistView({ onPlay }: Props) {
  const { songs } = useLibraryStore();
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch]     = useState("");

  const artists = useMemo(() => {
    const map = new Map<string, { name: string; songs: Song[]; representativeId: number; coverArt: string | null }>();
    for (const song of songs) {
      const name = song.artist ?? "Unknown Artist";
      if (!map.has(name)) map.set(name, { name, songs: [], representativeId: song.id, coverArt: song.cover_art ?? null });
      map.get(name)!.songs.push(song);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [songs]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return artists;
    return artists.filter(a => a.name.toLowerCase().includes(q));
  }, [artists, search]);

  const visible = useLazyRender(filtered);
  const selectedArtist = selected ? artists.find(a => a.name === selected) : null;

  if (selectedArtist) {
    return <ArtistDetail artist={selectedArtist} onBack={() => setSelected(null)} onPlay={onPlay} />;
  }

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <h3 style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)", letterSpacing: "-0.3px", marginBottom: 2 }}>
          Artis
        </h3>
        <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {filtered.length} / {artists.length} artis
        </p>
      </div>

      <SearchBar value={search} onChange={setSearch} placeholder={`Cari ${artists.length} artis…`} />

      {filtered.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-faint)", textAlign: "center", marginTop: 40 }}>
          Tidak ada artis yang cocok dengan "{search}"
        </p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 14 }}>
          {visible.map(artist => (
            <div key={artist.name} onClick={() => setSelected(artist.name)} style={{ cursor: "pointer", textAlign: "center" }}>
              <div style={{ position: "relative", width: 116, height: 116, margin: "0 auto 8px", borderRadius: "50%", overflow: "hidden" }}>
                <CoverArt id={artist.representativeId} coverArt={artist.coverArt} size={116} style={{ borderRadius: "50%" }} />
              </div>
              <div style={{ fontWeight: 600, fontSize: 12, color: "var(--text-primary)" }}>{artist.name}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{artist.songs.length} lagu</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ArtistDetail({ artist, onBack, onPlay }: { artist: any; onBack: () => void; onPlay: Props["onPlay"] }) {
  const [selected, setSelected]       = useState<Set<number>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; songs: Song[] } | null>(null);
  const [confirmDel, setConfirmDel]   = useState<Song[] | null>(null);
  const [playlists, setPlaylists]     = useState<any[]>([]);
  const lastSelIdx = useRef(-1);

  useEffect(() => {
    getDb().then(db => getPlaylists(db)).then(setPlaylists).catch(() => {});
  }, []);

  const albumMap = new Map<string, Song[]>();
  for (const s of artist.songs) {
    const key = s.album ?? "Singles";
    if (!albumMap.has(key)) albumMap.set(key, []);
    albumMap.get(key)!.push(s);
  }

  const sortedAlbums = Array.from(albumMap.entries()).map(([name, sgs]) => ({
    name,
    songs: [...sgs].sort((a: Song, b: Song) => {
      const ta = (a as any).track; const tb = (b as any).track;
      if (ta != null && tb != null) return Number(ta) - Number(tb);
      if (ta != null) return -1; if (tb != null) return 1;
      return (a.title ?? "").localeCompare(b.title ?? "");
    }),
  }));

  const allSongs = sortedAlbums.flatMap(a => a.songs);
  const selectedSongs = allSongs.filter(s => selected.has(s.id));

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
          onPlayNow={ss => { onPlay(allSongs, allSongs.findIndex(s => s.id === ss[0].id)); }}
          onPlayNext={handlePlayNext}
          onAddToQueue={handleAddToQueue}
          onAddToPlaylist={handleAddToPlaylist}
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
        ← Kembali ke artis
      </button>

      <div style={{ display: "flex", gap: 16, marginBottom: 22 }}>
        <CoverArt id={artist.representativeId} coverArt={artist.coverArt} size={76} style={{ borderRadius: "50%" }} />
        <div>
          <h2 style={{ fontWeight: 700, fontSize: 20, letterSpacing: "-0.5px", color: "var(--text-primary)" }}>
            {artist.name}
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 4 }}>
            {artist.songs.length} lagu · {albumMap.size} album
          </p>
          <button onClick={() => onPlay(artist.songs, 0)} style={{
            marginTop: 10, padding: "6px 14px", borderRadius: "var(--radius-md, 8px)", fontSize: 12,
            background: "linear-gradient(135deg, var(--accent, #7C3AED), #EC4899)",
            border: "none", color: "white", cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
          }}>Putar semua</button>
        </div>
      </div>

      {selected.size > 0 && (
        <div style={{ marginBottom: 12 }}>
          <BulkActionBar
            count={selected.size}
            playlists={playlists}
            onPlayNow={() => { const ss = selectedSongs; if (ss[0]) onPlay(allSongs, allSongs.findIndex(s => s.id === ss[0].id)); }}
            onPlayNext={() => handlePlayNext(selectedSongs)}
            onAddToQueue={() => handleAddToQueue(selectedSongs)}
            onAddToPlaylist={pid => handleAddToPlaylist(pid, selectedSongs)}
            onDelete={() => setConfirmDel(selectedSongs)}
            onClear={() => setSelected(new Set())}
          />
        </div>
      )}

      {sortedAlbums.map(({ name: albumName, songs: albumSongs }, albumIdx) => {
        const albumOffset = sortedAlbums.slice(0, albumIdx).reduce((a, b) => a + b.songs.length, 0);
        return (
          <div key={albumName} style={{ marginBottom: 22 }}>
            <h4 style={{
              fontWeight: 600, fontSize: 13, color: "var(--text-muted)",
              marginBottom: 8, paddingBottom: 6,
              borderBottom: "1px solid var(--border-subtle)",
            }}>
              {albumName}
            </h4>
            {albumSongs.map((song, i) => {
              const globalIdx = albumOffset + i;
              const isSelected = selected.has(song.id);
              return (
                <div
                  key={song.id}
                  onClick={e => {
                    if (selected.size > 0) {
                      if (e.shiftKey && lastSelIdx.current >= 0) {
                        const start = Math.min(lastSelIdx.current, globalIdx);
                        const end = Math.max(lastSelIdx.current, globalIdx);
                        const ids = allSongs.slice(start, end + 1).map(s => s.id);
                        setSelected(prev => { const n = new Set(prev); ids.forEach(id => n.add(id)); return n; });
                      } else {
                        setSelected(prev => { const n = new Set(prev); n.has(song.id) ? n.delete(song.id) : n.add(song.id); return n; });
                        lastSelIdx.current = globalIdx;
                      }
                    } else {
                      onPlay(albumSongs, i);
                    }
                  }}
                  onContextMenu={e => {
                    const ctxSongs = isSelected && selected.size > 1 ? selectedSongs : [song];
                    handleCtxMenu(e, ctxSongs);
                  }}
                  style={{
                    display: "flex", gap: 11, padding: "7px 7px",
                    borderRadius: "var(--radius-md, 8px)", cursor: "pointer", alignItems: "center",
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
                    onChange={e => {
                      e.stopPropagation();
                      setSelected(prev => { const n = new Set(prev); n.has(song.id) ? n.delete(song.id) : n.add(song.id); return n; });
                      lastSelIdx.current = globalIdx;
                    }}
                    onClick={e => e.stopPropagation()}
                    style={{ accentColor: "var(--accent)", cursor: "pointer", flexShrink: 0 }}
                  />
                  <span style={{ width: 18, fontSize: 11, color: "var(--text-faint)", fontFamily: "monospace", flexShrink: 0 }}>
                    {(song as any).track ?? i + 1}
                  </span>
                  <span style={{ flex: 1, fontSize: 13, color: "var(--text-primary)" }}>{song.title}</span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace", flexShrink: 0 }}>
                    {Math.floor(song.duration / 60)}:{String(Math.floor(song.duration % 60)).padStart(2, "0")}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}