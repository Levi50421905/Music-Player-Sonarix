/**
 * AlbumView.tsx — v3
 *
 * FIX/TAMBAHAN:
 *   [#1] Lazy render via requestIdleCallback (sudah ada, dipertahankan)
 *   [#2] Sort by track number (sudah ada, dipertahankan)
 *   [#6] Search bar (sudah ada, dipertahankan)
 *   [NEW] Hapus album dari library: tombol di AlbumDetail
 *         - Konfirmasi 1: "Hapus X lagu dari library?"
 *         - Konfirmasi 2: "Yakin? Tidak bisa dibatalkan."
 *         - File audio di disk TIDAK terhapus
 *   [NEW] Shuffle album: play dengan urutan acak hanya dari album ini
 */

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useLibraryStore } from "../../store";
import { getDb, deleteSongs } from "../../lib/db";
import type { Song } from "../../lib/db";
import CoverArt from "../CoverArt";

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
        position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
        color: "#6b7280", fontSize: 13, pointerEvents: "none",
      }}>🔍</span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%", padding: "8px 32px 8px 32px",
          background: "#0d0d1f", border: "1px solid #1f1f35",
          borderRadius: 8, color: "#e2e8f0", fontSize: 13,
          fontFamily: "inherit", outline: "none", boxSizing: "border-box",
        }}
        onFocus={e => (e.currentTarget.style.borderColor = "#7C3AED")}
        onBlur={e => (e.currentTarget.style.borderColor = "#1f1f35")}
      />
      {value && (
        <button onClick={() => onChange("")} style={{
          position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
          background: "none", border: "none", cursor: "pointer", color: "#6b7280", fontSize: 14,
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
          () => setVisibleCount(prev => Math.min(prev + chunkSize, items.length)),
          16
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
  const [search, setSearch] = useState("");

  const albums = useMemo(() => {
    const map = new Map<string, {
      name: string; artist: string; songs: Song[];
      year: number | null; representativeId: number; coverArt: string | null;
    }>();

    for (const song of songs) {
      const key = `${song.album}__${song.artist}`;
      if (!map.has(key)) {
        map.set(key, {
          name: song.album ?? "Album Tidak Diketahui",
          artist: song.artist ?? "Artis Tidak Diketahui",
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
    return albums.filter(a =>
      a.name.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q)
    );
  }, [albums, search]);

  const visible = useLazyRender(filtered);

  const handleDeleteAlbum = useCallback(async (albumSongs: Song[]) => {
    const db = await getDb();
    const ids = albumSongs.map(s => s.id);
    await deleteSongs(db, ids);
    setSongs((prev: Song[]) => Array.isArray(prev) ? prev.filter(s => !ids.includes(s.id)) : []);
    setSelected(null);
  }, [setSongs]);

  const selectedAlbum = selected
    ? albums.find(a => `${a.name}__${a.artist}` === selected)
    : null;

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
        <h3 style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.3px", marginBottom: 2 }}>Album</h3>
        <p style={{ fontSize: 12, color: "#6b7280" }}>
          {filtered.length} / {albums.length} album
          {visible.length < filtered.length && (
            <span style={{ color: "#4b5563", marginLeft: 8 }}>(memuat {visible.length}...)</span>
          )}
        </p>
      </div>

      <SearchBar value={search} onChange={setSearch} placeholder={`Cari ${albums.length} album...`} />

      {filtered.length === 0 ? (
        <p style={{ fontSize: 13, color: "#4b5563", textAlign: "center", marginTop: 40 }}>
          Tidak ada album yang cocok dengan "{search}"
        </p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 16 }}>
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
        position: "relative", borderRadius: 10, overflow: "hidden", marginBottom: 8,
        transform: hovered ? "scale(1.03)" : "scale(1)",
        transition: "transform 0.2s ease",
        boxShadow: hovered ? "0 8px 24px rgba(0,0,0,0.5)" : "none",
      }}>
        <CoverArt id={album.representativeId} coverArt={album.coverArt} size={150}
          style={{ width: "100%", height: 150, borderRadius: 10 }} />
        {hovered && (
          <div style={{
            position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 10,
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: "50%",
              background: "linear-gradient(135deg,#7C3AED,#EC4899)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, color: "white",
            }}>▶</div>
          </div>
        )}
      </div>
      <div style={{ overflow: "hidden" }}>
        <div style={{ fontWeight: 600, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {album.name}
        </div>
        <div style={{ fontSize: 11, color: "#6b7280", marginTop: 1 }}>{album.artist}</div>
        <div style={{ fontSize: 10, color: "#4b5563" }}>
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

  // Delete confirm: 2 tahap
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
  const [isDeleting, setIsDeleting] = useState(false);

  const sortedSongs = useMemo(() => {
    return [...album.songs].sort((a: Song, b: Song) => {
      const ta = (a as any).track;
      const tb = (b as any).track;
      if (ta != null && tb != null) return Number(ta) - Number(tb);
      if (ta != null) return -1;
      if (tb != null) return 1;
      return (a.title ?? "").localeCompare(b.title ?? "");
    });
  }, [album.songs]);

  const handleShufflePlay = () => {
    const shuffled = [...sortedSongs].sort(() => Math.random() - 0.5);
    onPlay(shuffled, 0);
  };

  const handleDeleteConfirm = async () => {
    setIsDeleting(true);
    try {
      await onDelete(album.songs);
    } finally {
      setIsDeleting(false);
      setDeleteStep(0);
    }
  };

  return (
    <div>
      <button onClick={onBack} style={{
        background: "none", border: "none", cursor: "pointer",
        color: "#9ca3af", fontSize: 13, marginBottom: 16,
        display: "flex", alignItems: "center", gap: 6,
        fontFamily: "inherit", padding: 0,
      }}>← Kembali ke Album</button>

      {/* Album header */}
      <div style={{ display: "flex", gap: 20, marginBottom: 24 }}>
        <CoverArt id={album.representativeId} coverArt={album.coverArt} size={120} />
        <div style={{ flex: 1 }}>
          <h2 style={{ fontWeight: 700, fontSize: 20, letterSpacing: "-0.4px" }}>{album.name}</h2>
          <p style={{ color: "#9ca3af", fontSize: 14, marginTop: 4 }}>{album.artist}</p>
          <p style={{ color: "#6b7280", fontSize: 12, marginTop: 6 }}>
            {album.songs.length} lagu · {Math.round(totalDur / 60)} menit
            {album.year ? ` · ${album.year}` : ""}
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button
              onClick={() => onPlay(sortedSongs, 0)}
              style={{
                padding: "8px 18px", borderRadius: 8, fontSize: 12,
                background: "linear-gradient(135deg,#7C3AED,#EC4899)",
                border: "none", color: "white", cursor: "pointer",
                fontFamily: "inherit", fontWeight: 600,
              }}
            >▶ Putar Album</button>
            <button
              onClick={handleShufflePlay}
              style={{
                padding: "8px 14px", borderRadius: 8, fontSize: 12,
                background: "rgba(124,58,237,0.15)",
                border: "1px solid rgba(124,58,237,0.4)",
                color: "#a78bfa", cursor: "pointer",
                fontFamily: "inherit",
              }}
            >⇄ Acak</button>
            {/* Tombol hapus album */}
            <button
              onClick={() => setDeleteStep(1)}
              style={{
                padding: "8px 14px", borderRadius: 8, fontSize: 12,
                background: "rgba(239,68,68,0.1)",
                border: "1px solid rgba(239,68,68,0.3)",
                color: "#f87171", cursor: "pointer",
                fontFamily: "inherit",
              }}
            >🗑 Hapus Album</button>
          </div>
        </div>
      </div>

      {/* ── Delete confirm modal — Step 1 ── */}
      {deleteStep === 1 && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 300,
            background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={() => setDeleteStep(0)}
        >
          <div
            style={{
              background: "#0d0d1f", border: "1px solid #2a2a3e",
              borderRadius: 14, padding: "28px 32px", maxWidth: 380, textAlign: "center",
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{
              width: 52, height: 52, borderRadius: 14, margin: "0 auto 16px",
              background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
            }}>🗑️</div>
            <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Hapus Album dari Library?</h3>
            <p style={{ fontSize: 12, color: "#9ca3af", marginBottom: 6, lineHeight: 1.6 }}>
              Album <strong style={{ color: "#e2e8f0" }}>{album.name}</strong> oleh{" "}
              <strong style={{ color: "#e2e8f0" }}>{album.artist}</strong> akan dihapus.
            </p>
            <p style={{ fontSize: 12, color: "#9ca3af", marginBottom: 20 }}>
              <span style={{ color: "#F59E0B" }}>⚠️ {album.songs.length} lagu</span> akan dihapus dari library.
              <br />
              <span style={{ color: "#6b7280", fontSize: 11 }}>File audio di disk tidak akan terpengaruh.</span>
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button onClick={() => setDeleteStep(0)} style={{
                padding: "8px 22px", borderRadius: 8, fontSize: 13,
                background: "transparent", border: "1px solid #3f3f5a",
                color: "#9ca3af", cursor: "pointer", fontFamily: "inherit",
              }}>Batal</button>
              <button onClick={() => setDeleteStep(2)} style={{
                padding: "8px 22px", borderRadius: 8, fontSize: 13,
                background: "rgba(239,68,68,0.2)", border: "1px solid #EF4444",
                color: "#f87171", cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
              }}>Lanjutkan →</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm modal — Step 2 (konfirmasi akhir) ── */}
      {deleteStep === 2 && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 301,
            background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={() => setDeleteStep(0)}
        >
          <div
            style={{
              background: "#0d0d1f", border: "2px solid rgba(239,68,68,0.5)",
              borderRadius: 14, padding: "28px 32px", maxWidth: 360, textAlign: "center",
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
            <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 8, color: "#f87171" }}>
              Konfirmasi Terakhir
            </h3>
            <p style={{ fontSize: 13, color: "#9ca3af", marginBottom: 6 }}>
              <strong style={{ color: "#f87171" }}>{album.songs.length} lagu</strong> dari album{" "}
              <strong style={{ color: "#e2e8f0" }}>"{album.name}"</strong> akan dihapus permanen dari library.
            </p>
            <p style={{ fontSize: 11, color: "#6b7280", marginBottom: 24 }}>
              Tindakan ini tidak dapat dibatalkan.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button onClick={() => setDeleteStep(0)} style={{
                padding: "8px 22px", borderRadius: 8, fontSize: 13,
                background: "transparent", border: "1px solid #3f3f5a",
                color: "#9ca3af", cursor: "pointer", fontFamily: "inherit",
              }}>Batal</button>
              <button
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                style={{
                  padding: "8px 22px", borderRadius: 8, fontSize: 13,
                  background: "#EF4444", border: "1px solid #EF4444",
                  color: "white", cursor: isDeleting ? "wait" : "pointer",
                  fontFamily: "inherit", fontWeight: 700,
                  opacity: isDeleting ? 0.6 : 1,
                }}
              >
                {isDeleting ? "Menghapus..." : "Ya, Hapus Sekarang"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Track list */}
      {sortedSongs.map((song: Song, i: number) => (
        <div
          key={song.id}
          onClick={() => onPlay(sortedSongs, i)}
          style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "9px 10px", borderRadius: 8, marginBottom: 2, cursor: "pointer",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        >
          <span style={{ width: 20, textAlign: "center", fontSize: 11, color: "#4b5563", fontFamily: "monospace" }}>
            {(song as any).track ?? i + 1}
          </span>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>{song.title}</span>
          </div>
          {song.stars ? (
            <span style={{ fontSize: 10, color: "#F59E0B" }}>{"★".repeat(song.stars)}</span>
          ) : null}
          <span style={{ fontSize: 11, color: "#6b7280", fontFamily: "monospace" }}>
            {fmt(Math.floor(song.duration))}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Artist View ────────────────────────────────────────────────────────────────
export function ArtistView({ onPlay }: Props) {
  const { songs } = useLibraryStore();
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const artists = useMemo(() => {
    const map = new Map<string, { name: string; songs: Song[]; representativeId: number; coverArt: string | null; }>();

    for (const song of songs) {
      const name = song.artist ?? "Artis Tidak Diketahui";
      if (!map.has(name)) {
        map.set(name, { name, songs: [], representativeId: song.id, coverArt: song.cover_art ?? null });
      }
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
    return (
      <ArtistDetail artist={selectedArtist} onBack={() => setSelected(null)} onPlay={onPlay} />
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <h3 style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.3px", marginBottom: 2 }}>Artis</h3>
        <p style={{ fontSize: 12, color: "#6b7280" }}>
          {filtered.length} / {artists.length} artis
          {visible.length < filtered.length && (
            <span style={{ color: "#4b5563", marginLeft: 8 }}>(memuat {visible.length}...)</span>
          )}
        </p>
      </div>

      <SearchBar value={search} onChange={setSearch} placeholder={`Cari ${artists.length} artis...`} />

      {filtered.length === 0 ? (
        <p style={{ fontSize: 13, color: "#4b5563", textAlign: "center", marginTop: 40 }}>
          Tidak ada artis yang cocok dengan "{search}"
        </p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 14 }}>
          {visible.map(artist => (
            <div
              key={artist.name}
              onClick={() => setSelected(artist.name)}
              style={{ cursor: "pointer", textAlign: "center" }}
            >
              <div style={{ position: "relative", width: 120, height: 120, margin: "0 auto 8px", borderRadius: "50%", overflow: "hidden" }}>
                <CoverArt id={artist.representativeId} coverArt={artist.coverArt} size={120} style={{ borderRadius: "50%" }} />
              </div>
              <div style={{ fontWeight: 600, fontSize: 12 }}>{artist.name}</div>
              <div style={{ fontSize: 10, color: "#6b7280" }}>{artist.songs.length} lagu</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ArtistDetail({ artist, onBack, onPlay }: { artist: any; onBack: () => void; onPlay: Props["onPlay"]; }) {
  const albumMap = new Map<string, Song[]>();
  for (const s of artist.songs) {
    const key = s.album ?? "Single";
    if (!albumMap.has(key)) albumMap.set(key, []);
    albumMap.get(key)!.push(s);
  }

  const sortedAlbums = Array.from(albumMap.entries()).map(([name, sgs]) => ({
    name,
    songs: [...sgs].sort((a: Song, b: Song) => {
      const ta = (a as any).track;
      const tb = (b as any).track;
      if (ta != null && tb != null) return Number(ta) - Number(tb);
      if (ta != null) return -1;
      if (tb != null) return 1;
      return (a.title ?? "").localeCompare(b.title ?? "");
    }),
  }));

  return (
    <div>
      <button onClick={onBack} style={{
        background: "none", border: "none", cursor: "pointer",
        color: "#9ca3af", fontSize: 13, marginBottom: 16,
        display: "flex", alignItems: "center", gap: 6,
        fontFamily: "inherit", padding: 0,
      }}>← Kembali ke Artis</button>

      <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
        <CoverArt id={artist.representativeId} coverArt={artist.coverArt} size={80} style={{ borderRadius: "50%" }} />
        <div>
          <h2 style={{ fontWeight: 700, fontSize: 22, letterSpacing: "-0.5px" }}>{artist.name}</h2>
          <p style={{ color: "#6b7280", fontSize: 12, marginTop: 4 }}>
            {artist.songs.length} lagu · {albumMap.size} album
          </p>
          <button
            onClick={() => onPlay(artist.songs, 0)}
            style={{
              marginTop: 10, padding: "7px 16px", borderRadius: 8, fontSize: 12,
              background: "linear-gradient(135deg,#7C3AED,#EC4899)",
              border: "none", color: "white", cursor: "pointer",
              fontFamily: "inherit", fontWeight: 600,
            }}
          >▶ Putar Semua</button>
        </div>
      </div>

      {sortedAlbums.map(({ name: albumName, songs: albumSongs }) => (
        <div key={albumName} style={{ marginBottom: 24 }}>
          <h4 style={{
            fontWeight: 600, fontSize: 14, color: "#9ca3af",
            marginBottom: 8, paddingBottom: 6, borderBottom: "1px solid #1a1a2e",
          }}>
            {albumName}
          </h4>
          {albumSongs.map((song, i) => (
            <div
              key={song.id}
              onClick={() => onPlay(albumSongs, i)}
              style={{
                display: "flex", gap: 12, padding: "7px 8px",
                borderRadius: 7, cursor: "pointer", alignItems: "center",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ width: 18, fontSize: 10, color: "#4b5563", fontFamily: "monospace" }}>
                {(song as any).track ?? i + 1}
              </span>
              <span style={{ flex: 1, fontSize: 13 }}>{song.title}</span>
              <span style={{ fontSize: 10, color: "#6b7280", fontFamily: "monospace" }}>
                {Math.floor(song.duration / 60)}:{String(Math.floor(song.duration % 60)).padStart(2, "0")}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}