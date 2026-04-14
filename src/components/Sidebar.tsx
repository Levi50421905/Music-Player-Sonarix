/**
 * Sidebar.tsx — v6 (Design Refresh)
 *
 * PERUBAHAN vs v5:
 *   [DESIGN] Warna teks diperbaiki — semua kontras WCAG AA
 *   [DESIGN] Cover art section lebih clean, ambient blur diatur
 *   [DESIGN] Track info lebih readable dengan hierarchy yang jelas
 *   [DESIGN] Detail section pakai grid 2-kolom untuk efisiensi ruang
 *   [DESIGN] Visualizer dengan toggle yang lebih rapi
 *   [DESIGN] "Up Next" mini preview lebih polish
 *   [DESIGN] Format badge konsisten dengan sistem badge baru
 *   [DESIGN] Collapse button lebih subtle dan proper
 */

import { useState, useCallback } from "react";
import { usePlayerStore, useSettingsStore } from "../store";
import BarVisualizer, { CircleVisualizer, WaveVisualizer } from "./Visualizer/BarVisualizer";
import LyricsPanel from "./Lyrics/LyricsPanel";
import CoverArt from "./CoverArt";
import StarRating from "./StarRating";
import { useLang } from "../lib/i18n";

interface Props {
  onPlayPause: () => void;
  onRating:    (songId: number, stars: number) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatBitrate(bitrate: number): string {
  if (!bitrate) return "? kbps";
  if (bitrate >= 1000) return `${Math.round(bitrate / 10) / 100} Mbps`;
  return `${bitrate} kbps`;
}

export default function Sidebar({ onRating, collapsed = false, onToggleCollapse }: Props) {
  const { currentSong, isPlaying, currentTime, getUpNext } = usePlayerStore((s) => ({
    currentSong: s.currentSong,
    isPlaying: s.isPlaying,
    currentTime: s.currentTime,
    getUpNext: s.getUpNext,
  }));
  const { visualizerType, setVisualizerType, showLyrics, toggleLyrics } = useSettingsStore();
  const { t } = useLang();
  const [coverExpanded, setCoverExpanded] = useState(false);

  const song     = currentSong;
  const upNext   = getUpNext ? getUpNext(1) : [];
  const nextSong = upNext[0]?.song ?? null;

  const isLossless = ["FLAC", "WAV", "ALAC", "APE"].includes((song?.format ?? "").toUpperCase());

  // ── Collapsed state ──────────────────────────────────────────────────────────
  if (collapsed) {
    return (
      <div style={{
        width: 34,
        background: "var(--bg-surface)",
        borderRight: "1px solid var(--border-subtle)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: 10,
        flexShrink: 0,
        transition: "width 0.2s ease",
      }}>
        <button
          onClick={onToggleCollapse}
          title="Expand sidebar"
          style={{
            width: 26, height: 26, borderRadius: "var(--radius-md)",
            background: "transparent",
            border: "1px solid var(--border)",
            color: "var(--text-muted)", cursor: "pointer", fontSize: 14,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = "var(--accent-light)";
            e.currentTarget.style.borderColor = "var(--accent-border)";
            e.currentTarget.style.background = "var(--accent-dim)";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = "var(--text-muted)";
            e.currentTarget.style.borderColor = "var(--border)";
            e.currentTarget.style.background = "transparent";
          }}
        >
          ›
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Fullscreen cover overlay */}
      {coverExpanded && song?.cover_art && (
        <div
          onClick={() => setCoverExpanded(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 999,
            background: "rgba(0,0,0,0.9)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <img
            src={song.cover_art}
            alt={song.title}
            style={{
              maxWidth: "78vw", maxHeight: "78vh",
              borderRadius: 16,
              boxShadow: "0 32px 80px rgba(0,0,0,0.8)",
            }}
          />
          <div style={{
            position: "absolute", bottom: 28, left: "50%", transform: "translateX(-50%)",
            fontSize: 12, color: "rgba(255,255,255,0.35)",
          }}>
            Click to close
          </div>
        </div>
      )}

      <div style={{
        width: 288,
        background: "var(--bg-surface)",
        borderRight: "1px solid var(--border-subtle)",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        overflow: "hidden",
        position: "relative",
        transition: "width 0.2s ease",
      }}>
        {/* Collapse button */}
        <button
          onClick={onToggleCollapse}
          title="Collapse sidebar"
          style={{
            position: "absolute", top: 10, right: 8, zIndex: 10,
            width: 22, height: 22, borderRadius: "var(--radius-sm)",
            background: "transparent",
            border: "1px solid var(--border)",
            color: "var(--text-faint)", cursor: "pointer", fontSize: 11,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = "var(--accent-light)";
            e.currentTarget.style.borderColor = "var(--accent-border)";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = "var(--text-faint)";
            e.currentTarget.style.borderColor = "var(--border)";
          }}
        >
          ‹
        </button>

        {/* Ambient background */}
        {song?.cover_art && (
          <div style={{
            position: "absolute",
            top: -20, left: -20, right: -20,
            height: 280,
            backgroundImage: `url(${song.cover_art})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "blur(48px) saturate(1.2)",
            opacity: 0.14,
            zIndex: 0,
            transition: "opacity 0.8s",
            pointerEvents: "none",
          }} />
        )}
        <div style={{
          position: "absolute",
          top: 0, left: 0, right: 0, height: 280,
          background: "linear-gradient(to bottom, rgba(11,11,31,0.2) 0%, var(--bg-surface) 88%)",
          zIndex: 1,
          pointerEvents: "none",
        }} />

        {/* ── Cover Art ── */}
        <div style={{ padding: "16px 16px 0", position: "relative", zIndex: 2 }}>
          <div
            onClick={() => song?.cover_art && setCoverExpanded(true)}
            style={{
              borderRadius: 12, overflow: "hidden",
              transform: isPlaying ? "scale(1.012)" : "scale(1)",
              transition: "transform 0.5s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.4s",
              boxShadow: isPlaying
                ? "0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(124,58,237,0.2)"
                : "0 4px 20px rgba(0,0,0,0.4)",
              cursor: song?.cover_art ? "zoom-in" : "default",
              position: "relative",
            }}
          >
            <CoverArt id={song?.id ?? 0} coverArt={song?.cover_art ?? null} size={256} />

            {/* Subtle gradient overlay at bottom */}
            <div style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(to top, rgba(11,11,31,0.5) 0%, transparent 45%)",
            }} />

            {/* Zoom hint */}
            {song?.cover_art && (
              <div style={{
                position: "absolute", bottom: 7, right: 7,
                fontSize: 10, color: "rgba(255,255,255,0.5)",
                background: "rgba(0,0,0,0.4)", borderRadius: 4,
                padding: "2px 5px", backdropFilter: "blur(4px)",
              }}>
                ⤢
              </div>
            )}
          </div>
        </div>

        {/* ── Track info ── */}
        <div style={{ padding: "12px 16px 0", position: "relative", zIndex: 2 }}>
          {/* Title */}
          <div
            style={{
              fontWeight: 700, fontSize: 14,
              letterSpacing: "-0.3px",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              color: song ? "var(--text-primary)" : "var(--text-faint)",
              lineHeight: 1.3,
            }}
            title={song?.title ?? ""}
          >
            {song?.title ?? "No track selected"}
          </div>

          {/* Artist */}
          <div style={{
            fontSize: 12, marginTop: 2,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            color: "var(--text-secondary)",
          }}>
            {song?.artist ?? "—"}
          </div>

          {/* Album */}
          {song?.album && (
            <div style={{
              fontSize: 11, marginTop: 1,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              color: "var(--text-muted)",
            }}>
              {song.album}
            </div>
          )}
        </div>

        {/* ── Rating + format badge ── */}
        <div style={{
          padding: "8px 16px 0", position: "relative", zIndex: 2,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          {song ? (
            <StarRating stars={song.stars ?? 0} onChange={s => onRating(song.id, s)} />
          ) : <div style={{ height: 18 }} />}

          {song && (
            <span className={`badge ${isLossless ? "badge-lossless" : "badge-lossy"}`}>
              {song.format}
            </span>
          )}
        </div>

        {/* ── Visualizer ── */}
        <div style={{ padding: "10px 16px 0", position: "relative", zIndex: 2 }}>
          <div style={{ display: "flex", gap: 3, justifyContent: "flex-end", marginBottom: 6 }}>
            {(["bar", "wave", "circle"] as const).map(type => (
              <button
                key={type}
                onClick={() => setVisualizerType(type)}
                title={`${type} visualizer`}
                style={{
                  width: 26, height: 22, borderRadius: "var(--radius-sm)", fontSize: 11,
                  border: "1px solid",
                  background: visualizerType === type ? "var(--accent-dim)" : "transparent",
                  borderColor: visualizerType === type ? "var(--accent-border)" : "var(--border)",
                  color: visualizerType === type ? "var(--accent-light)" : "var(--text-faint)",
                  cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
                onMouseEnter={e => { if (visualizerType !== type) e.currentTarget.style.borderColor = "var(--border-medium)"; }}
                onMouseLeave={e => { if (visualizerType !== type) e.currentTarget.style.borderColor = "var(--border)"; }}
              >
                {type === "bar" ? "▌" : type === "wave" ? "∿" : "◎"}
              </button>
            ))}
          </div>
          {visualizerType === "bar" && <BarVisualizer isPlaying={isPlaying} height={38} />}
          {visualizerType === "wave" && <WaveVisualizer isPlaying={isPlaying} />}
          {visualizerType === "circle" && (
            <div style={{ display: "flex", justifyContent: "center" }}>
              <CircleVisualizer isPlaying={isPlaying} />
            </div>
          )}
        </div>

        {/* ── Info chips ── */}
        {song && (
          <div style={{
            padding: "7px 16px 0", display: "flex", gap: 4,
            flexWrap: "wrap", position: "relative", zIndex: 2,
          }}>
            {[
              song.genre && song.genre !== "Unknown" ? song.genre : null,
              song.year ? String(song.year) : null,
              `${song.play_count ?? 0} plays`,
            ].filter(Boolean).map(chip => (
              <span key={chip} style={{
                fontSize: 11, padding: "2px 7px", borderRadius: 20,
                background: "var(--bg-muted)",
                color: "var(--text-muted)",
                border: "1px solid var(--border)",
              }}>
                {chip}
              </span>
            ))}
          </div>
        )}

        {/* ── Lyrics toggle ── */}
        <div style={{ padding: "8px 16px 0", position: "relative", zIndex: 2 }}>
          <button
            onClick={toggleLyrics}
            style={{
              width: "100%", padding: "6px", borderRadius: "var(--radius-md)",
              fontSize: 12, border: "1px solid", cursor: "pointer", fontFamily: "inherit",
              background: showLyrics ? "var(--accent-dim)" : "transparent",
              borderColor: showLyrics ? "var(--accent-border)" : "var(--border)",
              color: showLyrics ? "var(--accent-light)" : "var(--text-muted)",
            }}
            onMouseEnter={e => { if (!showLyrics) e.currentTarget.style.borderColor = "var(--border-medium)"; }}
            onMouseLeave={e => { if (!showLyrics) e.currentTarget.style.borderColor = "var(--border)"; }}
          >
            {showLyrics ? "♪ Hide Lyrics" : "♪ Show Lyrics"}
          </button>
        </div>

        {/* ── Scrollable lower section ── */}
        {showLyrics && song ? (
          <div style={{ flex: 1, minHeight: 0, overflow: "hidden", marginTop: 8, position: "relative", zIndex: 2 }}>
            <LyricsPanel
              songPath={song.path}
              currentTime={currentTime}
              songTitle={song.title}
              songArtist={song.artist}
            />
          </div>
        ) : (
          <div style={{
            flex: 1, minHeight: 0,
            overflowY: "auto", overflowX: "hidden",
            padding: "10px 16px 12px",
            position: "relative", zIndex: 2,
            display: "flex", flexDirection: "column", gap: 0,
            scrollbarWidth: "thin",
            scrollbarColor: "rgba(124,58,237,0.25) transparent",
          }}>
            {song ? (
              <>
                {/* Track details header */}
                <p style={{
                  fontSize: 10, color: "var(--text-faint)",
                  textTransform: "uppercase", letterSpacing: "0.1em",
                  fontWeight: 700, marginBottom: 8,
                }}>
                  Track details
                </p>

                {/* Details grid */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr",
                  gap: "0",
                  borderRadius: "var(--radius-md)",
                  overflow: "hidden",
                  border: "1px solid var(--border-subtle)",
                }}>
                  {[
                    { label: "Duration", value: formatDuration(song.duration) },
                    { label: "Format",   value: `${song.format ?? "—"} · ${formatBitrate(song.bitrate)}` },
                    { label: "BPM",      value: song.bpm ? `${Math.round(song.bpm)} BPM` : "Unknown" },
                    { label: "Genre",    value: song.genre || "Unknown" },
                    { label: "Year",     value: song.year?.toString() ?? "—" },
                    { label: "Plays",    value: `${song.play_count ?? 0}` },
                    { label: "Added",    value: song.date_added
                        ? new Date(song.date_added).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                        : "—" },
                  ].map(({ label, value }, idx) => (
                    <>
                      <div key={`label-${label}`} style={{
                        padding: "6px 10px",
                        fontSize: 11, color: "var(--text-muted)",
                        background: idx % 2 === 0 ? "var(--bg-overlay)" : "transparent",
                        borderBottom: idx < 6 ? "1px solid var(--border-subtle)" : "none",
                        fontWeight: 500,
                        whiteSpace: "nowrap",
                      }}>
                        {label}
                      </div>
                      <div key={`val-${label}`} style={{
                        padding: "6px 10px",
                        fontSize: 11, color: "var(--text-secondary)",
                        background: idx % 2 === 0 ? "var(--bg-overlay)" : "transparent",
                        borderBottom: idx < 6 ? "1px solid var(--border-subtle)" : "none",
                        fontFamily: ["Duration","BPM","Plays","Format"].includes(label) ? "'Space Mono', monospace" : "inherit",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {value}
                      </div>
                    </>
                  ))}
                </div>

                {/* Up Next preview */}
                {nextSong && (
                  <div style={{ marginTop: 12 }}>
                    <p style={{
                      fontSize: 10, color: "var(--text-faint)",
                      textTransform: "uppercase", letterSpacing: "0.1em",
                      fontWeight: 700, marginBottom: 6,
                    }}>
                      Up next
                    </p>
                    <div style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "7px 9px", borderRadius: "var(--radius-md)",
                      background: "var(--bg-overlay)",
                      border: "1px solid var(--border)",
                    }}>
                      <CoverArt id={nextSong.id} coverArt={nextSong.cover_art} size={30} />
                      <div style={{ flex: 1, overflow: "hidden" }}>
                        <div style={{
                          fontSize: 12, fontWeight: 500,
                          color: "var(--text-secondary)",
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        }}>
                          {nextSong.title}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{nextSong.artist}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* File path */}
                <div style={{ marginTop: 10 }}>
                  <p style={{
                    fontSize: 10, color: "var(--text-faint)",
                    textTransform: "uppercase", letterSpacing: "0.1em",
                    fontWeight: 700, marginBottom: 5,
                  }}>
                    File path
                  </p>
                  <p style={{
                    fontSize: 10, color: "var(--text-muted)",
                    fontFamily: "'Space Mono', monospace",
                    wordBreak: "break-all", lineHeight: 1.6,
                    background: "var(--bg-overlay)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "var(--radius-sm)", padding: "6px 8px",
                    userSelect: "text",
                  }}>
                    {song.path}
                  </p>
                </div>
              </>
            ) : (
              <div style={{
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                height: "100%", gap: 8,
              }}>
                <span style={{ fontSize: 28, opacity: 0.15 }}>♪</span>
                <p style={{ fontSize: 12, color: "var(--text-faint)", textAlign: "center" }}>
                  Select a track to begin
                </p>
              </div>
            )}
          </div>
        )}

        <style>{`
          @keyframes slow-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `}</style>
      </div>
    </>
  );
}