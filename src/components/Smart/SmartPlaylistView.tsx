/**
 * SmartPlaylist.tsx — Auto-generated Mood-Based Playlists
 *
 * WHY smart playlists:
 *   User tidak perlu kurasi manual. Cukup bilang "mau dengerin yang energik"
 *   → sistem otomatis pilih lagu berdasarkan BPM + rating + genre.
 *
 * MOODS & CRITERIA:
 *   - 🔥 Energy     → BPM > 128, rating >= 3
 *   - 😌 Chill      → BPM < 90 (atau null), rating >= 3
 *   - 💎 Top Rated  → rating >= 4 (semua genre)
 *   - 🔁 Forgotten  → play_count = 0 (belum pernah diputar)
 *   - 🌙 Late Night  → BPM 70–100, rating >= 2
 *   - ⚡ Workout    → BPM > 140
 *   - 🎸 Discovery  → rating = 0 (belum dirating)
 *   - 📅 Recent     → date_added dalam 30 hari terakhir
 *
 * ALGORITMA SCORING per mood menggunakan weighted scoring,
 * sehingga hasilnya lebih nuanced daripada filter boolean biasa.
 */

import { useState, useMemo, useCallback } from "react";
import { useLibraryStore, usePlayerStore } from "../../store";
import type { Song } from "../../lib/db";
import CoverArt from "../CoverArt";

interface Mood {
  id: string;
  name: string;
  icon: string;
  desc: string;
  color: string;
  score: (song: Song) => number; // higher = more suitable
  minScore: number;
  maxTracks?: number;
}

const MOODS: Mood[] = [
  {
    id: "energy",
    name: "High Energy",
    icon: "🔥",
    desc: "Lagu cepat & berenergi tinggi",
    color: "#EF4444",
    score: (s) => {
      const bpm = s.bpm ?? 0;
      const rating = s.stars ?? 3;
      if (bpm === 0) return -1; // skip jika tidak ada BPM
      return (bpm > 128 ? (bpm - 128) / 20 : -2) + (rating * 0.5);
    },
    minScore: 0.5,
    maxTracks: 30,
  },
  {
    id: "chill",
    name: "Chill Vibes",
    icon: "😌",
    desc: "Santai, tempo lambat",
    color: "#06B6D4",
    score: (s) => {
      const bpm = s.bpm ?? 80;
      const rating = s.stars ?? 3;
      const bpmScore = bpm < 90 ? (90 - bpm) / 30 : bpm < 110 ? 0.3 : -1;
      return bpmScore + (rating * 0.4);
    },
    minScore: 0.5,
    maxTracks: 30,
  },
  {
    id: "top",
    name: "Top Rated",
    icon: "💎",
    desc: "Lagu dengan rating bintang tertinggi",
    color: "#F59E0B",
    score: (s) => (s.stars ?? 0) - 3.5, // hanya yang >= 4 bintang lulus
    minScore: 0.5,
    maxTracks: 50,
  },
  {
    id: "forgotten",
    name: "Forgotten Gems",
    icon: "🗂️",
    desc: "Lagu yang belum pernah diputar",
    color: "#8B5CF6",
    score: (s) => (s.play_count ?? 0) === 0 ? 1 : -1,
    minScore: 0.9,
    maxTracks: 40,
  },
  {
    id: "latenight",
    name: "Late Night",
    icon: "🌙",
    desc: "Tempo medium, cocok untuk malam",
    color: "#6366F1",
    score: (s) => {
      const bpm = s.bpm ?? 85;
      const inRange = bpm >= 65 && bpm <= 105;
      const rating = s.stars ?? 2;
      return (inRange ? 1.5 : -1) + (rating * 0.3);
    },
    minScore: 1.0,
    maxTracks: 25,
  },
  {
    id: "workout",
    name: "Workout",
    icon: "⚡",
    desc: "BPM tinggi untuk olahraga",
    color: "#10B981",
    score: (s) => {
      const bpm = s.bpm ?? 0;
      if (bpm === 0) return -1;
      return bpm > 140 ? (bpm - 140) / 10 + 1 : -1;
    },
    minScore: 1.0,
    maxTracks: 30,
  },
  {
    id: "discovery",
    name: "Discover",
    icon: "🎸",
    desc: "Lagu yang belum pernah kamu rating",
    color: "#EC4899",
    score: (s) => (!s.stars || s.stars === 0) ? 1 : -1,
    minScore: 0.9,
    maxTracks: 20,
  },
  {
    id: "recent",
    name: "Recently Added",
    icon: "📅",
    desc: "Ditambahkan dalam 30 hari terakhir",
    color: "#3B82F6",
    score: (s) => {
      if (!s.date_added) return -1;
      const daysAgo = (Date.now() - new Date(s.date_added).getTime()) / 86400000;
      return daysAgo <= 30 ? (30 - daysAgo) / 30 : -1;
    },
    minScore: 0.1,
    maxTracks: 50,
  },
];

interface Props {
  onPlay: (songs: Song[], startIndex?: number) => void;
}

export default function SmartPlaylistView({ onPlay }: Props) {
  const { songs } = useLibraryStore();
  const [selected, setSelected] = useState<Mood | null>(null);
  const [preview, setPreview] = useState<Song[]>([]);

  // Generate playlist untuk mood tertentu
  const generate = useCallback((mood: Mood) => {
    const scored = songs
      .map(s => ({ song: s, score: mood.score(s) }))
      .filter(x => x.score >= mood.minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, mood.maxTracks ?? 50)
      .map(x => x.song);

    setSelected(mood);
    setPreview(scored);
  }, [songs]);

  // Stats per mood (count lagu yang masuk)
  const moodStats = useMemo(() => {
    return MOODS.map(mood => ({
      mood,
      count: songs.filter(s => mood.score(s) >= mood.minScore).length,
    }));
  }, [songs]);

  const fmt = (s: number) => `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
  const totalDur = preview.reduce((a, s) => a + (s.duration || 0), 0);
  const totalMin = Math.round(totalDur / 60);

  return (
    <div style={{ display: "flex", gap: 20, height: "100%" }}>
      {/* Left: Mood cards */}
      <div style={{ width: 260, flexShrink: 0 }}>
        <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 4, letterSpacing: "-0.3px" }}>
          Smart Playlists
        </h3>
        <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 16 }}>
          Auto-generated berdasarkan BPM, rating & kebiasaan
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {moodStats.map(({ mood, count }) => (
            <MoodCard
              key={mood.id}
              mood={mood}
              count={count}
              isActive={selected?.id === mood.id}
              onClick={() => generate(mood)}
            />
          ))}
        </div>
      </div>

      {/* Divider */}
      <div style={{ width: 1, background: "#1a1a2e", flexShrink: 0 }} />

      {/* Right: Playlist preview */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {!selected ? (
          <EmptyState />
        ) : (
          <>
            {/* Header */}
            <div style={{
              display: "flex", alignItems: "center", gap: 16,
              marginBottom: 20, padding: "16px",
              background: `linear-gradient(135deg, ${selected.color}18, transparent)`,
              border: `1px solid ${selected.color}30`,
              borderRadius: 12,
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: 14,
                background: `linear-gradient(135deg, ${selected.color}, ${selected.color}88)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 24, flexShrink: 0,
                boxShadow: `0 4px 16px ${selected.color}40`,
              }}>{selected.icon}</div>

              <div style={{ flex: 1 }}>
                <h2 style={{ fontWeight: 700, fontSize: 18, letterSpacing: "-0.4px" }}>
                  {selected.name}
                </h2>
                <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>{selected.desc}</p>
                <p style={{ fontSize: 11, color: "#6b7280", marginTop: 3 }}>
                  {preview.length} tracks · {totalMin} min
                </p>
              </div>

              <button
                onClick={() => onPlay(preview, 0)}
                disabled={preview.length === 0}
                style={{
                  padding: "10px 20px", borderRadius: 10,
                  background: `linear-gradient(135deg, ${selected.color}, ${selected.color}cc)`,
                  border: "none", color: "white", cursor: "pointer",
                  fontFamily: "inherit", fontWeight: 600, fontSize: 13,
                  boxShadow: `0 4px 16px ${selected.color}40`,
                  flexShrink: 0,
                }}
              >
                ▶ Play All
              </button>
            </div>

            {preview.length === 0 ? (
              <p style={{ fontSize: 13, color: "#4b5563", textAlign: "center", padding: 40 }}>
                Tidak ada lagu yang cocok untuk mood ini.<br />
                <span style={{ fontSize: 11 }}>Coba rating lebih banyak lagu atau tambah BPM info.</span>
              </p>
            ) : (
              <div>
                {preview.map((song, i) => (
                  <div
                    key={song.id}
                    onClick={() => onPlay(preview, i)}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "8px 10px", borderRadius: 8, marginBottom: 2,
                      cursor: "pointer", transition: "background 0.1s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <span style={{ width: 20, textAlign: "center", fontSize: 11, color: "#4b5563", fontFamily: "monospace" }}>
                      {i + 1}
                    </span>
                    <CoverArt id={song.id} coverArt={song.cover_art} size={38} />
                    <div style={{ flex: 1, overflow: "hidden" }}>
                      <div style={{ fontWeight: 500, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {song.title}
                      </div>
                      <div style={{ fontSize: 11, color: "#6b7280" }}>{song.artist}</div>
                    </div>
                    {song.bpm && (
                      <span style={{
                        fontSize: 10, fontFamily: "Space Mono, monospace",
                        color: "#6b7280", padding: "2px 6px",
                        background: "#1a1a2e", borderRadius: 4,
                      }}>{Math.round(song.bpm)} BPM</span>
                    )}
                    {song.stars ? (
                      <span style={{ fontSize: 11, color: "#F59E0B" }}>{"★".repeat(song.stars)}</span>
                    ) : null}
                    <span style={{ fontSize: 11, color: "#6b7280", fontFamily: "monospace", width: 36, textAlign: "right" }}>
                      {fmt(Math.floor(song.duration))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MoodCard({ mood, count, isActive, onClick }: {
  mood: Mood; count: number; isActive: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "10px 12px", borderRadius: 10,
      border: `1px solid ${isActive ? mood.color + "60" : "#1a1a2e"}`,
      background: isActive ? `${mood.color}15` : "transparent",
      cursor: "pointer", textAlign: "left", width: "100%",
      transition: "all 0.15s", fontFamily: "inherit",
    }}
      onMouseEnter={e => !isActive && ((e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)")}
      onMouseLeave={e => !isActive && ((e.currentTarget as HTMLElement).style.background = "transparent")}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 9, flexShrink: 0,
        background: `linear-gradient(135deg, ${mood.color}, ${mood.color}88)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 16,
      }}>{mood.icon}</div>
      <div style={{ flex: 1, overflow: "hidden" }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: isActive ? "#f1f5f9" : "#e2e8f0" }}>
          {mood.name}
        </div>
        <div style={{ fontSize: 10, color: "#6b7280", marginTop: 1 }}>
          {count > 0 ? `${count} tracks` : "Tidak ada lagu"}
        </div>
      </div>
      {count > 0 && (
        <div style={{
          width: 20, height: 20, borderRadius: "50%",
          background: isActive ? mood.color : "#2a2a3e",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 9, color: "white", flexShrink: 0,
          fontWeight: 700,
        }}>
          {count > 99 ? "99+" : count}
        </div>
      )}
    </button>
  );
}

function EmptyState() {
  return (
    <div style={{
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      height: "100%", color: "#4b5563", textAlign: "center", gap: 8,
    }}>
      <div style={{ fontSize: 40 }}>✨</div>
      <p style={{ fontSize: 14, color: "#6b7280" }}>Pilih mood di sebelah kiri</p>
      <p style={{ fontSize: 12 }}>Resonance akan otomatis kurasi lagu yang cocok</p>
    </div>
  );
}