/**
 * Dashboard.tsx — v6 (Context Menu on Song Rows)
 *
 * PERUBAHAN vs v5:
 *   [NEW] Klik kanan di lagu (Recently Played, Most Played, Top Rated) → context menu
 */

import { useMemo, useState, useCallback, useEffect } from "react";
import React from "react";
import { useLibraryStore, usePlayerStore } from "../../store";
import { getDb, getPlaylists, addToPlaylist } from "../../lib/db";
import type { Song } from "../../lib/db";
import CoverArt from "../CoverArt";
import { useLang } from "../../lib/i18n";
import SongContextMenu, { ConfirmDeleteModal } from "../SongContextMenu";
import { deleteSongs } from "../../lib/db";
import { toastInfo, toastSuccess } from "../Notification/ToastSystem";

interface Props {
  onPlay:        (songs: Song[], index?: number) => void;
  onRating:      (songId: number, stars: number) => void;
  onScanFolder?: () => void;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <div style={{ width: 3, height: 14, borderRadius: 2, background: "var(--accent)", flexShrink: 0 }} />
      <h3 style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)", letterSpacing: "-0.2px" }}>
        {title}
      </h3>
      {count !== undefined && (
        <span style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "'Space Mono', monospace" }}>
          {count}
        </span>
      )}
    </div>
  );
}

export default function Dashboard({ onPlay, onRating, onScanFolder }: Props) {
  const { songs, setSongs } = useLibraryStore() as any;
  const { t } = useLang();
  const { currentSong, history } = usePlayerStore();

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; song: Song; list: Song[] } | null>(null);
  const [confirmDel, setConfirmDel]   = useState<Song[] | null>(null);
  const [playlists, setPlaylists]     = useState<any[]>([]);

  useEffect(() => {
    getDb().then(db => getPlaylists(db)).then(setPlaylists).catch(() => {});
  }, []);

  const stats = useMemo(() => {
    const totalDuration = songs.reduce((a: number, s: Song) => a + (s.duration || 0), 0);
    const lossless = songs.filter((s: Song) => ["FLAC", "WAV", "ALAC", "APE"].includes((s.format || "").toUpperCase())).length;
    const rated = songs.filter((s: Song) => s.stars && s.stars > 0);
    const avgRating = rated.length > 0
      ? (rated.reduce((a: number, s: Song) => a + (s.stars || 0), 0) / rated.length).toFixed(1)
      : "—";
    return {
      tracks: songs.length,
      hours: Math.round(totalDuration / 3600),
      losslessPct: songs.length > 0 ? Math.round((lossless / songs.length) * 100) : 0,
      avgRating,
      totalPlays: history.length,
    };
  }, [songs, history]);

  const recentlyPlayed = useMemo(() => {
    const seen = new Set<number>();
    const result: Song[] = [];
    for (const record of history) {
      if (!seen.has(record.song_id)) {
        seen.add(record.song_id);
        const song = songs.find((s: Song) => s.id === record.song_id);
        if (song) result.push(song);
      }
      if (result.length >= 15) break;
    }
    return result;
  }, [history, songs]);

  const topByPlays = useMemo(() =>
    [...songs].sort((a: Song, b: Song) => (b.play_count || 0) - (a.play_count || 0)).slice(0, 8),
    [songs]
  );

  const topByRating = useMemo(() =>
    songs.filter((s: Song) => s.stars && s.stars >= 4)
      .sort((a: Song, b: Song) => (b.stars || 0) - (a.stars || 0))
      .slice(0, 8),
    [songs]
  );

  const dayLabels = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

  // ── Per day-of-week breakdown (0=Sun..6=Sat), dengan raw count ──
  const dowData = useMemo(() => {
    const counts = new Array(7).fill(0);
    for (const record of history) {
      counts[new Date(record.played_at).getDay()]++;
    }
    const max = Math.max(...counts, 1);
    return counts.map((v, i) => ({ count: v, intensity: v / max, label: dayLabels[i] }));
  }, [history]);

  // ── 7 hari terakhir (termasuk hari ini) ──
  const last7Days = useMemo(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const result: { date: Date; label: string; count: number; songIds: Set<number> }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dayStart = new Date(d); dayStart.setHours(0, 0, 0, 0);
      const dayEnd   = new Date(d); dayEnd.setHours(23, 59, 59, 999);
      const dayTs0 = dayStart.getTime();
      const dayTs1 = dayEnd.getTime();
      const plays = history.filter(h => {
        const t = new Date(h.played_at).getTime();
        return t >= dayTs0 && t <= dayTs1;
      });
      const ids = new Set(plays.map(h => h.song_id));
      // Label: "Hari ini", "Kemarin", atau "Sen 7" dll
      let label: string;
      if (i === 0) label = "Hari ini";
      else if (i === 1) label = "Kemarin";
      else label = `${dayLabels[d.getDay()]} ${d.getDate()}`;
      result.push({ date: d, label, count: plays.length, songIds: ids });
    }
    return result;
  }, [history]);

  // ── Per jam dalam sehari (0-23) ──
  const hourlyData = useMemo(() => {
    const hours = new Array(24).fill(0);
    for (const record of history) {
      hours[new Date(record.played_at).getHours()]++;
    }
    const max = Math.max(...hours, 1);
    return hours.map((v, h) => ({ hour: h, count: v, intensity: v / max }));
  }, [history]);

  // ── Activity stats lengkap ──
  const activityStats = useMemo(() => {
    if (history.length === 0) return null;

    // Total durasi didengarkan (estimasi dari play history × avg duration)
    const avgDuration = songs.length > 0
      ? songs.reduce((a: number, s: Song) => a + (s.duration || 0), 0) / songs.length
      : 0;
    const estimatedMinutes = Math.round((history.length * avgDuration) / 60);

    // Hari paling aktif (of all time)
    const dowCounts = new Array(7).fill(0);
    for (const r of history) dowCounts[new Date(r.played_at).getDay()]++;
    const busiestDowIdx = dowCounts.indexOf(Math.max(...dowCounts));

    // Jam paling aktif
    const hourCounts = new Array(24).fill(0);
    for (const r of history) hourCounts[new Date(r.played_at).getHours()]++;
    const peakHour = hourCounts.indexOf(Math.max(...hourCounts));
    const peakHourLabel = peakHour < 12
      ? `${peakHour === 0 ? 12 : peakHour} AM`
      : `${peakHour === 12 ? 12 : peakHour - 12} PM`;

    // 7 hari terakhir total
    const today = new Date(); today.setHours(23, 59, 59, 999);
    const sevenDaysAgo = new Date(today); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6); sevenDaysAgo.setHours(0,0,0,0);
    const last7Count = history.filter(h => new Date(h.played_at).getTime() >= sevenDaysAgo.getTime()).length;
    const avgPerDay7 = (last7Count / 7).toFixed(1);

    return {
      totalPlays: history.length,
      uniqueSongs: new Set(history.map(h => h.song_id)).size,
      estimatedMinutes,
      estimatedHours: (estimatedMinutes / 60).toFixed(1),
      busiestDay: dayLabels[busiestDowIdx],
      peakHourLabel,
      last7Count,
      avgPerDay7,
    };
  }, [history, songs]);

  const handleCtxMenu = useCallback(async (e: React.MouseEvent, song: Song, list: Song[]) => {
    e.preventDefault();
    try { const db = await getDb(); setPlaylists(await getPlaylists(db)); } catch {}
    const x = Math.min(e.clientX, window.innerWidth - 240);
    const y = Math.min(e.clientY, window.innerHeight - 380);
    setContextMenu({ x, y, song, list });
  }, []);

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
    const db = await getDb();
    await deleteSongs(db, ss.map(s => s.id));
    setSongs((prev: Song[]) => Array.isArray(prev) ? prev.filter(s => !ss.find(d => d.id === s.id)) : prev);
    setConfirmDel(null);
    setContextMenu(null);
    toastSuccess(`${ss.length} lagu dihapus dari library`);
  }, [setSongs]);

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (songs.length === 0) {
    return (
      <div style={{
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        height: "100%", gap: 20, textAlign: "center", padding: "40px 20px",
      }}>
        <div style={{
          width: 80, height: 80, borderRadius: "var(--radius-xl)",
          background: "linear-gradient(135deg, var(--accent-dim), rgba(236,72,153,0.1))",
          border: "1px solid var(--accent-border)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 36,
          animation: "float 3s ease-in-out infinite",
        }}>♪</div>
        <div>
          <h2 style={{ fontWeight: 700, fontSize: 19, color: "var(--text-primary)", letterSpacing: "-0.4px", marginBottom: 8 }}>
            {t.libraryEmpty}
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.7, maxWidth: 340, marginBottom: 24 }}>
            {t.libraryEmptyDesc}
          </p>
          {onScanFolder && (
            <button onClick={onScanFolder} style={{
              padding: "10px 22px", borderRadius: "var(--radius-lg)",
              fontSize: 13, fontWeight: 600,
              background: "linear-gradient(135deg, var(--accent), var(--accent-pink))",
              border: "none", color: "white", cursor: "pointer",
              fontFamily: "inherit",
              boxShadow: "0 4px 18px rgba(124,58,237,0.35)",
            }}>
              Scan folder musik
            </button>
          )}
        </div>
        <style>{`@keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }`}</style>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

      {/* Context menu */}
      {contextMenu && (
        <SongContextMenu
          x={contextMenu.x} y={contextMenu.y}
          songs={[contextMenu.song]}
          playlists={playlists}
          onClose={() => setContextMenu(null)}
          onPlayNow={ss => { onPlay(contextMenu.list, contextMenu.list.findIndex(s => s.id === ss[0].id)); }}
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

      {/* ── Stat cards ── */}
      <div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
          {[
            { value: stats.tracks.toLocaleString(), label: "Lagu",     sub: "di library" },
            { value: `${stats.hours}j`,             label: "Durasi",   sub: "total waktu putar" },
            { value: `${stats.losslessPct}%`,        label: "Lossless", sub: "dari library" },
          ].map(stat => (
            <StatCard key={stat.label} {...stat} />
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[
            { value: stats.avgRating,                   label: "Rating rata-rata", sub: "dari lagu yang dirating" },
            { value: stats.totalPlays.toLocaleString(), label: "Total diputar",    sub: "sepanjang waktu" },
          ].map(stat => (
            <StatCard key={stat.label} {...stat} />
          ))}
        </div>
      </div>

      {/* ── Recently Played ── */}
      {recentlyPlayed.length > 0 && (
        <div>
          <SectionHeader title="Baru diputar" count={recentlyPlayed.length} />
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 6, scrollbarWidth: "none" }}>
              {recentlyPlayed.map((song, i) => (
                <div
                  key={song.id}
                  onClick={() => onPlay(recentlyPlayed, i)}
                  onContextMenu={e => handleCtxMenu(e, song, recentlyPlayed)}
                  style={{
                    flexShrink: 0, width: 130, cursor: "pointer",
                    borderRadius: "var(--radius-lg)", overflow: "hidden",
                    border: currentSong?.id === song.id ? "1px solid var(--accent-border)" : "1px solid var(--border)",
                    background: currentSong?.id === song.id ? "var(--accent-dim)" : "var(--bg-overlay)",
                    transition: "transform 0.18s, border-color 0.15s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-2px)")}
                  onMouseLeave={e => (e.currentTarget.style.transform = "translateY(0)")}
                >
                  <CoverArt id={song.id} coverArt={song.cover_art} size={130}
                    style={{ width: "100%", height: 130, borderRadius: 0 }} />
                  <div style={{ padding: "7px 9px 8px" }}>
                    <div style={{
                      fontWeight: 600, fontSize: 11,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      color: currentSong?.id === song.id ? "var(--accent-light)" : "var(--text-primary)",
                      lineHeight: 1.3,
                    }}>
                      {song.title}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {song.artist}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{
              position: "absolute", top: 0, right: 0, bottom: 6, width: 40,
              background: "linear-gradient(to left, var(--bg-base) 0%, transparent 100%)",
              pointerEvents: "none",
            }} />
          </div>
        </div>
      )}

      {/* ── Top tracks grid ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Most played */}
        <div>
          <SectionHeader title="Paling sering diputar" />
          <div style={{
            background: "var(--bg-overlay)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)", overflow: "hidden",
          }}>
            {topByPlays.filter(s => (s.play_count ?? 0) > 0).slice(0, 6).length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--text-faint)", padding: "16px", textAlign: "center" }}>
                {t.playTracksToSee}
              </p>
            ) : (
              topByPlays.filter(s => (s.play_count ?? 0) > 0).slice(0, 6).map((song, i, arr) => (
                <TrackRow
                  key={song.id} song={song} rank={i + 1}
                  onPlay={() => onPlay(topByPlays, i)}
                  onContextMenu={e => handleCtxMenu(e, song, topByPlays)}
                  onRating={onRating}
                  isLast={i === arr.length - 1}
                  suffix={
                    <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'Space Mono', monospace" }}>
                      {song.play_count}×
                    </span>
                  }
                />
              ))
            )}
          </div>
        </div>

        {/* Top rated */}
        <div>
          <SectionHeader title="Rating tertinggi" />
          <div style={{
            background: "var(--bg-overlay)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)", overflow: "hidden",
          }}>
            {topByRating.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--text-faint)", padding: "16px", textAlign: "center" }}>
                {t.rateTracksToSee}
              </p>
            ) : (
              topByRating.slice(0, 6).map((song, i, arr) => (
                <TrackRow
                  key={song.id} song={song} rank={i + 1}
                  onPlay={() => onPlay(topByRating, i)}
                  onContextMenu={e => handleCtxMenu(e, song, topByRating)}
                  onRating={onRating}
                  isLast={i === arr.length - 1}
                  suffix={
                    <div style={{ display: "flex", gap: 1 }}>
                      {[1, 2, 3, 4, 5].map(n => (
                        <span key={n} style={{ fontSize: 10, color: n <= (song.stars ?? 0) ? "var(--warning)" : "var(--border-medium)" }}>
                          {n <= (song.stars ?? 0) ? "★" : "☆"}
                        </span>
                      ))}
                    </div>
                  }
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Activity section ── */}
      {history.length > 0 && activityStats && (
        <ActivitySection
          last7Days={last7Days}
          dowData={dowData}
          hourlyData={hourlyData}
          stats={activityStats}
        />
      )}
    </div>
  );
}

// ── Activity Section ──────────────────────────────────────────────────────────

interface DowEntry    { count: number; intensity: number; label: string }
interface Day7Entry   { date: Date; label: string; count: number; songIds: Set<number> }
interface HourEntry   { hour: number; count: number; intensity: number }
interface ActivityStatsData {
  totalPlays: number;
  uniqueSongs: number;
  estimatedMinutes: number;
  estimatedHours: string;
  busiestDay: string;
  peakHourLabel: string;
  last7Count: number;
  avgPerDay7: string;
}

function ActivitySection({ last7Days, dowData, hourlyData, stats }: {
  last7Days:   Day7Entry[];
  dowData:     DowEntry[];
  hourlyData:  HourEntry[];
  stats:       ActivityStatsData;
}) {
  type ChartMode = "7days" | "dow" | "hourly";
  const [mode, setMode] = useState<ChartMode>("7days");
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const max7 = Math.max(...last7Days.map(d => d.count), 1);

  const statItems = [
    { label: "Total diputar",  value: stats.totalPlays.toLocaleString(),    sub: "sepanjang waktu" },
    { label: "Lagu unik",      value: stats.uniqueSongs.toLocaleString(),   sub: "pernah diputar" },
    { label: "Est. didengar",  value: stats.estimatedMinutes >= 60 ? `${stats.estimatedHours}j` : `${stats.estimatedMinutes}m`, sub: "total waktu" },
    { label: "Rata-rata",      value: stats.avgPerDay7,                     sub: "putar/hari (7hr)" },
    { label: "Hari teraktif",  value: stats.busiestDay,                     sub: "sepanjang waktu" },
    { label: "Jam puncak",     value: stats.peakHourLabel,                  sub: "paling sering putar" },
  ];

  return (
    <div>
      <SectionHeader title="Aktivitas mendengarkan" />

      {/* ── Stats grid ── */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8, marginBottom: 12,
      }}>
        {statItems.map(item => (
          <div key={item.label} style={{
            background: "var(--bg-overlay)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)", padding: "10px 11px",
          }}>
            <div style={{
              fontWeight: 700, fontSize: 17, color: "var(--accent-light)",
              fontFamily: "'Space Mono', monospace", lineHeight: 1,
            }}>
              {item.value}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 5, fontWeight: 600 }}>
              {item.label}
            </div>
            <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 2 }}>
              {item.sub}
            </div>
          </div>
        ))}
      </div>

      {/* ── Chart card ── */}
      <div style={{
        background: "var(--bg-overlay)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)", padding: "14px 18px",
      }}>
        {/* Mode toggle */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <p style={{
            fontSize: 11, fontWeight: 700, color: "var(--text-faint)",
            textTransform: "uppercase", letterSpacing: "0.08em",
          }}>
            {mode === "7days"  ? "7 Hari Terakhir"       :
             mode === "dow"    ? "Per Hari dalam Seminggu" :
                                 "Per Jam dalam Sehari"}
          </p>
          <div style={{ display: "flex", gap: 4 }}>
            {([["7days","7 Hari"],["dow","Mingguan"],["hourly","Per Jam"]] as [ChartMode,string][]).map(([val, lbl]) => (
              <button key={val} onClick={() => { setMode(val); setHoveredIdx(null); }} style={{
                padding: "3px 9px", borderRadius: "var(--radius-sm)", fontSize: 10,
                border: "1px solid",
                background: mode === val ? "var(--accent-dim)" : "transparent",
                borderColor: mode === val ? "var(--accent-border)" : "var(--border-medium)",
                color: mode === val ? "var(--accent-light)" : "var(--text-faint)",
                cursor: "pointer", fontFamily: "inherit", fontWeight: mode === val ? 700 : 400,
                transition: "all 0.15s",
              }}>{lbl}</button>
            ))}
          </div>
        </div>

        {/* 7-day chart */}
        {mode === "7days" && (
          <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 72, position: "relative" }}>
            {last7Days.map((day, i) => {
              const h = Math.max(4, Math.round((day.count / max7) * 62));
              const isHov = hoveredIdx === i;
              const isToday = i === 6;
              return (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, position: "relative" }}
                  onMouseEnter={() => setHoveredIdx(i)} onMouseLeave={() => setHoveredIdx(null)}>
                  {/* Tooltip */}
                  {isHov && (
                    <div style={{
                      position: "absolute", bottom: "100%", left: "50%", transform: "translateX(-50%)",
                      marginBottom: 6, whiteSpace: "nowrap",
                      background: "var(--bg-surface)", border: "1px solid var(--border-medium)",
                      borderRadius: "var(--radius-sm)", padding: "4px 8px",
                      fontSize: 11, color: "var(--text-primary)", fontWeight: 600,
                      boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                      pointerEvents: "none", zIndex: 10,
                    }}>
                      {day.count} putar · {day.songIds.size} lagu unik
                      <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 400, marginTop: 1 }}>
                        {day.label}
                      </div>
                    </div>
                  )}
                  <div style={{
                    width: "100%", borderRadius: "3px 3px 0 0",
                    height: `${h}px`,
                    background: isToday
                      ? "linear-gradient(to top, var(--accent), var(--accent-light))"
                      : isHov
                        ? "var(--accent)"
                        : day.count > 0 ? "var(--accent-border)" : "var(--bg-muted)",
                    transition: "height 0.3s ease, background 0.15s",
                    cursor: "default",
                    boxShadow: isToday ? "0 0 8px rgba(124,58,237,0.4)" : "none",
                  }} />
                  <span style={{
                    fontSize: 10, color: isToday ? "var(--accent-light)" : "var(--text-faint)",
                    fontWeight: isToday ? 700 : 400, whiteSpace: "nowrap", maxWidth: "100%",
                    overflow: "hidden", textOverflow: "ellipsis", textAlign: "center",
                  }}>
                    {day.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Day-of-week chart */}
        {mode === "dow" && (
          <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 72 }}>
            {dowData.map((day, i) => {
              const h = Math.max(4, Math.round(day.intensity * 62));
              const isHov = hoveredIdx === i;
              return (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, position: "relative" }}
                  onMouseEnter={() => setHoveredIdx(i)} onMouseLeave={() => setHoveredIdx(null)}>
                  {isHov && (
                    <div style={{
                      position: "absolute", bottom: "100%", left: "50%", transform: "translateX(-50%)",
                      marginBottom: 6, whiteSpace: "nowrap",
                      background: "var(--bg-surface)", border: "1px solid var(--border-medium)",
                      borderRadius: "var(--radius-sm)", padding: "4px 8px",
                      fontSize: 11, color: "var(--text-primary)", fontWeight: 600,
                      boxShadow: "0 4px 12px rgba(0,0,0,0.4)", pointerEvents: "none", zIndex: 10,
                    }}>
                      {day.count} kali · {day.label}
                    </div>
                  )}
                  <div style={{
                    width: "100%", borderRadius: "3px 3px 0 0", height: `${h}px`,
                    background: isHov ? "var(--accent)"
                      : day.intensity > 0.7 ? "var(--accent)"
                      : day.intensity > 0.3 ? "var(--accent-border)"
                      : day.count > 0 ? "rgba(124,58,237,0.2)" : "var(--bg-muted)",
                    transition: "height 0.3s ease, background 0.15s",
                  }} />
                  <span style={{ fontSize: 10, color: "var(--text-faint)", whiteSpace: "nowrap" }}>
                    {day.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Hourly chart */}
        {mode === "hourly" && (
          <div>
            <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 72 }}>
              {hourlyData.map((h, i) => {
                const barH = Math.max(2, Math.round(h.intensity * 62));
                const isHov = hoveredIdx === i;
                return (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}
                    onMouseEnter={() => setHoveredIdx(i)} onMouseLeave={() => setHoveredIdx(null)}>
                    {isHov && (
                      <div style={{
                        position: "absolute", bottom: "calc(100% + 4px)", left: "50%", transform: "translateX(-50%)",
                        whiteSpace: "nowrap",
                        background: "var(--bg-surface)", border: "1px solid var(--border-medium)",
                        borderRadius: "var(--radius-sm)", padding: "4px 8px",
                        fontSize: 11, color: "var(--text-primary)", fontWeight: 600,
                        boxShadow: "0 4px 12px rgba(0,0,0,0.4)", pointerEvents: "none", zIndex: 10,
                      }}>
                        {h.count}× · {h.hour < 12 ? `${h.hour === 0 ? 12 : h.hour}am` : `${h.hour === 12 ? 12 : h.hour - 12}pm`}
                      </div>
                    )}
                    <div style={{
                      width: "100%", borderRadius: "2px 2px 0 0", height: `${barH}px`,
                      background: isHov ? "var(--accent)"
                        : h.intensity > 0.7 ? "var(--accent)"
                        : h.intensity > 0.4 ? "var(--accent-border)"
                        : h.count > 0 ? "rgba(124,58,237,0.2)" : "var(--bg-muted)",
                      transition: "background 0.15s",
                    }} />
                  </div>
                );
              })}
            </div>
            {/* Hour labels: hanya tampil 6am, 12pm, 6pm, 12am */}
            <div style={{ display: "flex", marginTop: 6, position: "relative", height: 14 }}>
              {[0, 6, 12, 18].map(hr => {
                const pct = (hr / 24) * 100;
                const lbl = hr === 0 ? "12am" : hr === 12 ? "12pm" : hr < 12 ? `${hr}am` : `${hr - 12}pm`;
                return (
                  <span key={hr} style={{
                    position: "absolute", left: `${pct}%`, transform: "translateX(-50%)",
                    fontSize: 10, color: "var(--text-faint)", whiteSpace: "nowrap",
                  }}>{lbl}</span>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}



function StatCard({ value, label, sub }: { value: string; label: string; sub: string }) {
  return (
    <div style={{
      background: "var(--bg-overlay)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)", padding: "14px 14px 12px",
      transition: "border-color 0.15s",
    }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = "var(--border-medium)"}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"}
    >
      <div style={{ fontWeight: 700, fontSize: 22, color: "var(--accent-light)", letterSpacing: "-0.5px", lineHeight: 1, fontFamily: "'Space Mono', monospace" }}>
        {value}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginTop: 6 }}>{label}</div>
      <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function TrackRow({ song, rank, onPlay, onContextMenu, onRating, suffix, isLast }: {
  song: Song; rank: number;
  onPlay: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onRating: (id: number, s: number) => void;
  suffix: React.ReactNode;
  isLast?: boolean;
}) {
  return (
    <div
      onClick={onPlay}
      onContextMenu={onContextMenu}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 12px", minHeight: 44,
        borderBottom: isLast ? "none" : "1px solid var(--border-subtle)",
        cursor: "pointer", transition: "background 0.1s",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      <span style={{
        width: 18, fontSize: 11, fontFamily: "monospace", textAlign: "center", flexShrink: 0,
        color: rank <= 3 ? "var(--warning)" : "var(--text-faint)",
        fontWeight: rank <= 3 ? 700 : 400,
      }}>
        {rank}
      </span>
      <CoverArt id={song.id} coverArt={song.cover_art} size={32} />
      <div style={{ flex: 1, overflow: "hidden" }}>
        <div style={{ fontWeight: 500, fontSize: 12, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {song.title}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{song.artist}</div>
      </div>
      <div style={{ flexShrink: 0 }}>{suffix}</div>
    </div>
  );
}