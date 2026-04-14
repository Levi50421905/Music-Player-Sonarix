/**
 * SmartPlaylistView.tsx — v2 (Design Refresh)
 *
 * PERUBAHAN vs v1:
 *   [DESIGN] Semua warna pakai CSS variable
 *   [DESIGN] Mood card lebih clean — tanpa emoji besar, accent color konsisten
 *   [DESIGN] Track list lebih readable
 *   [DESIGN] Empty state lebih polish
 *   [DESIGN] Header playlist lebih rapi
 */

import { useState, useMemo, useCallback } from "react";
import { useLibraryStore } from "../../store";
import type { Song } from "../../lib/db";
import CoverArt from "../CoverArt";

interface Mood {
  id: string;
  name: string;
  desc: string;
  color: string;
  score: (song: Song) => number;
  minScore: number;
  maxTracks?: number;
}

const MOODS: Mood[] = [
  {
    id: "energy", name: "High Energy", color: "#EF4444",
    desc: "Fast tracks, high BPM",
    score: (s) => {
      const bpm = s.bpm ?? 0; const r = s.stars ?? 3;
      if (bpm === 0) return -1;
      return (bpm > 128 ? (bpm - 128) / 20 : -2) + (r * 0.5);
    },
    minScore: 0.5, maxTracks: 30,
  },
  {
    id: "chill", name: "Chill", color: "#06B6D4",
    desc: "Slow tempo, relaxed",
    score: (s) => {
      const bpm = s.bpm ?? 80; const r = s.stars ?? 3;
      const bpmScore = bpm < 90 ? (90 - bpm) / 30 : bpm < 110 ? 0.3 : -1;
      return bpmScore + (r * 0.4);
    },
    minScore: 0.5, maxTracks: 30,
  },
  {
    id: "top", name: "Top Rated", color: "#F59E0B",
    desc: "4 stars and above",
    score: (s) => (s.stars ?? 0) - 3.5,
    minScore: 0.5, maxTracks: 50,
  },
  {
    id: "forgotten", name: "Forgotten", color: "#8B5CF6",
    desc: "Never played before",
    score: (s) => (s.play_count ?? 0) === 0 ? 1 : -1,
    minScore: 0.9, maxTracks: 40,
  },
  {
    id: "latenight", name: "Late Night", color: "#6366F1",
    desc: "Medium tempo, mellow",
    score: (s) => {
      const bpm = s.bpm ?? 85; const r = s.stars ?? 2;
      return ((bpm >= 65 && bpm <= 105) ? 1.5 : -1) + (r * 0.3);
    },
    minScore: 1.0, maxTracks: 25,
  },
  {
    id: "workout", name: "Workout", color: "#10B981",
    desc: "High BPM, energetic",
    score: (s) => {
      const bpm = s.bpm ?? 0;
      if (bpm === 0) return -1;
      return bpm > 140 ? (bpm - 140) / 10 + 1 : -1;
    },
    minScore: 1.0, maxTracks: 30,
  },
  {
    id: "discovery", name: "Discover", color: "#EC4899",
    desc: "Unrated tracks",
    score: (s) => (!s.stars || s.stars === 0) ? 1 : -1,
    minScore: 0.9, maxTracks: 20,
  },
  {
    id: "recent", name: "Recent", color: "#3B82F6",
    desc: "Added in last 30 days",
    score: (s) => {
      if (!s.date_added) return -1;
      const daysAgo = (Date.now() - new Date(s.date_added).getTime()) / 86400000;
      return daysAgo <= 30 ? (30 - daysAgo) / 30 : -1;
    },
    minScore: 0.1, maxTracks: 50,
  },
];

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60 | 0).padStart(2, "0")}`;

interface Props {
  onPlay: (songs: Song[], startIndex?: number) => void;
}

export default function SmartPlaylistView({ onPlay }: Props) {
  const { songs } = useLibraryStore();
  const [selected, setSelected] = useState<Mood | null>(null);
  const [preview, setPreview]   = useState<Song[]>([]);

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

  const moodStats = useMemo(() =>
    MOODS.map(mood => ({
      mood,
      count: songs.filter(s => mood.score(s) >= mood.minScore).length,
    })),
    [songs]
  );

  const totalMin = Math.round(preview.reduce((a, s) => a + (s.duration || 0), 0) / 60);

  return (
    <div style={{ display: "flex", gap: 18, height: "100%" }}>

      {/* ── Left: Mood list ── */}
      <div style={{ width: 240, flexShrink: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ marginBottom: 14 }}>
          <h3 style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)", letterSpacing: "-0.3px" }}>
            Smart playlists
          </h3>
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
            Auto-generated from BPM, rating &amp; habits
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4, overflowY: "auto" }}>
          {moodStats.map(({ mood, count }) => (
            <MoodCard
              key={mood.id} mood={mood} count={count}
              isActive={selected?.id === mood.id}
              onClick={() => generate(mood)}
            />
          ))}
        </div>
      </div>

      {/* Divider */}
      <div style={{ width: 1, background: "var(--border-subtle)", flexShrink: 0 }} />

      {/* ── Right: Track list ── */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {!selected ? (
          <div style={{
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            height: "100%", gap: 10, textAlign: "center",
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: 16,
              background: "var(--accent-dim, rgba(124,58,237,0.15))",
              border: "1px solid var(--accent-border, rgba(124,58,237,0.25))",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 24,
            }}>
              ✦
            </div>
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Select a mood on the left</p>
            <p style={{ fontSize: 12, color: "var(--text-faint)" }}>
              Resonance will curate tracks automatically
            </p>
          </div>
        ) : (
          <>
            {/* Playlist header */}
            <div style={{
              display: "flex", alignItems: "center", gap: 14,
              marginBottom: 18, padding: "14px 16px",
              background: `${selected.color}0f`,
              border: `1px solid ${selected.color}28`,
              borderRadius: "var(--radius-lg, 12px)",
            }}>
              {/* Color dot accent */}
              <div style={{
                width: 48, height: 48, borderRadius: "var(--radius-md, 8px)", flexShrink: 0,
                background: `linear-gradient(135deg, ${selected.color}, ${selected.color}aa)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: `0 4px 14px ${selected.color}40`,
              }}>
                <MoodSymbol id={selected.id} />
              </div>

              <div style={{ flex: 1 }}>
                <h2 style={{ fontWeight: 700, fontSize: 16, color: "var(--text-primary)", letterSpacing: "-0.3px" }}>
                  {selected.name}
                </h2>
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{selected.desc}</p>
                <p style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 3 }}>
                  {preview.length} tracks · {totalMin} min
                </p>
              </div>

              <button
                onClick={() => onPlay(preview, 0)}
                disabled={preview.length === 0}
                style={{
                  padding: "9px 18px", borderRadius: "var(--radius-md, 8px)",
                  background: selected.color, border: "none",
                  color: "white", cursor: preview.length > 0 ? "pointer" : "not-allowed",
                  fontFamily: "inherit", fontWeight: 600, fontSize: 13,
                  boxShadow: `0 4px 14px ${selected.color}40`,
                  flexShrink: 0, opacity: preview.length === 0 ? 0.5 : 1,
                }}
              >
                Play all
              </button>
            </div>

            {preview.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 20px" }}>
                <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 6 }}>
                  No tracks match this mood
                </p>
                <p style={{ fontSize: 12, color: "var(--text-faint)" }}>
                  Try rating more tracks or add BPM info
                </p>
              </div>
            ) : (
              <div>
                {preview.map((song, i) => (
                  <div
                    key={song.id}
                    onClick={() => onPlay(preview, i)}
                    style={{
                      display: "flex", alignItems: "center", gap: 11,
                      padding: "7px 10px", borderRadius: "var(--radius-md, 8px)",
                      marginBottom: 2, cursor: "pointer",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <span style={{
                      width: 22, textAlign: "center", fontSize: 11,
                      color: "var(--text-faint)", fontFamily: "monospace", flexShrink: 0,
                    }}>
                      {i + 1}
                    </span>
                    <CoverArt id={song.id} coverArt={song.cover_art} size={36} />
                    <div style={{ flex: 1, overflow: "hidden" }}>
                      <div style={{
                        fontWeight: 500, fontSize: 13,
                        color: "var(--text-primary)",
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {song.title}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{song.artist}</div>
                    </div>
                    {song.bpm && (
                      <span style={{
                        fontSize: 10, fontFamily: "monospace",
                        color: "var(--text-muted)",
                        background: "var(--bg-muted)",
                        padding: "2px 6px", borderRadius: 4,
                        border: "1px solid var(--border)",
                        flexShrink: 0,
                      }}>
                        {Math.round(song.bpm)} BPM
                      </span>
                    )}
                    {(song.stars ?? 0) > 0 && (
                      <span style={{ fontSize: 10, color: "#F59E0B", flexShrink: 0 }}>
                        {"★".repeat(song.stars ?? 0)}
                      </span>
                    )}
                    <span style={{
                      fontSize: 11, color: "var(--text-muted)",
                      fontFamily: "monospace", width: 36, textAlign: "right", flexShrink: 0,
                    }}>
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

// ── Mood symbol (SVG, no emoji) ────────────────────────────────────────────────
function MoodSymbol({ id }: { id: string }) {
  const symbols: Record<string, React.ReactNode> = {
    energy: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
    chill:  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M17 18a5 5 0 0 0-10 0"/><line x1="12" y1="2" x2="12" y2="9"/><line x1="4.22" y1="10.22" x2="5.64" y2="11.64"/><line x1="1" y1="18" x2="3" y2="18"/><line x1="21" y1="18" x2="23" y2="18"/><line x1="18.36" y1="11.64" x2="19.78" y2="10.22"/><line x1="23" y1="22" x2="1" y2="22"/><polyline points="8 6 12 2 16 6"/></svg>,
    top:    <svg width="20" height="20" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
    forgotten: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
    latenight: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>,
    workout:   <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
    discovery: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
    recent:    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  };
  return <>{symbols[id] ?? <span style={{ color: "white", fontSize: 18 }}>♪</span>}</>;
}

// ── Mood card ──────────────────────────────────────────────────────────────────
function MoodCard({ mood, count, isActive, onClick }: {
  mood: Mood; count: number; isActive: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 11,
        padding: "9px 11px", borderRadius: "var(--radius-md, 8px)",
        border: `1px solid ${isActive ? mood.color + "45" : "var(--border)"}`,
        background: isActive ? `${mood.color}10` : "transparent",
        cursor: "pointer", textAlign: "left", width: "100%",
        fontFamily: "inherit",
        transition: "all 0.15s",
      }}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
    >
      {/* Color indicator bar */}
      <div style={{
        width: 3, height: 28, borderRadius: 2, flexShrink: 0,
        background: count > 0 ? mood.color : "var(--border-medium)",
      }} />

      <div style={{ flex: 1, overflow: "hidden" }}>
        <div style={{
          fontWeight: 600, fontSize: 13,
          color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
          letterSpacing: "-0.1px",
        }}>
          {mood.name}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 1 }}>
          {count > 0 ? `${count} tracks` : "No tracks"}
        </div>
      </div>

      {count > 0 && (
        <div style={{
          width: 22, height: 22, borderRadius: "50%",
          background: isActive ? mood.color : "var(--bg-muted)",
          border: isActive ? "none" : "1px solid var(--border-medium)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontWeight: 700,
          color: isActive ? "white" : "var(--text-muted)",
          flexShrink: 0,
        }}>
          {count > 99 ? "99+" : count}
        </div>
      )}
    </button>
  );
}