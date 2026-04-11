/**
 * Sidebar.tsx — v4 (contrast & visibility fixes)
 *
 * FIXES:
 *   - Artist name highlight saat isPlaying (#6b7280 → #9ca3af when playing)
 *   - Info chips: #4b5563 → #8b95a3
 *   - FormatBadge font size 9px → 11px
 *   - Track details label: #4b5563 → #8b95a3
 *   - File path text / section headers: #3f3f5a → #6b7280
 *   - "Pilih lagu untuk mulai" placeholder: #2a2a3e → #4b5563
 *   - Visualizer type buttons inactive: #3f3f5a → #6b7280
 */

import { usePlayerStore, useSettingsStore } from "../store";
import BarVisualizer, { CircleVisualizer, WaveVisualizer } from "./Visualizer/BarVisualizer";
import LyricsPanel  from "./Lyrics/LyricsPanel";
import CoverArt     from "./CoverArt";
import StarRating   from "./StarRating";

interface Props {
  onPlayPause: () => void;
  onRating:    (songId: number, stars: number) => void;
}

export default function Sidebar({ onRating }: Props) {
  const { currentSong, isPlaying, currentTime } = usePlayerStore();
  const { visualizerType, setVisualizerType, showLyrics, toggleLyrics } = useSettingsStore();

  const song = currentSong;

  return (
    <div style={{
      width: 340,
      background: "#0a0a18",
      borderRight: "1px solid rgba(255,255,255,0.04)",
      display: "flex",
      flexDirection: "column",
      flexShrink: 0,
      overflow: "hidden",
      position: "relative",
    }}>

      {/* ── Ambient background blob ── */}
      {song?.cover_art && (
        <div style={{
          position: "absolute",
          top: -20, left: -20, right: -20,
          height: 380,
          backgroundImage: `url(${song.cover_art})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "blur(40px) saturate(1.4)",
          opacity: 0.18,
          zIndex: 0,
          transition: "opacity 0.6s",
          pointerEvents: "none",
        }} />
      )}
      <div style={{
        position: "absolute",
        top: 0, left: 0, right: 0, height: 380,
        background: "linear-gradient(to bottom, rgba(10,10,24,0.3) 0%, #0a0a18 85%)",
        zIndex: 1,
        pointerEvents: "none",
      }} />

      {/* ── Cover art ── */}
      <div style={{ padding: "20px 20px 0", position: "relative", zIndex: 2 }}>
        <div style={{
          borderRadius: 14, overflow: "hidden",
          transform: isPlaying ? "scale(1.015)" : "scale(1)",
          transition: "transform 0.6s cubic-bezier(0.34,1.56,0.64,1)",
          boxShadow: isPlaying
            ? "0 12px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(124,58,237,0.3)"
            : "0 8px 32px rgba(0,0,0,0.5)",
        }}>
          <CoverArt id={song?.id ?? 0} coverArt={song?.cover_art ?? null} size={300} />
          {isPlaying && (
            <div style={{
              position: "absolute", inset: 0,
              background: "radial-gradient(circle at 50% 50%, transparent 30%, rgba(0,0,0,0.08) 100%)",
              animation: "slow-spin 12s linear infinite",
            }} />
          )}
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(10,10,24,0.7) 0%, transparent 50%)" }} />
        </div>
      </div>

      {/* ── Track info ── */}
      <div style={{ padding: "14px 20px 0", position: "relative", zIndex: 2 }}>
        <div style={{
          fontWeight: 700, fontSize: 15,
          letterSpacing: "-0.3px",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          color: song ? "#f1f5f9" : "#4b5563",       /* FIX: was #2a2a3e when empty */
          textShadow: isPlaying && song ? "0 0 24px rgba(167,139,250,0.5)" : "none",
          transition: "text-shadow 0.5s",
          lineHeight: 1.3,
        }}>
          {song?.title ?? "No track selected"}
        </div>

        {/* FIX: artist brighter when playing */}
        <div style={{
          fontSize: 12, marginTop: 3,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          color: isPlaying && song ? "#9ca3af" : "#6b7280",
          transition: "color 0.4s",
        }}>
          {song?.artist ?? "—"}
        </div>

        <div style={{
          fontSize: 11, marginTop: 1,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          color: "#6b7280",                          /* FIX: was #3f3f5a */
        }}>
          {song?.album ?? ""}
        </div>
      </div>

      {/* ── Rating + format ── */}
      <div style={{
        padding: "10px 20px 0", position: "relative", zIndex: 2,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        {song ? (
          <StarRating stars={song.stars ?? 0} onChange={s => onRating(song.id, s)} />
        ) : <div style={{ height: 18 }} />}
        {song && <FormatBadge format={song.format} bitrate={song.bitrate} />}
      </div>

      {/* ── Visualizer ── */}
      <div style={{ padding: "14px 20px 0", position: "relative", zIndex: 2 }}>
        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", marginBottom: 8 }}>
          {(["bar", "wave", "circle"] as const).map(type => (
            <button key={type} onClick={() => setVisualizerType(type)} style={{
              width: 24, height: 24, borderRadius: 6, fontSize: 12,
              border: "1px solid",
              background: visualizerType === type ? "rgba(124,58,237,0.25)" : "transparent",
              borderColor: visualizerType === type ? "rgba(124,58,237,0.6)" : "rgba(255,255,255,0.08)",
              color: visualizerType === type ? "#a78bfa" : "#6b7280",   /* FIX: was #3f3f5a */
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.15s",
            }}>
              {type === "bar" ? "▌" : type === "wave" ? "∿" : "◎"}
            </button>
          ))}
        </div>
        {visualizerType === "bar"    && <BarVisualizer isPlaying={isPlaying} height={44} />}
        {visualizerType === "wave"   && <WaveVisualizer isPlaying={isPlaying} />}
        {visualizerType === "circle" && <div style={{ display: "flex", justifyContent: "center" }}><CircleVisualizer isPlaying={isPlaying} /></div>}
      </div>

      {/* ── Info chips ── */}
      {song && (
        <div style={{ padding: "10px 20px 0", display: "flex", gap: 5, flexWrap: "wrap", position: "relative", zIndex: 2 }}>
          {[song.genre, song.year?.toString(), `${song.play_count ?? 0} plays`].filter(Boolean).map(chip => (
            <span key={chip} style={{
              fontSize: 11,              /* FIX: was 10px */
              padding: "2px 8px", borderRadius: 20,
              background: "rgba(255,255,255,0.04)",
              color: "#8b95a3",          /* FIX: was #4b5563 */
              border: "1px solid rgba(255,255,255,0.06)",
            }}>{chip}</span>
          ))}
        </div>
      )}

      {/* ── Lyrics toggle ── */}
      <div style={{ padding: "10px 20px 0", position: "relative", zIndex: 2 }}>
        <button onClick={toggleLyrics} style={{
          width: "100%", padding: "7px", borderRadius: 8, fontSize: 12,
          border: "1px solid", cursor: "pointer", fontFamily: "inherit",
          background: showLyrics ? "rgba(124,58,237,0.12)" : "transparent",
          borderColor: showLyrics ? "rgba(124,58,237,0.4)" : "rgba(255,255,255,0.06)",
          color: showLyrics ? "#a78bfa" : "#6b7280",
          transition: "all 0.2s",
        }}>
          {showLyrics ? "🎵 Hide Lyrics" : "🎵 Show Lyrics"}
        </button>
      </div>

      {/* ── Lyrics panel ── */}
      {showLyrics && song ? (
        <div style={{
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
          marginTop: 8,
          position: "relative",
          zIndex: 2,
        }}>
          <LyricsPanel
            songPath={song.path}
            currentTime={currentTime}
            songTitle={song.title}
            songArtist={song.artist}
          />
        </div>
      ) : (
        <div style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
          padding: "12px 20px 16px",
          position: "relative",
          zIndex: 2,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          scrollbarWidth: "thin",
          scrollbarColor: "rgba(124,58,237,0.3) transparent",
        }}>
          {song ? (
            <>
              <p style={{
                fontSize: 10,
                color: "#6b7280",          /* FIX: was #3f3f5a */
                textTransform: "uppercase",
                letterSpacing: "0.1em", fontWeight: 700, marginBottom: 4,
              }}>Track Details</p>

              {[
                { label: "Duration",    value: formatDuration(song.duration) },
                { label: "Format",      value: `${song.format ?? "—"} · ${song.bitrate >= 1000 ? `${(song.bitrate / 1000).toFixed(0)}k` : `${song.bitrate || "?"}kbps`}` },
                { label: "BPM",         value: song.bpm ? `${Math.round(song.bpm)} BPM` : "—" },
                { label: "Genre",       value: song.genre || "—" },
                { label: "Year",        value: song.year?.toString() ?? "—" },
                { label: "Play Count",  value: `${song.play_count ?? 0} plays` },
                { label: "Date Added",  value: song.date_added ? new Date(song.date_added).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—" },
              ].map(({ label, value }) => (
                <div key={label} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "5px 0",
                  borderBottom: "1px solid rgba(255,255,255,0.03)",
                }}>
                  <span style={{ fontSize: 11, color: "#8b95a3" }}>{label}</span>   {/* FIX: was #4b5563 */}
                  <span style={{
                    fontSize: 11, color: "#9ca3af",
                    fontFamily: label === "Duration" || label === "BPM" || label === "Play Count"
                      ? "Space Mono, monospace" : "inherit",
                    maxWidth: 160, textAlign: "right",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{value}</span>
                </div>
              ))}

              <div style={{ marginTop: 4 }}>
                <p style={{
                  fontSize: 10,
                  color: "#6b7280",        /* FIX: was #3f3f5a */
                  textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, marginBottom: 4,
                }}>
                  File Path
                </p>
                <p style={{
                  fontSize: 10,
                  color: "#6b7280",        /* FIX: was #3f3f5a */
                  fontFamily: "Space Mono, monospace",
                  wordBreak: "break-all",
                  lineHeight: 1.6,
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.04)",
                  borderRadius: 6,
                  padding: "6px 8px",
                }}>
                  {song.path}
                </p>
              </div>
            </>
          ) : (
            <div style={{
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              height: "100%", gap: 6,
            }}>
              <span style={{ fontSize: 28, opacity: 0.2 }}>♪</span>
              <p style={{ fontSize: 12, color: "#4b5563", textAlign: "center" }}>  {/* FIX: was #2a2a3e */}
                Pilih lagu untuk mulai
              </p>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes slow-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function FormatBadge({ format, bitrate }: { format: string; bitrate: number }) {
  const isLossless = ["FLAC", "WAV", "ALAC", "APE"].includes((format ?? "").toUpperCase());
  const br = bitrate >= 1000 ? `${(bitrate / 1000).toFixed(1)}k` : `${bitrate || "?"}`;
  return (
    <span style={{
      fontSize: 11,           /* FIX: was 9px */
      fontFamily: "Space Mono, monospace",
      padding: "3px 7px", borderRadius: 5,
      background: isLossless ? "rgba(16,185,129,0.1)" : "rgba(99,102,241,0.1)",
      border: `1px solid ${isLossless ? "rgba(16,185,129,0.3)" : "rgba(99,102,241,0.3)"}`,
      color: isLossless ? "#34D399" : "#818CF8",
      letterSpacing: "0.05em",
    }}>
      {format} {br}
    </span>
  );
}