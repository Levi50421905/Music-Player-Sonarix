/**
 * AlbumView.tsx & ArtistView.tsx — Grid Browser
 *
 * WHY grid view:
 *   - Library view (tabel) bagus untuk pencarian spesifik
 *   - Grid view lebih visual dan enak untuk browsing koleksi
 *   - Cover art yang besar membantu identifikasi album secara cepat
 *
 * STRUKTUR:
 *   AlbumGrid → klik album → AlbumDetail (list lagu dalam album)
 *   ArtistGrid → klik artis → ArtistDetail (list album + lagu)
 */

import { useState, useMemo } from "react";
import { useLibraryStore } from "../../store";
import type { Song } from "../../lib/db";
import CoverArt from "../CoverArt";

interface Props {
  onPlay: (songs: Song[], startIndex?: number) => void;
}

// ── Album View ────────────────────────────────────────────────────────────────
export function AlbumView({ onPlay }: Props) {
  const { songs } = useLibraryStore();
  const [selected, setSelected] = useState<string | null>(null);

  // Group songs by album
  const albums = useMemo(() => {
    const map = new Map<string, { name: string; artist: string; songs: Song[]; year: number | null; representativeId: number; coverArt: string | null }>();

    for (const song of songs) {
      const key = `${song.album}__${song.artist}`;
      if (!map.has(key)) {
        map.set(key, {
          name: song.album ?? "Unknown Album",
          artist: song.artist ?? "Unknown Artist",
          songs: [],
          year: song.year ?? null,
          representativeId: song.id,
          coverArt: song.cover_art ?? null,
        });
      }
      map.get(key)!.songs.push(song);
    }

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [songs]);

  const selectedAlbum = selected ? albums.find(a => `${a.name}__${a.artist}` === selected) : null;

  if (selectedAlbum) {
    return (
      <AlbumDetail
        album={selectedAlbum}
        onBack={() => setSelected(null)}
        onPlay={onPlay}
      />
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.3px" }}>Albums</h3>
        <p style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{albums.length} albums</p>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
        gap: 16,
      }}>
        {albums.map(album => (
          <AlbumCard
            key={`${album.name}__${album.artist}`}
            album={album}
            onClick={() => setSelected(`${album.name}__${album.artist}`)}
          />
        ))}
      </div>
    </div>
  );
}

function AlbumCard({ album, onClick }: { album: any; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ cursor: "pointer" }}
    >
      <div style={{
        position: "relative", borderRadius: 10, overflow: "hidden",
        marginBottom: 8,
        transform: hovered ? "scale(1.03)" : "scale(1)",
        transition: "transform 0.2s ease",
        boxShadow: hovered ? "0 8px 24px rgba(0,0,0,0.5)" : "none",
      }}>
        <CoverArt
          id={album.representativeId}
          coverArt={album.coverArt}
          size={150}
          style={{ width: "100%", height: 150, borderRadius: 10 }}
        />
        {/* Play overlay on hover */}
        {hovered && (
          <div style={{
            position: "absolute", inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: 10,
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
        <div style={{
          fontWeight: 600, fontSize: 12,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>{album.name}</div>
        <div style={{ fontSize: 11, color: "#6b7280", marginTop: 1 }}>
          {album.artist}
        </div>
        <div style={{ fontSize: 10, color: "#4b5563" }}>
          {album.songs.length} tracks{album.year ? ` · ${album.year}` : ""}
        </div>
      </div>
    </div>
  );
}

function AlbumDetail({ album, onBack, onPlay }: { album: any; onBack: () => void; onPlay: Props["onPlay"] }) {
  const fmt = (s: number) => `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,"0")}`;
  const totalDur = album.songs.reduce((a: number, s: Song) => a + (s.duration || 0), 0);

  return (
    <div>
      {/* Back button */}
      <button onClick={onBack} style={{
        background: "none", border: "none", cursor: "pointer",
        color: "#9ca3af", fontSize: 13, marginBottom: 16,
        display: "flex", alignItems: "center", gap: 6,
        fontFamily: "inherit", padding: 0,
      }}>← Back to Albums</button>

      {/* Album header */}
      <div style={{ display: "flex", gap: 20, marginBottom: 24 }}>
        <CoverArt id={album.representativeId} coverArt={album.coverArt} size={120} />
        <div style={{ flex: 1 }}>
          <h2 style={{ fontWeight: 700, fontSize: 20, letterSpacing: "-0.4px" }}>{album.name}</h2>
          <p style={{ color: "#9ca3af", fontSize: 14, marginTop: 4 }}>{album.artist}</p>
          <p style={{ color: "#6b7280", fontSize: 12, marginTop: 6 }}>
            {album.songs.length} tracks · {Math.round(totalDur / 60)} min
            {album.year ? ` · ${album.year}` : ""}
          </p>
          <button
            onClick={() => onPlay(album.songs, 0)}
            style={{
              marginTop: 12, padding: "8px 18px", borderRadius: 8, fontSize: 12,
              background: "linear-gradient(135deg,#7C3AED,#EC4899)",
              border: "none", color: "white", cursor: "pointer",
              fontFamily: "inherit", fontWeight: 600,
            }}
          >▶ Play Album</button>
        </div>
      </div>

      {/* Track list */}
      {album.songs
        .sort((a: Song, b: Song) => (a.title ?? "").localeCompare(b.title ?? ""))
        .map((song: Song, i: number) => (
          <div key={song.id} onClick={() => onPlay(album.songs, i)} style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "9px 10px", borderRadius: 8, marginBottom: 2,
            cursor: "pointer", transition: "background 0.1s",
          }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <span style={{ width: 20, textAlign: "center", fontSize: 11, color: "#4b5563", fontFamily: "monospace" }}>
              {i + 1}
            </span>
            <div style={{ flex: 1, overflow: "hidden" }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{song.title}</span>
            </div>
            {song.stars ? <span style={{ fontSize: 10, color: "#F59E0B" }}>{"★".repeat(song.stars)}</span> : null}
            <span style={{ fontSize: 11, color: "#6b7280", fontFamily: "monospace" }}>
              {fmt(Math.floor(song.duration))}
            </span>
          </div>
        ))}
    </div>
  );
}

// ── Artist View ───────────────────────────────────────────────────────────────
export function ArtistView({ onPlay }: Props) {
  const { songs } = useLibraryStore();
  const [selected, setSelected] = useState<string | null>(null);

  const artists = useMemo(() => {
    const map = new Map<string, { name: string; songs: Song[]; representativeId: number; coverArt: string | null }>();

    for (const song of songs) {
      const name = song.artist ?? "Unknown Artist";
      if (!map.has(name)) {
        map.set(name, { name, songs: [], representativeId: song.id, coverArt: song.cover_art ?? null });
      }
      map.get(name)!.songs.push(song);
    }

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [songs]);

  const selectedArtist = selected ? artists.find(a => a.name === selected) : null;

  if (selectedArtist) {
    return (
      <ArtistDetail
        artist={selectedArtist}
        onBack={() => setSelected(null)}
        onPlay={onPlay}
      />
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.3px" }}>Artists</h3>
        <p style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{artists.length} artists</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 14 }}>
        {artists.map(artist => (
          <div
            key={artist.name}
            onClick={() => setSelected(artist.name)}
            style={{ cursor: "pointer", textAlign: "center" }}
          >
            {/* Circle avatar */}
            <div style={{ position: "relative", width: 120, height: 120, margin: "0 auto 8px", borderRadius: "50%", overflow: "hidden" }}>
              <CoverArt id={artist.representativeId} coverArt={artist.coverArt} size={120} style={{ borderRadius: "50%" }} />
            </div>
            <div style={{ fontWeight: 600, fontSize: 12 }}>{artist.name}</div>
            <div style={{ fontSize: 10, color: "#6b7280" }}>{artist.songs.length} tracks</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ArtistDetail({ artist, onBack, onPlay }: { artist: any; onBack: () => void; onPlay: Props["onPlay"] }) {
  // Group by album
  const albumMap = new Map<string, Song[]>();
  for (const s of artist.songs) {
    const key = s.album ?? "Singles";
    if (!albumMap.has(key)) albumMap.set(key, []);
    albumMap.get(key)!.push(s);
  }

  return (
    <div>
      <button onClick={onBack} style={{
        background: "none", border: "none", cursor: "pointer",
        color: "#9ca3af", fontSize: 13, marginBottom: 16,
        display: "flex", alignItems: "center", gap: 6,
        fontFamily: "inherit", padding: 0,
      }}>← Back to Artists</button>

      {/* Artist header */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
        <CoverArt id={artist.representativeId} coverArt={artist.coverArt} size={80} style={{ borderRadius: "50%" }} />
        <div>
          <h2 style={{ fontWeight: 700, fontSize: 22, letterSpacing: "-0.5px" }}>{artist.name}</h2>
          <p style={{ color: "#6b7280", fontSize: 12, marginTop: 4 }}>
            {artist.songs.length} tracks · {albumMap.size} albums
          </p>
          <button onClick={() => onPlay(artist.songs, 0)} style={{
            marginTop: 10, padding: "7px 16px", borderRadius: 8, fontSize: 12,
            background: "linear-gradient(135deg,#7C3AED,#EC4899)",
            border: "none", color: "white", cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
          }}>▶ Play All</button>
        </div>
      </div>

      {/* Albums */}
      {Array.from(albumMap.entries()).map(([albumName, albumSongs]) => (
        <div key={albumName} style={{ marginBottom: 24 }}>
          <h4 style={{ fontWeight: 600, fontSize: 14, color: "#9ca3af", marginBottom: 8, paddingBottom: 6, borderBottom: "1px solid #1a1a2e" }}>
            {albumName}
          </h4>
          {albumSongs.map((song, i) => (
            <div key={song.id} onClick={() => onPlay(albumSongs, i)} style={{
              display: "flex", gap: 12, padding: "7px 8px", borderRadius: 7,
              cursor: "pointer", alignItems: "center",
            }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ width: 18, fontSize: 10, color: "#4b5563", fontFamily: "monospace" }}>{i+1}</span>
              <span style={{ flex: 1, fontSize: 13 }}>{song.title}</span>
              <span style={{ fontSize: 10, color: "#6b7280", fontFamily: "monospace" }}>
                {Math.floor(song.duration/60)}:{String(Math.floor(song.duration%60)).padStart(2,"0")}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}