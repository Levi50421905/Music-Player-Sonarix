/**
 * SettingsPanel.tsx — v5
 *
 * PERUBAHAN vs v4:
 *   [PATCH] Integrasi WatchFolderRow ke section Library:
 *     - Badge "watching" / "idle" per folder
 *     - Tombol manual start/stop watch per folder (invoke watch_folder / unwatch_folder)
 *     - Sync state watching folders dari Rust saat section library dibuka (invoke list_watch_folders)
 *     - Animasi pulse dot saat folder sedang di-watch
 *     - Remove folder juga unwatch otomatis
 */

import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useSettingsStore } from "../../store";
import { audioEngine } from "../../lib/audioEngine";
import { exportLibrary, importPlaylist } from "../../lib/playlistIO";
import { useLibraryStore } from "../../store";

const ACCENT_COLORS = [
  { name: "Violet",   value: "#7C3AED" },
  { name: "Pink",     value: "#EC4899" },
  { name: "Blue",     value: "#3B82F6" },
  { name: "Cyan",     value: "#06B6D4" },
  { name: "Green",    value: "#10B981" },
  { name: "Orange",   value: "#F97316" },
  { name: "Rose",     value: "#F43F5E" },
];

const SHORTCUTS = [
  { keys: ["Space"],          action: "Play / Pause" },
  { keys: ["→"],              action: "Maju 5 detik" },
  { keys: ["←"],              action: "Mundur 5 detik" },
  { keys: ["Shift", "→"],     action: "Lagu berikutnya" },
  { keys: ["Shift", "←"],     action: "Lagu sebelumnya" },
  { keys: ["↑"],              action: "Volume naik" },
  { keys: ["↓"],              action: "Volume turun" },
  { keys: ["S"],              action: "Toggle shuffle" },
  { keys: ["R"],              action: "Cycle repeat" },
  { keys: ["M"],              action: "Mute / Unmute" },
  { keys: ["F"],              action: "Cari di library" },
  { keys: ["Ctrl", "M"],      action: "Buka mini player" },
  { keys: ["Ctrl", "L"],      action: "Toggle lyrics" },
  { keys: ["Ctrl", ","],      action: "Buka settings" },
  { keys: ["1–5"],            action: "Rating lagu aktif" },
  { keys: ["Media Play"],     action: "Play / Pause (OS)" },
  { keys: ["Media Next"],     action: "Berikutnya (OS)" },
  { keys: ["Media Prev"],     action: "Sebelumnya (OS)" },
];

type Section = "appearance" | "library" | "playback" | "lyrics" | "shortcuts" | "about";
type FeedbackLevel = "success" | "error" | "info";
interface Feedback { message: string; level: FeedbackLevel }

// ── WatchFolderRow ────────────────────────────────────────────────────────────

interface WatchFolderRowProps {
  folder: string;
  isWatching: boolean;
  onRemove: () => void;
  onToggleWatch: (folder: string, watch: boolean) => void;
}

function WatchFolderRow({
  folder,
  isWatching,
  onRemove,
  onToggleWatch,
}: WatchFolderRowProps) {
  const [loading, setLoading] = useState(false);

  const folderName = folder.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? folder;

  const handleToggle = async () => {
    setLoading(true);
    try {
      if (isWatching) {
        await invoke("unwatch_folder", { path: folder });
        onToggleWatch(folder, false);
      } else {
        await invoke("watch_folder", { path: folder });
        onToggleWatch(folder, true);
      }
    } catch (err) {
      console.warn("[WatchFolderRow] Toggle error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "8px 12px",
      background: isWatching
        ? "rgba(16,185,129,0.07)"
        : "rgba(255,255,255,0.02)",
      border: `1px solid ${isWatching ? "rgba(16,185,129,0.2)" : "rgba(255,255,255,0.06)"}`,
      borderRadius: 8,
      transition: "all 0.2s",
    }}>
      {/* Watch status dot */}
      <div style={{
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: isWatching ? "#10B981" : "#4b5563",
        boxShadow: isWatching ? "0 0 6px rgba(16,185,129,0.8)" : "none",
        animation: isWatching ? "watch-pulse 2s ease-in-out infinite" : "none",
        flexShrink: 0,
      }} />

      {/* Folder info */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        <div style={{
          fontSize: 12,
          fontWeight: 600,
          color: isWatching ? "#34D399" : "#9ca3af",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}>
          {folderName}
        </div>
        <div style={{
          fontSize: 10,
          color: isWatching ? "rgba(52,211,153,0.7)" : "#4b5563",
          fontFamily: "Space Mono, monospace",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          marginTop: 1,
        }}>
          {folder}
        </div>
      </div>

      {/* Status badge */}
      <span style={{
        fontSize: 9,
        padding: "2px 7px",
        borderRadius: 10,
        background: isWatching ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.05)",
        color: isWatching ? "#34D399" : "#6b7280",
        border: `1px solid ${isWatching ? "rgba(16,185,129,0.3)" : "rgba(255,255,255,0.08)"}`,
        fontFamily: "Space Mono, monospace",
        fontWeight: 700,
        flexShrink: 0,
        letterSpacing: "0.05em",
        textTransform: "uppercase" as const,
      }}>
        {isWatching ? "watching" : "idle"}
      </span>

      {/* Toggle watch button */}
      <button
        onClick={handleToggle}
        disabled={loading}
        title={isWatching ? "Hentikan watch" : "Mulai watch folder ini"}
        style={{
          width: 24, height: 24, borderRadius: 6,
          border: "1px solid",
          borderColor: isWatching ? "rgba(16,185,129,0.3)" : "rgba(124,58,237,0.3)",
          background: isWatching ? "rgba(16,185,129,0.1)" : "rgba(124,58,237,0.1)",
          color: isWatching ? "#34D399" : "#a78bfa",
          cursor: loading ? "wait" : "pointer",
          fontSize: 11,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
          opacity: loading ? 0.5 : 1,
          transition: "all 0.15s",
        }}
      >
        {loading ? "⏳" : isWatching ? "⏹" : "▶"}
      </button>

      {/* Remove button */}
      <button
        onClick={onRemove}
        title="Hapus dari watch list"
        style={{
          width: 24, height: 24, borderRadius: 6,
          border: "none",
          background: "transparent",
          color: "#6b7280",
          cursor: "pointer",
          fontSize: 13,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
          transition: "color 0.15s",
        }}
        onMouseEnter={e => (e.currentTarget.style.color = "#f87171")}
        onMouseLeave={e => (e.currentTarget.style.color = "#6b7280")}
      >
        ✕
      </button>

      <style>{`
        @keyframes watch-pulse {
          0%, 100% { opacity: 0.6; transform: scale(0.9); }
          50%       { opacity: 1;   transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}

// ── SettingsPanel ─────────────────────────────────────────────────────────────

export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [section, setSection] = useState<Section>("appearance");
  const {
    accentColor, setAccentColor,
    theme, setTheme,
    compactMode, setCompactMode,
    watchFolders, addWatchFolder, removeWatchFolder,
    crossfadeSec, setCrossfadeSec,
    replayGainEnabled, setReplayGainEnabled,
    defaultVolume, setDefaultVolume,
    gaplessEnabled, setGaplessEnabled,
    autoScanOnStart, setAutoScanOnStart,
    autoFetchLyrics, setAutoFetchLyrics,
    lyricsSource, setLyricsSource,
    animationSpeed, setAnimationSpeed,
    doubleClickAction, setDoubleClickAction,
  } = useSettingsStore() as any;
  const { songs } = useLibraryStore();

  const [feedback, setFeedback]               = useState<Feedback | null>(null);
  const [cacheSize, setCacheSize]             = useState<string | null>(null);
  const [clearingCache, setClearingCache]     = useState(false);
  const [loadingCache, setLoadingCache]       = useState(false);
  const [watchingFolders, setWatchingFolders] = useState<Set<string>>(new Set());

  const showFeedback = useCallback((message: string, level: FeedbackLevel = "info") => {
    setFeedback({ message, level });
    setTimeout(() => setFeedback(null), 4000);
  }, []);

  // Sync watching state dari Rust saat section library dibuka
  useEffect(() => {
    if (section !== "library") return;
    if (!(window as any).__TAURI_INTERNALS__) return;
    invoke<string[]>("list_watch_folders")
      .then(folders => setWatchingFolders(new Set(folders)))
      .catch(() => {});
  }, [section]);

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;
    const themes: Record<string, Record<string, string>> = {
      dark:   { "--bg-base": "#07071a", "--bg-surface": "#0b0b1e", "--bg-overlay": "#13132a", "--bg-muted": "#1e1e38" },
      darker: { "--bg-base": "#03030f", "--bg-surface": "#060612", "--bg-overlay": "#0c0c1e", "--bg-muted": "#161628" },
      amoled: { "--bg-base": "#000000", "--bg-surface": "#050508", "--bg-overlay": "#0a0a10", "--bg-muted": "#111118" },
    };
    const t = themes[theme ?? "dark"] ?? themes.dark;
    Object.entries(t).forEach(([k, v]) => root.style.setProperty(k, v));
  }, [theme]);

  // Apply compact mode
  useEffect(() => {
    document.documentElement.classList.toggle("compact-mode", !!compactMode);
  }, [compactMode]);

  // Apply animation speed
  useEffect(() => {
    const root = document.documentElement;
    const speeds: Record<string, string> = {
      normal: "1",
      slow:   "2",
      off:    "0",
    };
    root.style.setProperty("--animation-speed", speeds[animationSpeed ?? "normal"] ?? "1");
  }, [animationSpeed]);

  const loadCacheStats = useCallback(async () => {
    setLoadingCache(true);
    try {
      const bytes = await invoke<number>("get_cache_size");
      const mb    = (bytes / (1024 * 1024)).toFixed(1);
      setCacheSize(bytes > 0 ? `${mb} MB` : "Kosong");
    } catch {
      setCacheSize(null);
    } finally {
      setLoadingCache(false);
    }
  }, []);

  useEffect(() => {
    if (section === "playback") loadCacheStats();
  }, [section, loadCacheStats]);

  const handleClearCache = async () => {
    setClearingCache(true);
    try {
      await invoke("evict_audio_cache", { maxBytes: 0 });
      audioEngine.clearCacheState();
      await loadCacheStats();
      showFeedback("✅ Cache berhasil dikosongkan", "success");
    } catch {
      showFeedback("⚠️ Gagal mengosongkan cache. Coba lagi.", "error");
    } finally {
      setClearingCache(false);
    }
  };

  const handleAddFolder = async () => {
    try {
      const selected = await open({ directory: true, title: "Tambah Watch Folder" });
      if (selected && typeof selected === "string") {
        addWatchFolder(selected);
        showFeedback(`✅ Folder ditambahkan: ${selected.split(/[\\/]/).pop()}`, "success");
      }
    } catch {
      showFeedback("⚠️ Gagal membuka dialog folder.", "error");
    }
  };

  const handleExport = async () => {
    try {
      const ok = await exportLibrary(songs);
      if (ok) showFeedback("✅ Library berhasil diekspor", "success");
      else    showFeedback("ℹ️ Ekspor dibatalkan", "info");
    } catch {
      showFeedback("⚠️ Gagal mengekspor library.", "error");
    }
  };

  const handleImport = async () => {
    try {
      const result = await importPlaylist();
      if (result) {
        const notFoundMsg = result.notFound.length > 0 ? ` (${result.notFound.length} tidak ditemukan)` : "";
        showFeedback(
          `✅ Berhasil import ${result.matched}/${result.total} lagu${notFoundMsg}`,
          result.notFound.length > 0 ? "info" : "success"
        );
      } else {
        showFeedback("ℹ️ Import dibatalkan", "info");
      }
    } catch {
      showFeedback("⚠️ Gagal mengimpor playlist.", "error");
    }
  };

  const handleReplayGainToggle = useCallback((v: boolean) => {
    setReplayGainEnabled(v);
    audioEngine.setReplayGainEnabled(v);
  }, [setReplayGainEnabled]);

  const handleCrossfadeChange = useCallback((v: number) => {
    setCrossfadeSec(v);
    audioEngine.setCrossfade(v);
  }, [setCrossfadeSec]);

  const handleDefaultVolumeChange = useCallback((v: number) => {
    setDefaultVolume(v);
    audioEngine.setVolume(v);
  }, [setDefaultVolume]);

  const feedbackColor = feedback?.level === "success" ? "#10B981"
    : feedback?.level === "error" ? "#EF4444" : "#9ca3af";

  const navItem = (s: Section, label: string, icon: string) => (
    <button key={s} onClick={() => setSection(s)} style={{
      display: "flex", alignItems: "center", gap: 10,
      width: "100%", padding: "9px 12px", borderRadius: 8,
      textAlign: "left", border: "none", cursor: "pointer",
      fontFamily: "inherit", fontSize: 13,
      background: section === s ? "rgba(124,58,237,0.15)" : "transparent",
      color: section === s ? "#a78bfa" : "#9ca3af",
      transition: "all 0.15s",
    }}>
      <span style={{ fontSize: 15 }}>{icon}</span>
      {label}
    </button>
  );

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center",
      backdropFilter: "blur(8px)",
    }} onClick={onClose}>
      <div
        style={{
          width: 720, maxHeight: "88vh",
          background: "#0d0d1f",
          border: "1px solid #2a2a3e",
          borderRadius: 14,
          display: "flex",
          overflow: "hidden",
          boxShadow: "0 24px 80px rgba(0,0,0,0.8)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Sidebar nav */}
        <div style={{
          width: 190, background: "#0a0a14",
          borderRight: "1px solid #1a1a2e",
          padding: 12, flexShrink: 0,
          display: "flex", flexDirection: "column",
        }}>
          <p style={{
            fontSize: 10, color: "#4b5563", textTransform: "uppercase",
            letterSpacing: "0.1em", fontWeight: 600, marginBottom: 10, padding: "0 4px",
          }}>Settings</p>
          {navItem("appearance", "Tampilan", "🎨")}
          {navItem("playback",   "Playback",  "▶️")}
          {navItem("library",    "Library",   "📚")}
          {navItem("lyrics",     "Lyrics",    "🎤")}
          {navItem("shortcuts",  "Shortcuts", "⌨️")}
          {navItem("about",      "Tentang",   "ℹ️")}
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: 24, overflow: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h2 style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.3px" }}>
              {{ appearance: "Tampilan", library: "Library", playback: "Playback", lyrics: "Lyrics", shortcuts: "Shortcuts", about: "Tentang" }[section]}
            </h2>
            <button onClick={onClose} style={{
              background: "none", border: "none", cursor: "pointer",
              color: "#6b7280", fontSize: 18, padding: 4,
            }}>✕</button>
          </div>

          {/* ── Appearance ── */}
          {section === "appearance" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              <SettingRow label="Accent Color" desc="Warna utama antarmuka">
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {ACCENT_COLORS.map(c => (
                    <button key={c.value} onClick={() => setAccentColor(c.value)}
                      title={c.name}
                      style={{
                        width: 28, height: 28, borderRadius: "50%",
                        background: c.value, border: "none", cursor: "pointer",
                        outline: accentColor === c.value ? `3px solid ${c.value}` : "none",
                        outlineOffset: 2,
                        transform: accentColor === c.value ? "scale(1.15)" : "scale(1)",
                        transition: "transform 0.15s",
                      }}
                    />
                  ))}
                </div>
              </SettingRow>

              <SettingRow label="Theme" desc="Pilih tema warna background">
                <div style={{ display: "flex", gap: 8 }}>
                  {([["dark", "🌙 Dark"], ["darker", "🌑 Darker"], ["amoled", "⬛ AMOLED"]] as const).map(([value, label]) => (
                    <button key={value} onClick={() => setTheme(value)} style={{
                      padding: "6px 14px", borderRadius: 8, fontSize: 12,
                      border: "1px solid",
                      background: theme === value ? "rgba(124,58,237,0.2)" : "transparent",
                      borderColor: theme === value ? "#7C3AED" : "#3f3f5a",
                      color: theme === value ? "#a78bfa" : "#9ca3af",
                      cursor: "pointer", fontFamily: "inherit",
                      transition: "all 0.15s",
                    }}>{label}</button>
                  ))}
                </div>
              </SettingRow>

              <SettingRow label="Compact Mode" desc="Kurangi padding dan ukuran font untuk layar kecil">
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Toggle
                    checked={!!compactMode}
                    onChange={v => setCompactMode(v)}
                  />
                  <span style={{ fontSize: 11, color: compactMode ? "#10B981" : "#6b7280" }}>
                    {compactMode ? "Aktif — UI lebih rapat" : "Nonaktif"}
                  </span>
                </div>
              </SettingRow>

              <SettingRow label="Animation Speed" desc="Kecepatan animasi UI">
                <div style={{ display: "flex", gap: 8 }}>
                  {([["normal", "Normal"], ["slow", "Lambat"], ["off", "Mati"]] as const).map(([value, label]) => (
                    <button key={value} onClick={() => setAnimationSpeed?.(value)} style={{
                      padding: "5px 12px", borderRadius: 7, fontSize: 12,
                      border: "1px solid",
                      background: (animationSpeed ?? "normal") === value ? "rgba(124,58,237,0.2)" : "transparent",
                      borderColor: (animationSpeed ?? "normal") === value ? "#7C3AED" : "#3f3f5a",
                      color: (animationSpeed ?? "normal") === value ? "#a78bfa" : "#9ca3af",
                      cursor: "pointer", fontFamily: "inherit",
                      transition: "all 0.15s",
                    }}>{label}</button>
                  ))}
                </div>
              </SettingRow>
            </div>
          )}

          {/* ── Playback ── */}
          {section === "playback" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <SettingRow
                label="Default Volume"
                desc={`Volume saat app dibuka: ${defaultVolume ?? 80}%`}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <input
                    type="range" min={0} max={100} step={1}
                    value={defaultVolume ?? 80}
                    onChange={e => handleDefaultVolumeChange(+e.target.value)}
                    style={{ width: 140, accentColor: "#7C3AED" }}
                  />
                  <span style={{ fontSize: 12, color: "#9ca3af", minWidth: 40 }}>
                    {defaultVolume ?? 80}%
                  </span>
                </div>
              </SettingRow>

              <SettingRow
                label="Crossfade"
                desc={`Fade antar lagu: ${crossfadeSec === 0 ? "Nonaktif" : `${crossfadeSec} detik`} — Smart crossfade aktif (skip jika BPM jauh atau lagu terlalu pendek)`}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <input
                    type="range" min={0} max={10} step={1}
                    value={crossfadeSec}
                    onChange={e => handleCrossfadeChange(+e.target.value)}
                    style={{ width: 140, accentColor: "#7C3AED" }}
                  />
                  <span style={{ fontSize: 12, color: "#9ca3af", minWidth: 36 }}>
                    {crossfadeSec === 0 ? "Off" : `${crossfadeSec}s`}
                  </span>
                </div>
                {crossfadeSec > 0 && (
                  <div style={{
                    marginTop: 8, padding: "7px 12px",
                    background: "rgba(124,58,237,0.07)",
                    border: "1px solid rgba(124,58,237,0.15)",
                    borderRadius: 8, fontSize: 11, color: "#6b7280",
                  }}>
                    ⚡ Smart crossfade: otomatis skip jika lagu &lt;45s atau BPM gap &gt;40
                  </div>
                )}
              </SettingRow>

              <SettingRow
                label="ReplayGain Normalization"
                desc="Normalisasi volume per-track. Pakai tag REPLAYGAIN_TRACK_GAIN jika ada, fallback ke analisa loudness otomatis."
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Toggle
                    checked={replayGainEnabled}
                    onChange={handleReplayGainToggle}
                  />
                  <span style={{ fontSize: 11, color: replayGainEnabled ? "#10B981" : "#6b7280" }}>
                    {replayGainEnabled ? "Aktif — volume dinormalisasi per-track" : "Nonaktif — volume asli dipakai"}
                  </span>
                </div>
              </SettingRow>

              <SettingRow
                label="Gapless Playback"
                desc="Tidak ada jeda antar lagu — Web Audio seamless transition"
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Toggle
                    checked={gaplessEnabled !== false}
                    onChange={v => setGaplessEnabled(v)}
                  />
                  <span style={{ fontSize: 11, color: "#6b7280" }}>
                    {gaplessEnabled !== false ? "Aktif (dual-buffer Web Audio)" : "Nonaktif"}
                  </span>
                </div>
              </SettingRow>

              <SettingRow
                label="Double Click Action"
                desc="Aksi saat double click lagu di library"
              >
                <div style={{ display: "flex", gap: 8 }}>
                  {([["play", "▶ Play Now"], ["queue", "+ Add to Queue"]] as const).map(([value, label]) => (
                    <button key={value} onClick={() => setDoubleClickAction?.(value)} style={{
                      padding: "6px 14px", borderRadius: 8, fontSize: 12,
                      border: "1px solid",
                      background: (doubleClickAction ?? "play") === value ? "rgba(124,58,237,0.2)" : "transparent",
                      borderColor: (doubleClickAction ?? "play") === value ? "#7C3AED" : "#3f3f5a",
                      color: (doubleClickAction ?? "play") === value ? "#a78bfa" : "#9ca3af",
                      cursor: "pointer", fontFamily: "inherit",
                      transition: "all 0.15s",
                    }}>{label}</button>
                  ))}
                </div>
              </SettingRow>

              <SettingRow
                label="Smart Preload"
                desc="Preload otomatis — adaptif berdasarkan durasi lagu"
              >
                <div style={{
                  padding: "8px 12px", background: "rgba(124,58,237,0.08)",
                  borderRadius: 8, border: "1px solid rgba(124,58,237,0.2)",
                  fontSize: 11, color: "#9ca3af",
                }}>
                  ⚡ Threshold dinamis: mulai preload 8 detik sebelum akhir lagu (50–85% progress)
                </div>
              </SettingRow>

              <SettingRow
                label="Audio Cache"
                desc={
                  loadingCache ? "Memuat statistik..."
                  : cacheSize ? `Cache saat ini: ${cacheSize} (WAV decoded FLAC/APE)`
                  : "Cache decoded audio untuk playback instan"
                }
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <SmallBtn onClick={handleClearCache}>
                    {clearingCache ? "Mengosongkan…" : "🗑 Kosongkan Cache"}
                  </SmallBtn>
                  <SmallBtn onClick={loadCacheStats}>
                    {loadingCache ? "⏳" : "↻ Refresh"}
                  </SmallBtn>
                  {feedback && (
                    <span style={{ fontSize: 11, color: feedbackColor }}>{feedback.message}</span>
                  )}
                </div>
              </SettingRow>
            </div>
          )}

          {/* ── Library ── */}
          {section === "library" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Auto scan */}
              <SettingRow
                label="Auto Scan saat Startup"
                desc="Scan watch folders otomatis setiap kali app dibuka"
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Toggle
                    checked={!!autoScanOnStart}
                    onChange={v => setAutoScanOnStart(v)}
                  />
                  <span style={{ fontSize: 11, color: autoScanOnStart ? "#10B981" : "#6b7280" }}>
                    {autoScanOnStart ? "Aktif — scan otomatis tiap buka" : "Nonaktif — scan manual saja"}
                  </span>
                </div>
              </SettingRow>

              {/* Watch Folders dengan WatchFolderRow */}
              <SettingRow label="Watch Folders" desc="Folder yang di-monitor otomatis untuk file baru">
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {watchFolders.length === 0 ? (
                    <p style={{ fontSize: 12, color: "#4b5563" }}>Belum ada watch folder</p>
                  ) : (
                    watchFolders.map((folder: string) => (
                      <WatchFolderRow
                        key={folder}
                        folder={folder}
                        isWatching={watchingFolders.has(folder)}
                        onRemove={() => {
                          removeWatchFolder(folder);
                          invoke("unwatch_folder", { path: folder }).catch(() => {});
                          setWatchingFolders(prev => {
                            const next = new Set(prev);
                            next.delete(folder);
                            return next;
                          });
                        }}
                        onToggleWatch={(f, watching) => {
                          setWatchingFolders(prev => {
                            const next = new Set(prev);
                            if (watching) next.add(f);
                            else next.delete(f);
                            return next;
                          });
                        }}
                      />
                    ))
                  )}
                  <button onClick={handleAddFolder} style={{
                    padding: "7px 14px", borderRadius: 8, fontSize: 12,
                    border: "1px dashed #3f3f5a", background: "transparent",
                    color: "#9ca3af", cursor: "pointer", fontFamily: "inherit",
                    marginTop: 4,
                  }}>
                    + Tambah Folder
                  </button>
                </div>
              </SettingRow>

              <SettingRow label="Export / Import" desc="Backup library atau import dari app lain">
                <div style={{ display: "flex", gap: 8 }}>
                  <SmallBtn onClick={handleExport}>⬆ Export .m3u</SmallBtn>
                  <SmallBtn onClick={handleImport}>⬇ Import .m3u</SmallBtn>
                </div>
                {feedback && (
                  <p style={{ fontSize: 11, color: feedbackColor, marginTop: 8 }}>{feedback.message}</p>
                )}
              </SettingRow>

              <SettingRow label="Statistik Library" desc="">
                <div style={{ display: "flex", gap: 16 }}>
                  {[
                    { label: "Total Lagu",   value: songs.length },
                    { label: "Sudah Rating", value: songs.filter((s: any) => s.stars).length },
                    { label: "FLAC",         value: songs.filter((s: any) => (s.format ?? "").toUpperCase() === "FLAC").length },
                    { label: "Lossless",     value: songs.filter((s: any) => ["FLAC","WAV","ALAC","APE"].includes((s.format ?? "").toUpperCase())).length },
                  ].map(stat => (
                    <div key={stat.label} style={{ textAlign: "center" }}>
                      <div style={{ fontWeight: 700, fontSize: 20, color: "#a78bfa" }}>{stat.value}</div>
                      <div style={{ fontSize: 11, color: "#6b7280" }}>{stat.label}</div>
                    </div>
                  ))}
                </div>
              </SettingRow>
            </div>
          )}

          {/* ── Lyrics ── */}
          {section === "lyrics" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <SettingRow
                label="Auto Fetch Lyrics"
                desc="Cari lyrics otomatis dari internet jika tidak ada file .lrc lokal"
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Toggle
                    checked={!!autoFetchLyrics}
                    onChange={v => setAutoFetchLyrics?.(v)}
                  />
                  <span style={{ fontSize: 11, color: autoFetchLyrics ? "#10B981" : "#6b7280" }}>
                    {autoFetchLyrics ? "Aktif — cari dari internet jika .lrc tidak ada" : "Nonaktif — hanya dari file .lrc lokal"}
                  </span>
                </div>
              </SettingRow>

              <SettingRow
                label="Lyrics Source"
                desc="Sumber lyrics online yang dipakai"
              >
                <div style={{ display: "flex", gap: 8 }}>
                  {([["lrclib", "LRCLib (sync)"], ["lyrics_ovh", "Lyrics.ovh (plain)"]] as const).map(([value, label]) => (
                    <button key={value} onClick={() => setLyricsSource?.(value)} style={{
                      padding: "6px 14px", borderRadius: 8, fontSize: 12,
                      border: "1px solid",
                      background: (lyricsSource ?? "lrclib") === value ? "rgba(124,58,237,0.2)" : "transparent",
                      borderColor: (lyricsSource ?? "lrclib") === value ? "#7C3AED" : "#3f3f5a",
                      color: (lyricsSource ?? "lrclib") === value ? "#a78bfa" : "#9ca3af",
                      cursor: "pointer", fontFamily: "inherit",
                      transition: "all 0.15s",
                    }}>{label}</button>
                  ))}
                </div>
              </SettingRow>

              <div style={{
                padding: "14px 16px",
                background: "rgba(16,185,129,0.07)",
                border: "1px solid rgba(16,185,129,0.2)",
                borderRadius: 10,
                fontSize: 12, color: "#9ca3af", lineHeight: 1.7,
              }}>
                <strong style={{ color: "#34D399" }}>Prioritas Lyrics:</strong>
                <ol style={{ marginTop: 6, paddingLeft: 16, fontSize: 11 }}>
                  <li>File <code style={{ color: "#a78bfa" }}>.lrc</code> lokal (paling akurat, synced)</li>
                  <li>LRCLib API (synced lyrics online) — jika auto fetch aktif</li>
                  <li>Lyrics.ovh (plain text) — fallback terakhir</li>
                </ol>
                <p style={{ marginTop: 8, fontSize: 11, color: "#6b7280" }}>
                  Lyrics yang di-fetch akan di-cache lokal secara otomatis.
                </p>
              </div>
            </div>
          )}

          {/* ── Shortcuts ── */}
          {section === "shortcuts" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {SHORTCUTS.map(({ keys, action }) => (
                <div key={action} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "7px 10px", background: "#1a1a2e",
                  borderRadius: 7, gap: 8,
                }}>
                  <span style={{ fontSize: 11, color: "#9ca3af" }}>{action}</span>
                  <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                    {keys.map(k => (
                      <kbd key={k} style={{
                        padding: "2px 6px", borderRadius: 4, fontSize: 10,
                        background: "#0a0a14", border: "1px solid #3f3f5a",
                        color: "#a78bfa", fontFamily: "Space Mono, monospace",
                      }}>{k}</kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── About ── */}
          {section === "about" && (
            <div style={{
              display: "flex", flexDirection: "column", gap: 20,
              alignItems: "center", paddingTop: 20,
            }}>
              <div style={{
                width: 64, height: 64, borderRadius: 16,
                background: "linear-gradient(135deg, #7C3AED, #EC4899)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 28,
              }}>♪</div>
              <div style={{ textAlign: "center" }}>
                <h2 style={{ fontWeight: 700, fontSize: 20, letterSpacing: "-0.5px" }}>Resonance</h2>
                <p style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>Version 0.1.0</p>
                <p style={{ fontSize: 12, color: "#6b7280" }}>Built with Tauri v2 + React</p>
              </div>
              <div style={{
                fontSize: 11, color: "#4b5563", textAlign: "center",
                maxWidth: 340, lineHeight: 1.7,
                background: "#0a0a14", borderRadius: 10, padding: "12px 16px",
                border: "1px solid #1a1a2e",
              }}>
                <strong style={{ color: "#6b7280" }}>Fitur aktif:</strong><br />
                Smart shuffle · ReplayGain (tag + loudness analysis) · Dynamic preload · Gapless playback · Smart crossfade (BPM-aware) · BG decode queue · 10-band EQ · LRC sync · Auto fetch lyrics
              </div>
              <SmallBtn onClick={() => invoke("open_file_manager", { path: "." })}>
                Buka Folder App
              </SmallBtn>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Helper components ─────────────────────────────────────────────────────────

function SettingRow({ label, desc, children }: {
  label: string; desc: string; children: React.ReactNode
}) {
  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <p style={{ fontWeight: 600, fontSize: 13 }}>{label}</p>
        {desc && <p style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{desc}</p>}
      </div>
      {children}
    </div>
  );
}

function SmallBtn({ children, onClick }: {
  children: React.ReactNode; onClick?: () => void
}) {
  return (
    <button onClick={onClick} style={{
      padding: "6px 14px", borderRadius: 8, fontSize: 12,
      border: "1px solid #3f3f5a", background: "transparent",
      color: "#9ca3af", cursor: "pointer", fontFamily: "inherit",
      transition: "all 0.15s",
    }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = "#7C3AED";
        e.currentTarget.style.color = "#a78bfa";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = "#3f3f5a";
        e.currentTarget.style.color = "#9ca3af";
      }}
    >{children}</button>
  );
}

function Toggle({
  defaultChecked = false,
  checked,
  onChange,
}: {
  defaultChecked?: boolean;
  checked?: boolean;
  onChange?: (v: boolean) => void;
}) {
  const [on, setOn] = useState(checked ?? defaultChecked);

  useEffect(() => {
    if (checked !== undefined) setOn(checked);
  }, [checked]);

  const handleClick = () => {
    const next = !on;
    setOn(next);
    onChange?.(next);
  };

  return (
    <button onClick={handleClick} style={{
      width: 40, height: 22, borderRadius: 11,
      background: on ? "#7C3AED" : "#2a2a3e",
      border: "none", cursor: "pointer",
      position: "relative", transition: "background 0.2s", flexShrink: 0,
    }}>
      <div style={{
        position: "absolute", top: 3, left: on ? 21 : 3,
        width: 16, height: 16, borderRadius: "50%",
        background: "white", transition: "left 0.2s",
        boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
      }} />
    </button>
  );
}