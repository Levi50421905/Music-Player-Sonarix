/**
 * SettingsPanel.tsx — App Settings
 *
 * Sections:
 *   1. Appearance: theme, accent color
 *   2. Library: watch folders, scan on startup
 *   3. Playback: crossfade, gapless
 *   4. Keyboard Shortcuts: tampilkan semua shortcut
 *   5. About: versi app
 */

import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useSettingsStore } from "../../store";
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
  { keys: ["→"],              action: "Forward 5s" },
  { keys: ["←"],              action: "Rewind 5s" },
  { keys: ["Shift", "→"],     action: "Next track" },
  { keys: ["Shift", "←"],     action: "Previous track" },
  { keys: ["↑"],              action: "Volume up" },
  { keys: ["↓"],              action: "Volume down" },
  { keys: ["S"],              action: "Toggle shuffle" },
  { keys: ["R"],              action: "Cycle repeat" },
  { keys: ["M"],              action: "Mute / Unmute" },
  { keys: ["F"],              action: "Search library" },
  { keys: ["Ctrl", "M"],      action: "Open mini player" },
  { keys: ["Ctrl", "L"],      action: "Toggle lyrics" },
  { keys: ["Ctrl", ","],      action: "Open settings" },
  { keys: ["1–5"],            action: "Rate current song" },
  { keys: ["Media Play"],     action: "Play / Pause (OS)" },
  { keys: ["Media Next"],     action: "Next (OS)" },
  { keys: ["Media Prev"],     action: "Prev (OS)" },
];

type Section = "appearance" | "library" | "playback" | "shortcuts" | "about";

export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [section, setSection] = useState<Section>("appearance");
  const {
    accentColor, setAccentColor,
    watchFolders, addWatchFolder, removeWatchFolder,
  } = useSettingsStore();
  const { songs } = useLibraryStore();

  const [importResult, setImportResult] = useState<string | null>(null);

  const handleAddFolder = async () => {
    const selected = await open({ directory: true, title: "Add Watch Folder" });
    if (selected && typeof selected === "string") addWatchFolder(selected);
  };

  const handleExport = async () => {
    const ok = await exportLibrary(songs);
    if (ok) setImportResult("✅ Library exported successfully");
  };

  const handleImport = async () => {
    const result = await importPlaylist();
    if (result) {
      setImportResult(
        `✅ Imported "${result.matched}/${result.total}" tracks` +
        (result.notFound.length > 0 ? ` (${result.notFound.length} not found in library)` : "")
      );
    }
  };

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
          width: 680, height: 480,
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
          width: 180, background: "#0a0a14",
          borderRight: "1px solid #1a1a2e",
          padding: 12, flexShrink: 0,
        }}>
          <p style={{ fontSize: 10, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600, marginBottom: 10, padding: "0 4px" }}>
            Settings
          </p>
          {navItem("appearance", "Appearance", "🎨")}
          {navItem("library", "Library", "📚")}
          {navItem("playback", "Playback", "▶️")}
          {navItem("shortcuts", "Shortcuts", "⌨️")}
          {navItem("about", "About", "ℹ️")}
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: 24, overflow: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h2 style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.3px" }}>
              {section.charAt(0).toUpperCase() + section.slice(1)}
            </h2>
            <button onClick={onClose} style={{
              background: "none", border: "none", cursor: "pointer",
              color: "#6b7280", fontSize: 18, padding: 4,
            }}>✕</button>
          </div>

          {/* ── Appearance ── */}
          {section === "appearance" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              <SettingRow label="Accent Color" desc="Warna utama UI">
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {ACCENT_COLORS.map(c => (
                    <button key={c.value} onClick={() => setAccentColor(c.value)}
                      title={c.name}
                      style={{
                        width: 28, height: 28, borderRadius: "50%",
                        background: c.value, border: "none", cursor: "pointer",
                        outline: accentColor === c.value ? `3px solid ${c.value}` : "none",
                        outlineOffset: 2,
                        transition: "transform 0.15s",
                        transform: accentColor === c.value ? "scale(1.15)" : "scale(1)",
                      }}
                    />
                  ))}
                </div>
              </SettingRow>

              <SettingRow label="Window" desc="Transparansi dan efek jendela">
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  Diatur otomatis berdasarkan OS
                </div>
              </SettingRow>
            </div>
          )}

          {/* ── Library ── */}
          {section === "library" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <SettingRow label="Watch Folders" desc="Folder yang otomatis di-scan saat app dibuka">
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {watchFolders.length === 0 ? (
                    <p style={{ fontSize: 12, color: "#4b5563" }}>Belum ada watch folder</p>
                  ) : (
                    watchFolders.map(folder => (
                      <div key={folder} style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "6px 10px", background: "#1a1a2e",
                        borderRadius: 6, fontSize: 12,
                      }}>
                        <span style={{ flex: 1, color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "monospace", fontSize: 11 }}>
                          {folder}
                        </span>
                        <button onClick={() => removeWatchFolder(folder)} style={{
                          background: "none", border: "none", cursor: "pointer",
                          color: "#ef4444", fontSize: 12,
                        }}>✕</button>
                      </div>
                    ))
                  )}
                  <button onClick={handleAddFolder} style={{
                    padding: "7px 14px", borderRadius: 8, fontSize: 12,
                    border: "1px dashed #3f3f5a", background: "transparent",
                    color: "#9ca3af", cursor: "pointer", fontFamily: "inherit",
                    marginTop: 4,
                  }}>
                    + Add Folder
                  </button>
                </div>
              </SettingRow>

              <SettingRow label="Export / Import" desc="Backup library atau import dari app lain">
                <div style={{ display: "flex", gap: 8 }}>
                  <SmallBtn onClick={handleExport}>⬆ Export .m3u</SmallBtn>
                  <SmallBtn onClick={handleImport}>⬇ Import .m3u</SmallBtn>
                </div>
                {importResult && (
                  <p style={{ fontSize: 11, color: "#10B981", marginTop: 8 }}>{importResult}</p>
                )}
              </SettingRow>

              <SettingRow label="Library Stats" desc="">
                <div style={{ display: "flex", gap: 16 }}>
                  {[
                    { label: "Tracks", value: songs.length },
                    { label: "Rated", value: songs.filter(s => s.stars).length },
                    { label: "FLAC", value: songs.filter(s => s.format === "FLAC").length },
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

          {/* ── Playback ── */}
          {section === "playback" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <SettingRow label="Gapless Playback" desc="Tidak ada jeda antar track">
                <Toggle defaultChecked />
              </SettingRow>
              <SettingRow label="Crossfade" desc="Fade antara track (detik)">
                <input type="range" min={0} max={10} defaultValue={0}
                  style={{ width: 120, accentColor: "#7C3AED" }} />
              </SettingRow>
              <SettingRow label="ReplayGain" desc="Normalisasi volume antar lagu">
                <Toggle />
              </SettingRow>
              <SettingRow label="High-Res Audio" desc="Prioritaskan kualitas tertinggi (FLAC 24bit+)">
                <Toggle defaultChecked />
              </SettingRow>
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
            <div style={{ display: "flex", flexDirection: "column", gap: 20, alignItems: "center", paddingTop: 20 }}>
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
              <div style={{ display: "flex", gap: 10 }}>
                <SmallBtn onClick={() => invoke("open_file_manager", { path: "." })}>
                  Open App Folder
                </SmallBtn>
              </div>
              <p style={{ fontSize: 11, color: "#4b5563", textAlign: "center", maxWidth: 300, lineHeight: 1.6 }}>
                Local music player dengan support FLAC, MP3, WAV, OGG, dan format lainnya.
                Smart shuffle berdasarkan rating dan play history.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Helper components ────────────────────────────────────────────────────────

function SettingRow({ label, desc, children }: { label: string; desc: string; children: React.ReactNode }) {
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

function SmallBtn({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: "6px 14px", borderRadius: 8, fontSize: 12,
      border: "1px solid #3f3f5a", background: "transparent",
      color: "#9ca3af", cursor: "pointer", fontFamily: "inherit",
      transition: "all 0.15s",
    }}
      onMouseEnter={e => {
        (e.currentTarget.style.borderColor) = "#7C3AED";
        (e.currentTarget.style.color) = "#a78bfa";
      }}
      onMouseLeave={e => {
        (e.currentTarget.style.borderColor) = "#3f3f5a";
        (e.currentTarget.style.color) = "#9ca3af";
      }}
    >{children}</button>
  );
}

function Toggle({ defaultChecked = false }: { defaultChecked?: boolean }) {
  const [on, setOn] = useState(defaultChecked);
  return (
    <button onClick={() => setOn(v => !v)} style={{
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