/**
 * Dashboard.tsx — v2
 *
 * FIX:
 *   - Most Played: klik lagu → play dari seluruh list topByPlays (bukan 1 lagu)
 *   - Top Rated: sama, play dari list topByRating
 *   - Recently Played: play dari list recentlyPlayed
 *   - onPlay sekarang: onPlay(songs: Song[], index: number)
 */

import { useMemo } from "react";
import { useLibraryStore, usePlayerStore } from "../../store";
import type { Song } from "../../lib/db";
import CoverArt from "../CoverArt";
import StarRating from "../StarRating";

interface Props {
  onPlay: (songs: Song[], index?: number) => void;
  onRating: (songId: number, stars: number) => void;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export default function Dashboard({ onPlay, onRating }: Props) {
  const { songs } = useLibraryStore();
  const { currentSong, isPlaying, history } = usePlayerStore();

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const totalDuration = songs.reduce((a, s) => a + (s.duration || 0), 0);
    const lossless      = songs.filter(s => ["FLAC","WAV","ALAC","APE"].includes((s.format||"").toUpperCase())).length;
    const rated         = songs.filter(s => s.stars && s.stars > 0);
    const avgRating     = rated.length > 0
      ? (rated.reduce((a, s) => a + (s.stars || 0), 0) / rated.length).toFixed(1)
      : "—";
    const totalPlays = history.length;

    return {
      tracks: songs.length,
      hours: Math.round(totalDuration / 3600),
      losslessPct: songs.length > 0 ? Math.round((lossless / songs.length) * 100) : 0,
      avgRating,
      totalPlays,
      rated: rated.length,
    };
  }, [songs, history]);

  // ── Recently Played ───────────────────────────────────────────────────────
  const recentlyPlayed = useMemo(() => {
    const seen   = new Set<number>();
    const result: Song[] = [];
    for (const record of history) {
      if (!seen.has(record.song_id)) {
        seen.add(record.song_id);
        const song = songs.find(s => s.id === record.song_id);
        if (song) result.push(song);
      }
      if (result.length >= 15) break;
    }
    return result;
  }, [history, songs]);

  // ── Top Tracks ────────────────────────────────────────────────────────────
  const topByPlays = useMemo(() =>
    [...songs].sort((a, b) => (b.play_count || 0) - (a.play_count || 0)).slice(0, 10),
    [songs]
  );

  const topByRating = useMemo(() =>
    songs.filter(s => s.stars && s.stars >= 4)
      .sort((a, b) => (b.stars || 0) - (a.stars || 0))
      .slice(0, 10),
    [songs]
  );

  // ── Heatmap ───────────────────────────────────────────────────────────────
  const heatmap = useMemo(() => {
    const days = new Array(7).fill(0);
    for (const record of history) {
      const day = new Date(record.played_at).getDay();
      days[day]++;
    }
    const max = Math.max(...days, 1);
    return days.map(v => v / max);
  }, [history]);

  const dayLabels = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

  if (songs.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "#4b5563", gap: 8 }}>
        <div style={{ fontSize: 48 }}>🎵</div>
        <p style={{ fontSize: 14, color: "#6b7280" }}>Library kosong</p>
        <p style={{ fontSize: 12 }}>Scan folder musik untuk mulai</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

      {/* ── Stats row ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
        {[
          { icon: "🎵", value: stats.tracks, label: "Total Lagu" },
          { icon: "⏱️", value: `${stats.hours}j`, label: "Total Durasi" },
          { icon: "💎", value: `${stats.losslessPct}%`, label: "Lossless" },
          { icon: "⭐", value: stats.avgRating, label: "Rata-rata Rating" },
          { icon: "▶️", value: stats.totalPlays, label: "Total Plays" },
        ].map(stat => (
          <div key={stat.label} style={{
            background: "#0d0d1f", border: "1px solid #1a1a2e",
            borderRadius: 10, padding: "14px 16px", textAlign: "center",
          }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>{stat.icon}</div>
            <div style={{ fontWeight: 700, fontSize: 20, color: "#a78bfa", letterSpacing: "-0.5px" }}>{stat.value}</div>
            <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* ── Recently Played ── */}
      {recentlyPlayed.length > 0 && (
        <Section title="Baru Diputar" icon="🕐">
          <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 }}>
            {recentlyPlayed.map((song, i) => (
              <div
                key={song.id}
                onClick={() => onPlay(recentlyPlayed, i)}   // ← FIX: play dari list
                style={{
                  flexShrink: 0, width: 130, cursor: "pointer",
                  borderRadius: 10, overflow: "hidden",
                  border: currentSong?.id === song.id ? "1px solid #7C3AED" : "1px solid #1a1a2e",
                  background: "#0d0d1f", transition: "transform 0.2s",
                }}
                onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.03)")}
                onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
              >
                <CoverArt id={song.id} coverArt={song.cover_art} size={130} style={{ width: "100%", height: 130, borderRadius: 0 }} />
                <div style={{ padding: "8px 10px" }}>
                  <div style={{ fontWeight: 600, fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {song.title}
                  </div>
                  <div style={{ fontSize: 10, color: "#6b7280", marginTop: 1 }}>{song.artist}</div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Top Tracks ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

        {/* Most Played — FIX: onPlay(topByPlays, i) bukan onPlay([song]) */}
        <Section title="Paling Sering Diputar" icon="🔥">
          {topByPlays.map((song, i) => (
            <TrackRow
              key={song.id}
              song={song}
              rank={i + 1}
              onPlay={() => onPlay(topByPlays, i)}   // ← FIX
              onRating={onRating}
              suffix={`${song.play_count || 0}×`}
            />
          ))}
        </Section>

        {/* Top Rated — FIX: sama */}
        <Section title="Rating Tertinggi" icon="⭐">
          {topByRating.length === 0 ? (
            <p style={{ fontSize: 12, color: "#4b5563" }}>Rating beberapa lagu dulu!</p>
          ) : (
            topByRating.map((song, i) => (
              <TrackRow
                key={song.id}
                song={song}
                rank={i + 1}
                onPlay={() => onPlay(topByRating, i)}   // ← FIX
                onRating={onRating}
                suffix={<span style={{ color: "#F59E0B" }}>{"★".repeat(song.stars || 0)}</span>}
              />
            ))
          )}
        </Section>
      </div>

      {/* ── Heatmap ── */}
      {history.length > 0 && (
        <Section title="Aktivitas Mendengarkan" icon="📊">
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", height: 60 }}>
            {heatmap.map((intensity, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{
                  width: "100%", borderRadius: 4,
                  height: `${Math.max(6, intensity * 52)}px`,
                  background: intensity > 0.7
                    ? "linear-gradient(to top, #7C3AED, #EC4899)"
                    : intensity > 0.3 ? "rgba(124,58,237,0.5)" : "#1a1a2e",
                  transition: "height 0.3s ease",
                }} />
                <span style={{ fontSize: 9, color: "#4b5563" }}>{dayLabels[i]}</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11, color: "#4b5563", marginTop: 8 }}>
            Berdasarkan {history.length} sesi play
          </p>
        </Section>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <h3 style={{ fontWeight: 700, fontSize: 14, letterSpacing: "-0.2px" }}>{title}</h3>
      </div>
      {children}
    </div>
  );
}

function TrackRow({ song, rank, onPlay, onRating, suffix }: {
  song: Song; rank: number;
  onPlay: () => void;
  onRating: (id: number, s: number) => void;
  suffix: React.ReactNode;
}) {
  return (
    <div
      onClick={onPlay}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "6px 8px", borderRadius: 8, marginBottom: 2,
        cursor: "pointer",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      <span style={{
        width: 18, fontSize: 11,
        color: rank <= 3 ? "#F59E0B" : "#4b5563",
        fontWeight: rank <= 3 ? 700 : 400,
        fontFamily: "monospace", textAlign: "center",
      }}>
        {rank}
      </span>
      <CoverArt id={song.id} coverArt={song.cover_art} size={32} />
      <div style={{ flex: 1, overflow: "hidden" }}>
        <div style={{ fontWeight: 500, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {song.title}
        </div>
        <div style={{ fontSize: 10, color: "#6b7280" }}>{song.artist}</div>
      </div>
      <span style={{ fontSize: 11, color: "#6b7280", flexShrink: 0 }}>{suffix}</span>
    </div>
  );
}

import React from "react";