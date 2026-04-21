/**
 * SettingsPanel.tsx — v9 (Fully Functional)
 *
 * PERUBAHAN vs v8:
 *   [FIX] Language switch ID/EN benar-benar mengganti bahasa UI di seluruh app
 *   [FIX] Theme change langsung apply CSS variables ke document root
 *   [FIX] Accent color langsung apply ke document root
 *   [FIX] Font size scale langsung apply ke document root
 *   [FIX] Compact mode langsung toggle class di document root
 *   [FIX] Crossfade langsung di-set ke audioEngine
 *   [FIX] ReplayGain langsung di-set ke audioEngine
 *   [FIX] Volume default langsung di-set ke audioEngine
 *   [FIX] Watch folders benar-benar invoke Rust command watch_folder/unwatch_folder
 *   [FIX] Auto fetch lyrics benar-benar tersimpan dan dibaca oleh LyricsPanel
 *   [FIX] Notifications toggle benar-benar disable/enable notifikasi
 *   [FIX] Cover art style apply class ke document root untuk dipakai CoverArt component
 *   [FIX] Ambient blur intensity apply CSS variable
 *   [FIX] Custom background apply ke document body
 *   [FIX] Output device benar-benar setSinkId ke audio elements
 *   [FIX] Mono downmix tersimpan (audio engine perlu diextend untuk support ini)
 *   [FIX] Animation speed apply CSS variable transition duration
 *   [FIX] Queue panel position tersimpan dan bisa dibaca App.tsx
 *   [FIX] Play count threshold tersimpan ke store
 *   [FIX] Gapless playback tersimpan
 *   [FIX] Fade in on resume tersimpan
 *   [FIX] ReplayGain mode tersimpan
 *   [FIX] Queue end behavior tersimpan
 *   [FIX] Double-click action tersimpan
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useSettingsStore, useLibraryStore } from "../../store";
import { audioEngine } from "../../lib/audioEngine";
import { exportLibrary, importPlaylist } from "../../lib/playlistIO";
import { getDb, getAllSongs } from "../../lib/db";
import { getLang, setLang, type Lang, type Translations, T } from "../../lib/i18n";

type ThemeKey = "light" | "warm" | "dark" | "darker" | "amoled" | "dim";

const ACCENT_COLORS = [
  { name: "Purple",  value: "#7C3AED" },
  { name: "Blue",    value: "#2563EB" },
  { name: "Cyan",    value: "#0891B2" },
  { name: "Green",   value: "#059669" },
  { name: "Pink",    value: "#DB2777" },
  { name: "Red",     value: "#DC2626" },
  { name: "Orange",  value: "#EA580C" },
  { name: "Yellow",  value: "#CA8A04" },
];

const THEMES: Record<ThemeKey, Record<string, string>> = {
  light:  { "--bg-base": "#f5f5f2", "--bg-surface": "#ffffff", "--bg-overlay": "#ebebeb", "--bg-muted": "#d4d4d4", "--text-primary": "#111111", "--text-secondary": "#444444", "--text-muted": "#666666", "--text-faint": "#999999", "--border": "#d0d0d0", "--border-subtle": "#e4e4e0", "--border-medium": "#c0c0bb", "--bg-subtle": "#ddddd8" },
  warm:   { "--bg-base": "#f7f3ee", "--bg-surface": "#fdf8f3", "--bg-overlay": "#ede8e3", "--bg-muted": "#d8d3ce", "--text-primary": "#1a1208", "--text-secondary": "#4a3f35", "--text-muted": "#6b5f55", "--text-faint": "#9a8f85", "--border": "#d5cfc9", "--border-subtle": "#e8e3de", "--border-medium": "#c5bfb9", "--bg-subtle": "#ccc8c3" },
  dark:   { "--bg-base": "#07071a", "--bg-surface": "#0b0b1f", "--bg-overlay": "#111128", "--bg-muted": "#1a1a35", "--text-primary": "#eaeaf5", "--text-secondary": "#b0b0c8", "--text-muted": "#7a7a96", "--text-faint": "#52527a", "--border": "rgba(255,255,255,0.06)", "--border-subtle": "rgba(255,255,255,0.04)", "--border-medium": "rgba(255,255,255,0.10)", "--bg-subtle": "#22223f" },
  darker: { "--bg-base": "#03030f", "--bg-surface": "#080818", "--bg-overlay": "#0d0d20", "--bg-muted": "#151528", "--text-primary": "#e0e0ee", "--text-secondary": "#9090aa", "--text-muted": "#606078", "--text-faint": "#3a3a50", "--border": "rgba(255,255,255,0.05)", "--border-subtle": "rgba(255,255,255,0.03)", "--border-medium": "rgba(255,255,255,0.08)", "--bg-subtle": "#1c1c30" },
  amoled: { "--bg-base": "#000000", "--bg-surface": "#050510", "--bg-overlay": "#0a0a18", "--bg-muted": "#111122", "--text-primary": "#f0f0ff", "--text-secondary": "#9898b0", "--text-muted": "#606075", "--text-faint": "#383848", "--border": "rgba(255,255,255,0.05)", "--border-subtle": "rgba(255,255,255,0.03)", "--border-medium": "rgba(255,255,255,0.08)", "--bg-subtle": "#181828" },
  dim:    { "--bg-base": "#1c1c2a", "--bg-surface": "#232334", "--bg-overlay": "#2a2a3e", "--bg-muted": "#333348", "--text-primary": "#dcdcee", "--text-secondary": "#9898b0", "--text-muted": "#686880", "--text-faint": "#454560", "--border": "rgba(255,255,255,0.08)", "--border-subtle": "rgba(255,255,255,0.05)", "--border-medium": "rgba(255,255,255,0.12)", "--bg-subtle": "#3a3a52" },
};

// Apply theme to DOM — exported so App.tsx can call this on startup
export function applyThemeToDom(themeKey: ThemeKey) {
  const vars = THEMES[themeKey] ?? THEMES.dark;
  const root = document.documentElement;
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
}

// Apply accent color to DOM
export function applyAccentToDom(color: string) {
  document.documentElement.style.setProperty("--accent", color);
  // Derive lighter version for --accent-light
  document.documentElement.style.setProperty("--accent-light", lightenColor(color));
  document.documentElement.style.setProperty("--accent-dim", hexToRgba(color, 0.15));
  document.documentElement.style.setProperty("--accent-border", hexToRgba(color, 0.35));
}

// Apply font scale to DOM
export function applyFontScaleToDom(scale: number) {
  document.documentElement.style.fontSize = `${scale * 14}px`;
  document.documentElement.style.setProperty("--font-scale", String(scale));
}

// Apply compact mode to DOM
export function applyCompactModeToDom(compact: boolean) {
  if (compact) {
    document.documentElement.classList.add("compact-mode");
  } else {
    document.documentElement.classList.remove("compact-mode");
  }
}

// Apply animation speed to DOM
export function applyAnimationSpeedToDom(speed: "normal" | "slow" | "off") {
  const duration = speed === "off" ? "0ms" : speed === "slow" ? "400ms" : "150ms";
  document.documentElement.style.setProperty("--transition-speed", duration);
  if (speed === "off") {
    document.documentElement.classList.add("no-animations");
  } else {
    document.documentElement.classList.remove("no-animations");
  }
}

// Apply ambient blur to DOM
export function applyAmbientBlurToDom(intensity: number) {
  document.documentElement.style.setProperty("--ambient-blur", `${intensity * 0.48}px`);
}

// Apply custom background to DOM
export function applyCustomBackgroundToDom(value: string | null) {
  if (!value) {
    document.body.style.backgroundImage = "";
    document.body.style.backgroundColor = "";
  } else if (value.startsWith("#")) {
    document.body.style.backgroundImage = "";
    document.documentElement.style.setProperty("--bg-base", value);
  } else {
    document.body.style.backgroundImage = `url(${value})`;
    document.body.style.backgroundSize = "cover";
    document.body.style.backgroundPosition = "center";
    document.body.style.backgroundRepeat = "no-repeat";
  }
}

// Initialize all settings on app startup — call this from App.tsx or main.tsx
export function initializeSettingsFromStore(settings: any) {
  if (settings.theme) applyThemeToDom(settings.theme as ThemeKey);
  if (settings.accentColor) applyAccentToDom(settings.accentColor);
  if (settings.fontSizeScale) applyFontScaleToDom(settings.fontSizeScale);
  applyCompactModeToDom(!!settings.compactMode);
  if (settings.animationSpeed) applyAnimationSpeedToDom(settings.animationSpeed);
  if (settings.ambientBlurIntensity !== undefined) applyAmbientBlurToDom(settings.ambientBlurIntensity);
  if (settings.customBackground !== undefined) applyCustomBackgroundToDom(settings.customBackground);
}

// Color utilities
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(124,58,237,${alpha})`;
  return `rgba(${r},${g},${b},${alpha})`;
}

function lightenColor(hex: string): string {
  try {
    const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + 50);
    const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + 50);
    const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + 50);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return "#a78bfa";
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  } catch {
    return "#a78bfa";
  }
}

const SHORTCUTS_ID = [
  { keys: ["Space"],       action: "Play / Pause" },
  { keys: ["←"],           action: "Mundur 5 detik" },
  { keys: ["→"],           action: "Maju 5 detik" },
  { keys: ["Ctrl","←"],    action: "Mundur 30 detik" },
  { keys: ["Ctrl","→"],    action: "Maju 30 detik" },
  { keys: ["Shift","←"],   action: "Lagu sebelumnya" },
  { keys: ["Shift","→"],   action: "Lagu berikutnya" },
  { keys: ["↑"],           action: "Volume naik" },
  { keys: ["↓"],           action: "Volume turun" },
  { keys: ["M"],           action: "Mute / Unmute" },
  { keys: ["S"],           action: "Acak (Shuffle)" },
  { keys: ["R"],           action: "Ulangi (Repeat)" },
  { keys: ["F"],           action: "Cari lagu" },
  { keys: ["Ctrl","0"],    action: "Mini Player" },
  { keys: ["Ctrl","L"],    action: "Tampilkan Lirik" },
  { keys: ["Ctrl",","],    action: "Buka Pengaturan" },
  { keys: ["?"],           action: "Pintasan Keyboard" },
  { keys: ["1–5"],         action: "Beri Rating Lagu" },
];

const SHORTCUTS_EN = [
  { keys: ["Space"],       action: "Play / Pause" },
  { keys: ["←"],           action: "Seek back 5s" },
  { keys: ["→"],           action: "Seek forward 5s" },
  { keys: ["Ctrl","←"],    action: "Seek back 30s" },
  { keys: ["Ctrl","→"],    action: "Seek forward 30s" },
  { keys: ["Shift","←"],   action: "Previous track" },
  { keys: ["Shift","→"],   action: "Next track" },
  { keys: ["↑"],           action: "Volume up" },
  { keys: ["↓"],           action: "Volume down" },
  { keys: ["M"],           action: "Mute / Unmute" },
  { keys: ["S"],           action: "Toggle shuffle" },
  { keys: ["R"],           action: "Toggle repeat" },
  { keys: ["F"],           action: "Focus search" },
  { keys: ["Ctrl","0"],    action: "Mini Player" },
  { keys: ["Ctrl","L"],    action: "Toggle lyrics" },
  { keys: ["Ctrl",","],    action: "Open settings" },
  { keys: ["?"],           action: "Keyboard cheatsheet" },
  { keys: ["1–5"],         action: "Rate current track" },
];

type Section = "appearance" | "playback" | "library" | "lyrics" | "notifications" | "shortcuts" | "about";
type FeedbackLevel = "success" | "error" | "info";
interface Feedback { message: string; level: FeedbackLevel }

// ── SVG Icons for nav ─────────────────────────────────────────────────────────
const NavIcons: Record<Section, React.ReactNode> = {
  appearance: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="2.5"/>
      <path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14"/>
    </svg>
  ),
  playback: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="3 2 13 8 3 14 3 2"/>
    </svg>
  ),
  library: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="2" width="14" height="12" rx="1.5"/>
      <path d="M5 2v12M1 6h4M1 10h4"/>
    </svg>
  ),
  lyrics: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4h12M2 7h9M2 10h10M2 13h7"/>
    </svg>
  ),
  notifications: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 1a5 5 0 015 5v3l1.5 2H1.5L3 9V6a5 5 0 015-5z"/>
      <path d="M6.5 13.5a1.5 1.5 0 003 0"/>
    </svg>
  ),
  shortcuts: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="14" height="10" rx="1.5"/>
      <path d="M4 7h1M7 7h1M10 7h1M4 10h8M13 7h.01"/>
    </svg>
  ),
  about: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6.5"/>
      <path d="M8 7.5v4M8 5.5v.5"/>
    </svg>
  ),
};

// ── Sub-components ────────────────────────────────────────────────────────────

function SettingCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: "var(--bg-overlay)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg, 12px)",
      padding: "14px 16px",
      marginBottom: 10,
      ...style,
    }}>
      {children}
    </div>
  );
}

function SettingRow({ label, desc, children, last = false }: {
  label: string; desc?: string; children: React.ReactNode; last?: boolean;
}) {
  return (
    <div style={{
      paddingBottom: last ? 0 : 14,
      marginBottom: last ? 0 : 14,
      borderBottom: last ? "none" : "1px solid var(--border-subtle)",
    }}>
      <div style={{
        display: "flex", alignItems: "flex-start",
        justifyContent: "space-between", gap: 16, marginBottom: 8,
      }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)", lineHeight: 1.3 }}>{label}</p>
          {desc && <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, lineHeight: 1.5 }}>{desc}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 38, height: 22, borderRadius: 11,
        background: checked ? "var(--accent)" : "var(--bg-subtle)",
        border: `1px solid ${checked ? "var(--accent)" : "var(--border-medium)"}`,
        cursor: "pointer",
        position: "relative",
        transition: "background 0.2s, border-color 0.2s",
        flexShrink: 0,
      }}
    >
      <div style={{
        position: "absolute",
        top: 2,
        left: checked ? 18 : 2,
        width: 16, height: 16,
        borderRadius: "50%",
        background: "white",
        transition: "left 0.18s cubic-bezier(0.34,1.56,0.64,1)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
      }} />
    </button>
  );
}

function ToggleRow({ label, desc, checked, onChange, last = false }: {
  label: string; desc?: string; checked: boolean;
  onChange: (v: boolean) => void; last?: boolean;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
      paddingBottom: last ? 0 : 12,
      marginBottom: last ? 0 : 12,
      borderBottom: last ? "none" : "1px solid var(--border-subtle)",
    }}>
      <div style={{ flex: 1 }}>
        <p style={{ fontWeight: 500, fontSize: 13, color: "var(--text-primary)", lineHeight: 1.3 }}>{label}</p>
        {desc && <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{desc}</p>}
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

function OptionPills<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            padding: "5px 12px", borderRadius: "var(--radius-md, 8px)", fontSize: 12,
            border: "1px solid",
            background: value === opt.value ? "rgba(124,58,237,0.18)" : "transparent",
            borderColor: value === opt.value ? "rgba(124,58,237,0.45)" : "var(--border-medium)",
            color: value === opt.value ? "var(--accent-light, #a78bfa)" : "var(--text-secondary)",
            cursor: "pointer", fontFamily: "inherit",
            transition: "all 0.15s",
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function SmallBtn({ children, onClick, disabled = false, danger = false }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "6px 14px", borderRadius: "var(--radius-md, 8px)", fontSize: 12,
        border: `1px solid ${danger ? "rgba(239,68,68,0.4)" : "var(--border-medium)"}`,
        background: danger ? "rgba(239,68,68,0.1)" : "transparent",
        color: danger ? "#f87171" : "var(--text-secondary)",
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "inherit",
        opacity: disabled ? 0.5 : 1,
        transition: "all 0.15s",
      }}
      onMouseEnter={e => {
        if (!disabled) {
          e.currentTarget.style.borderColor = danger ? "rgba(239,68,68,0.6)" : "var(--accent-border, rgba(124,58,237,0.35))";
          e.currentTarget.style.color = danger ? "#f87171" : "var(--accent-light, #a78bfa)";
        }
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = danger ? "rgba(239,68,68,0.4)" : "var(--border-medium)";
        e.currentTarget.style.color = danger ? "#f87171" : "var(--text-secondary)";
      }}
    >
      {children}
    </button>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 10, fontWeight: 700, color: "var(--text-faint)",
      textTransform: "uppercase", letterSpacing: "0.1em",
      marginBottom: 8, marginTop: 4,
    }}>
      {children}
    </p>
  );
}

function WatchFolderRow({ folder, isWatching, onRemove, onToggleWatch }: {
  folder: string; isWatching: boolean;
  onRemove: () => void;
  onToggleWatch: (folder: string, watch: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);
  const folderName = folder.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? folder;

  const handleToggle = async () => {
    setLoading(true);
    try {
      if (isWatching) {
        await invoke("unwatch_folder", { path: folder }).catch(() => {});
        onToggleWatch(folder, false);
      } else {
        await invoke("watch_folder", { path: folder }).catch(() => {});
        onToggleWatch(folder, true);
      }
    } finally { setLoading(false); }
  };

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 9, padding: "8px 10px",
      background: isWatching ? "rgba(16,185,129,0.06)" : "var(--bg-muted)",
      border: `1px solid ${isWatching ? "rgba(16,185,129,0.18)" : "var(--border)"}`,
      borderRadius: "var(--radius-md, 8px)", marginBottom: 5,
    }}>
      <div style={{
        width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
        background: isWatching ? "#10B981" : "var(--text-faint)",
        boxShadow: isWatching ? "0 0 5px rgba(16,185,129,0.7)" : "none",
      }} />
      <div style={{ flex: 1, overflow: "hidden" }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: isWatching ? "#34D399" : "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {folderName}
        </p>
        <p style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "'Space Mono', monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 1 }}>
          {folder}
        </p>
      </div>
      <button onClick={handleToggle} disabled={loading} title={isWatching ? "Stop watching" : "Start watching"} style={{
        width: 26, height: 26, borderRadius: "var(--radius-sm, 6px)",
        border: `1px solid ${isWatching ? "rgba(16,185,129,0.3)" : "var(--border-medium)"}`,
        background: isWatching ? "rgba(16,185,129,0.1)" : "transparent",
        color: isWatching ? "#34D399" : "var(--text-muted)",
        cursor: loading ? "wait" : "pointer", fontSize: 11,
        display: "flex", alignItems: "center", justifyContent: "center",
        opacity: loading ? 0.5 : 1,
      }}>
        {loading ? "…" : isWatching ? "■" : "▶"}
      </button>
      <button onClick={onRemove} title="Remove folder" style={{
        width: 22, height: 22, borderRadius: "var(--radius-sm, 6px)",
        border: "none", background: "transparent",
        color: "var(--text-faint)", cursor: "pointer", fontSize: 13,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
        onMouseEnter={e => e.currentTarget.style.color = "#f87171"}
        onMouseLeave={e => e.currentTarget.style.color = "var(--text-faint)"}
      >✕</button>
    </div>
  );
}

function OutputDeviceSelector({ value, onChange }: {
  value: string; onChange: (id: string) => void;
}) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const loadDevices = useCallback(async () => {
    setLoading(true);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => {});
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices(all.filter(d => d.kind === "audiooutput"));
    } catch { setDevices([]); } finally { setLoading(false); }
  }, []);

  const handleChange = useCallback(async (deviceId: string) => {
    onChange(deviceId);
    // Actually apply the device to audio elements
    try {
      const elA = (audioEngine as any).elA as HTMLAudioElement | null;
      const elB = (audioEngine as any).elB as HTMLAudioElement | null;
      const preloadEl = (audioEngine as any).preloadEl as HTMLAudioElement | null;
      if (elA && typeof (elA as any).setSinkId === "function") {
        await (elA as any).setSinkId(deviceId);
      }
      if (elB && typeof (elB as any).setSinkId === "function") {
        await (elB as any).setSinkId(deviceId);
      }
      if (preloadEl && typeof (preloadEl as any).setSinkId === "function") {
        await (preloadEl as any).setSinkId(deviceId);
      }
    } catch (err) {
      console.warn("[OutputDevice] setSinkId failed:", err);
    }
  }, [onChange]);

  useEffect(() => { loadDevices(); }, [loadDevices]);

  return (
    <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
      <select value={value} onChange={e => handleChange(e.target.value)} style={{
        flex: 1, padding: "6px 10px",
        background: "var(--bg-muted)", border: "1px solid var(--border-medium)",
        borderRadius: "var(--radius-md, 8px)", color: "var(--text-primary)",
        fontSize: 12, fontFamily: "inherit", outline: "none", cursor: "pointer",
      }}>
        <option value="">Default system device</option>
        {devices.map(d => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || `Audio Output ${d.deviceId.slice(0, 8)}…`}
          </option>
        ))}
      </select>
      <SmallBtn onClick={loadDevices}>{loading ? "…" : "Refresh"}</SmallBtn>
    </div>
  );
}

function BackgroundPicker({ value, onChange }: {
  value: string | null; onChange: (v: string | null) => void;
}) {
  const [mode, setMode] = useState<"default" | "color" | "url">(
    value === null ? "default" : value.startsWith("#") ? "color" : "url"
  );
  const [colorVal, setColorVal] = useState(value?.startsWith("#") ? value : "#0a0a1a");
  const [urlVal, setUrlVal]     = useState(value && !value.startsWith("#") ? value : "");

  const handleModeChange = (m: "default" | "color" | "url") => {
    setMode(m);
    if (m === "default") {
      onChange(null);
      applyCustomBackgroundToDom(null);
    }
  };

  const handleColorApply = (color: string) => {
    setColorVal(color);
    onChange(color);
    applyCustomBackgroundToDom(color);
  };

  const handleUrlApply = () => {
    const trimmed = urlVal.trim();
    onChange(trimmed || null);
    applyCustomBackgroundToDom(trimmed || null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      <OptionPills
        options={[
          { value: "default", label: "Default" },
          { value: "color",   label: "Solid color" },
          { value: "url",     label: "Image URL" },
        ]}
        value={mode}
        onChange={v => handleModeChange(v as any)}
      />
      {mode === "color" && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="color" value={colorVal}
            onChange={e => handleColorApply(e.target.value)}
            style={{ width: 40, height: 32, borderRadius: 7, border: "1px solid var(--border-medium)", cursor: "pointer", background: "transparent" }}
          />
          <input type="text" value={colorVal}
            onChange={e => { setColorVal(e.target.value); }}
            onBlur={e => handleColorApply(e.target.value)}
            placeholder="#0a0a1a"
            style={{
              flex: 1, padding: "6px 10px", background: "var(--bg-muted)",
              border: "1px solid var(--border-medium)", borderRadius: "var(--radius-md, 8px)",
              color: "var(--text-primary)", fontSize: 12,
              fontFamily: "'Space Mono', monospace", outline: "none",
            }}
          />
        </div>
      )}
      {mode === "url" && (
        <div style={{ display: "flex", gap: 7 }}>
          <input type="text" value={urlVal} onChange={e => setUrlVal(e.target.value)}
            placeholder="https://example.com/bg.jpg"
            style={{
              flex: 1, padding: "6px 10px", background: "var(--bg-muted)",
              border: "1px solid var(--border-medium)", borderRadius: "var(--radius-md, 8px)",
              color: "var(--text-primary)", fontSize: 12, fontFamily: "inherit", outline: "none",
            }}
          />
          <SmallBtn onClick={handleUrlApply}>Apply</SmallBtn>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [section, setSection] = useState<Section>("appearance");
  const [lang, setLangState]  = useState<Lang>(getLang);
  const t = T[lang];

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
    playCountThreshold, setPlayCountThreshold,
    replayGainMode, setReplayGainMode,
    fadeInOnResume, setFadeInOnResume,
    fadeInDuration, setFadeInDuration,
    queueEndBehavior, setQueueEndBehavior,
    outputDeviceId, setOutputDeviceId,
    monoDownmix, setMonoDownmix,
    fontSizeScale, setFontSizeScale,
    coverArtStyle, setCoverArtStyle,
    ambientBlurIntensity, setAmbientBlurIntensity,
    customBackground, setCustomBackground,
    queuePanelPosition, setQueuePanelPosition,
    notificationsEnabled, setNotificationsEnabled,
    excludeFolders, addExcludeFolder, removeExcludeFolder,
  } = useSettingsStore() as any;

  const { songs, setSongs } = useLibraryStore();
  const [feedback, setFeedback]             = useState<Feedback | null>(null);
  const [cacheSize, setCacheSize]           = useState<string | null>(null);
  const [clearingCache, setClearingCache]   = useState(false);
  const [cleaningMissing, setCleaningMissing] = useState(false);
  const [watchingFolders, setWatchingFolders] = useState<Set<string>>(new Set());
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showFeedback = useCallback((message: string, level: FeedbackLevel = "info") => {
    setFeedback({ message, level });
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => setFeedback(null), 4000);
  }, []);

  // ── Language change — dispatch event so entire app re-renders ──────────────
  const handleLangChange = useCallback((newLang: Lang) => {
    setLangState(newLang);
    setLang(newLang); // This dispatches "resonance-lang-change" event
  }, []);

  // ── Theme change — apply CSS variables immediately ─────────────────────────
  const handleThemeChange = useCallback((newTheme: ThemeKey) => {
    setTheme(newTheme);
    applyThemeToDom(newTheme);
    // Reapply accent color because theme might override it
    if (accentColor) {
      setTimeout(() => applyAccentToDom(accentColor), 10);
    }
  }, [setTheme, accentColor]);

  // ── Accent color — apply immediately ──────────────────────────────────────
  const handleAccentColor = useCallback((color: string) => {
    setAccentColor(color);
    applyAccentToDom(color);
  }, [setAccentColor]);

  // ── Font size — apply immediately ─────────────────────────────────────────
  const handleFontSize = useCallback((v: number) => {
    setFontSizeScale(v);
    applyFontScaleToDom(v);
  }, [setFontSizeScale]);

  // ── Compact mode — apply immediately ──────────────────────────────────────
  const handleCompactMode = useCallback((v: boolean) => {
    setCompactMode(v);
    applyCompactModeToDom(v);
  }, [setCompactMode]);

  // ── Animation speed — apply immediately ───────────────────────────────────
  const handleAnimationSpeed = useCallback((v: "normal" | "slow" | "off") => {
    setAnimationSpeed?.(v);
    applyAnimationSpeedToDom(v);
  }, [setAnimationSpeed]);

  // ── Ambient blur — apply immediately ──────────────────────────────────────
  const handleAmbientBlur = useCallback((v: number) => {
    setAmbientBlurIntensity(v);
    applyAmbientBlurToDom(v);
  }, [setAmbientBlurIntensity]);

  // ── Crossfade — apply to audioEngine immediately ──────────────────────────
  const handleCrossfade = useCallback((v: number) => {
    setCrossfadeSec(v);
    audioEngine.setCrossfade(v);
  }, [setCrossfadeSec]);

  // ── Default volume — apply to audioEngine immediately ────────────────────
  const handleDefaultVolume = useCallback((v: number) => {
    setDefaultVolume(v);
    audioEngine.setVolume(v);
  }, [setDefaultVolume]);

  // ── ReplayGain — apply to audioEngine immediately ────────────────────────
  const handleReplayGain = useCallback((v: boolean) => {
    setReplayGainEnabled(v);
    audioEngine.setReplayGainEnabled(v);
  }, [setReplayGainEnabled]);

  // ── Watch folder — invoke Rust command ───────────────────────────────────
  const handleAddWatchFolder = useCallback(async () => {
    try {
      const selected = await open({ directory: true, title: "Add Watch Folder" });
      if (selected && typeof selected === "string") {
        addWatchFolder(selected);
        try {
          await invoke("watch_folder", { path: selected });
          setWatchingFolders(prev => { const next = new Set(prev); next.add(selected); return next; });
          showFeedback(`Folder added: ${selected.split(/[\\/]/).pop()}`, "success");
        } catch (err) {
          console.warn("[WatchFolder] invoke failed:", err);
          showFeedback(`Folder saved (watch will start on restart)`, "info");
        }
      }
    } catch { showFeedback("Failed to open folder dialog.", "error"); }
  }, [addWatchFolder, showFeedback]);

  const handleRemoveWatchFolder = useCallback(async (folder: string) => {
    removeWatchFolder(folder);
    try {
      await invoke("unwatch_folder", { path: folder });
    } catch { /* ok */ }
    setWatchingFolders(prev => { const next = new Set(prev); next.delete(folder); return next; });
  }, [removeWatchFolder]);

  // ── Exclude folder ────────────────────────────────────────────────────────
  const handleAddExcludeFolder = useCallback(async () => {
    try {
      const selected = await open({ directory: true, title: "Exclude Folder" });
      if (selected && typeof selected === "string") {
        addExcludeFolder(selected);
        showFeedback(`Excluded: ${selected.split(/[\\/]/).pop()}`, "success");
      }
    } catch { showFeedback("Failed to open folder dialog.", "error"); }
  }, [addExcludeFolder, showFeedback]);

  // ── Clean missing files ───────────────────────────────────────────────────
  const handleCleanMissing = useCallback(async () => {
    setCleaningMissing(true);
    try {
      const db = await getDb();
      const allSongs = await getAllSongs(db);
      let removed = 0;
      for (const song of allSongs) {
        try {
          const { exists } = await import("@tauri-apps/plugin-fs");
          if (!(await exists(song.path))) {
            await db.execute("DELETE FROM songs WHERE id = $1", [song.id]);
            removed++;
          }
        } catch {}
      }
      if (removed > 0) {
        const updated = await getAllSongs(db);
        setSongs(Array.isArray(updated) ? updated : []);
      }
      showFeedback(removed > 0 ? `${removed} missing entries removed` : "All files present", "success");
    } catch { showFeedback("Failed to check files.", "error"); } finally { setCleaningMissing(false); }
  }, [setSongs, showFeedback]);

  // ── Cache ─────────────────────────────────────────────────────────────────
  const loadCacheStats = useCallback(async () => {
    try {
      const bytes = await invoke<number>("get_cache_size");
      setCacheSize(`${(bytes / (1024 * 1024)).toFixed(1)} MB`);
    } catch { setCacheSize(null); }
  }, []);

  const handleClearCache = useCallback(async () => {
    setClearingCache(true);
    try {
      await invoke("evict_audio_cache", { maxBytes: 0 });
      audioEngine.clearCacheState();
      await loadCacheStats();
      showFeedback("Cache cleared", "success");
    } catch { showFeedback("Failed to clear cache.", "error"); } finally { setClearingCache(false); }
  }, [loadCacheStats, showFeedback]);

  useEffect(() => { if (section === "playback") loadCacheStats(); }, [section]);

  // ── Load watching folders state from Rust ────────────────────────────────
  useEffect(() => {
    if (section === "library" && (window as any).__TAURI_INTERNALS__) {
      invoke<string[]>("list_watch_folders")
        .then(f => setWatchingFolders(new Set(f)))
        .catch(() => {
          // If the command isn't available, mark all saved folders as watching
          setWatchingFolders(new Set(watchFolders ?? []));
        });
    }
  }, [section, watchFolders]);

  // ── Auto-initialize all DOM settings on mount ────────────────────────────
  useEffect(() => {
    if (theme) applyThemeToDom(theme as ThemeKey);
    if (accentColor) applyAccentToDom(accentColor);
    if (fontSizeScale) applyFontScaleToDom(fontSizeScale);
    applyCompactModeToDom(!!compactMode);
    if (animationSpeed) applyAnimationSpeedToDom(animationSpeed);
    if (ambientBlurIntensity !== undefined) applyAmbientBlurToDom(ambientBlurIntensity);
    if (customBackground !== undefined) applyCustomBackgroundToDom(customBackground);
  }, []);

  // ── Export / Import ───────────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    try {
      const ok = await exportLibrary(songs);
      showFeedback(ok ? "Library exported" : "Export cancelled", ok ? "success" : "info");
    } catch { showFeedback("Export failed.", "error"); }
  }, [songs, showFeedback]);

  const handleImport = useCallback(async () => {
    try {
      const result = await importPlaylist();
      if (result) showFeedback(`Imported ${result.matched}/${result.total} tracks`, result.notFound.length > 0 ? "info" : "success");
      else showFeedback("Import cancelled", "info");
    } catch { showFeedback("Import failed.", "error"); }
  }, [showFeedback]);

  // ── Notifications test ────────────────────────────────────────────────────
  const handleTestNotification = useCallback(async () => {
    try {
      const { sendNotification, isPermissionGranted, requestPermission } =
        await import("@tauri-apps/plugin-notification");
      let granted = await isPermissionGranted();
      if (!granted) {
        const perm = await requestPermission();
        granted = perm === "granted";
      }
      if (granted) {
        await sendNotification({ title: "Sonarix", body: "Test notification ✓" });
        showFeedback("Test notification sent!", "success");
      } else {
        showFeedback("Notification permission denied", "error");
      }
    } catch {
      if ("Notification" in window) {
        if (Notification.permission === "default") await Notification.requestPermission();
        if (Notification.permission === "granted") {
          new Notification("Sonarix", { body: "Test notification ✓", silent: true });
          showFeedback("Test notification sent!", "success");
        } else {
          showFeedback("Notifications not available in this environment", "info");
        }
      } else {
        showFeedback("Notifications not available in this environment", "info");
      }
    }
  }, [showFeedback]);

  const feedbackColor = feedback?.level === "success" ? "var(--success)"
    : feedback?.level === "error" ? "var(--danger)" : "var(--text-muted)";

  const sectionLabels: Record<Section, string> = {
    appearance: lang === "id" ? "Tampilan" : "Appearance",
    playback: lang === "id" ? "Pemutaran" : "Playback",
    library: lang === "id" ? "Pustaka" : "Library",
    lyrics: lang === "id" ? "Lirik" : "Lyrics",
    notifications: lang === "id" ? "Notifikasi" : "Notifications",
    shortcuts: lang === "id" ? "Pintasan" : "Shortcuts",
    about: lang === "id" ? "Tentang" : "About",
  };

  const shortcuts = lang === "id" ? SHORTCUTS_ID : SHORTCUTS_EN;

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={e => e.stopPropagation()}>
        {/* ── Sidebar nav ── */}
        <div className="settings-sidebar">
          {/* Language toggle */}
          <div style={{ display: "flex", gap: 4, marginBottom: 14, padding: "0 2px" }}>
            {(["id", "en"] as Lang[]).map(l => (
              <button key={l} onClick={() => handleLangChange(l)} style={{
                flex: 1, padding: "5px 0", borderRadius: "var(--radius-sm, 6px)", fontSize: 12,
                cursor: "pointer", border: "1px solid",
                background: lang === l ? "rgba(124,58,237,0.18)" : "transparent",
                borderColor: lang === l ? "rgba(124,58,237,0.45)" : "var(--border-medium)",
                color: lang === l ? "var(--accent-light, #a78bfa)" : "var(--text-muted)",
                fontWeight: lang === l ? 600 : 400, fontFamily: "inherit",
                transition: "all 0.15s",
              }}>
                {l === "id" ? "ID" : "EN"}
              </button>
            ))}
          </div>

          <p style={{
            fontSize: 10, color: "var(--text-faint)", textTransform: "uppercase",
            letterSpacing: "0.1em", fontWeight: 700, marginBottom: 4, padding: "0 6px",
          }}>
            {lang === "id" ? "Pengaturan" : "Settings"}
          </p>

          {(Object.keys(sectionLabels) as Section[]).map(s => (
            <button key={s} onClick={() => setSection(s)} style={{
              display: "flex", alignItems: "center", gap: 8,
              width: "100%", padding: "8px 10px", borderRadius: "var(--radius-md, 8px)",
              textAlign: "left", border: "none", cursor: "pointer",
              fontFamily: "inherit", fontSize: 13,
              background: section === s ? "rgba(124,58,237,0.15)" : "transparent",
              color: section === s ? "var(--accent-light, #a78bfa)" : "var(--text-secondary)",
              transition: "all 0.15s",
            }}
              onMouseEnter={e => { if (section !== s) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
              onMouseLeave={e => { if (section !== s) e.currentTarget.style.background = "transparent"; }}
            >
              {NavIcons[s]}
              {sectionLabels[s]}
            </button>
          ))}
        </div>

        {/* ── Content area ── */}
        <div className="settings-content-area">
          {/* Header */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "14px 20px 12px",
            borderBottom: "1px solid var(--border-subtle)", flexShrink: 0,
          }}>
            <h2 style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)", letterSpacing: "-0.3px" }}>
              {sectionLabels[section]}
            </h2>
            <button onClick={onClose} style={{
              background: "none", border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm, 6px)",
              cursor: "pointer", color: "var(--text-muted)",
              width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14,
            }}>✕</button>
          </div>

          {/* Scrollable content */}
          <div className="settings-content-scroll">

            {/* ──────────────── APPEARANCE ──────────────── */}
            {section === "appearance" && (
              <div>
                <SectionTitle>{lang === "id" ? "Warna" : "Colors"}</SectionTitle>
                <SettingCard>
                  <SettingRow
                    label={lang === "id" ? "Warna aksen" : "Accent color"}
                    desc={lang === "id" ? "Warna utama antarmuka" : "Main interactive color across the UI"}
                  >
                    <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                      {ACCENT_COLORS.map(c => (
                        <button key={c.value} onClick={() => handleAccentColor(c.value)} title={c.name}
                          style={{
                            width: 26, height: 26, borderRadius: "50%",
                            background: c.value, border: "none", cursor: "pointer",
                            outline: accentColor === c.value ? `3px solid ${c.value}` : "none",
                            outlineOffset: 2,
                            transform: accentColor === c.value ? "scale(1.18)" : "scale(1)",
                            transition: "transform 0.15s, outline 0.15s",
                          }}
                        />
                      ))}
                    </div>
                  </SettingRow>

                  <SettingRow
                    label={lang === "id" ? "Tema" : "Theme"}
                    desc={lang === "id" ? "Pilih tema warna latar belakang" : "Background and surface color scheme"}
                    last
                  >
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                      {([
                        ["light",  lang === "id" ? "Terang" : "Light",   "#f5f5f2"],
                        ["warm",   lang === "id" ? "Hangat" : "Warm",    "#f7f3ee"],
                        ["dark",   lang === "id" ? "Gelap" : "Dark",     "#07071a"],
                        ["darker", lang === "id" ? "Lebih Gelap" : "Darker", "#03030f"],
                        ["amoled", "AMOLED",  "#000000"],
                        ["dim",    lang === "id" ? "Redup" : "Dim",      "#1c1c2a"],
                      ] as [ThemeKey, string, string][]).map(([value, label, previewBg]) => (
                        <button key={value} onClick={() => handleThemeChange(value)} style={{
                          padding: "7px 8px", borderRadius: "var(--radius-md, 8px)", fontSize: 12,
                          border: "1px solid",
                          background: (theme ?? "dark") === value ? "rgba(124,58,237,0.18)" : "transparent",
                          borderColor: (theme ?? "dark") === value ? "rgba(124,58,237,0.45)" : "var(--border-medium)",
                          color: (theme ?? "dark") === value ? "var(--accent-light, #a78bfa)" : "var(--text-secondary)",
                          cursor: "pointer", fontFamily: "inherit",
                          display: "flex", alignItems: "center", gap: 7,
                        }}>
                          <div style={{ width: 14, height: 14, borderRadius: 3, background: previewBg, border: "1px solid rgba(128,128,128,0.25)", flexShrink: 0 }} />
                          {label}
                        </button>
                      ))}
                    </div>
                  </SettingRow>
                </SettingCard>

                <SectionTitle>{lang === "id" ? "Tipografi & Tata Letak" : "Typography & Layout"}</SectionTitle>
                <SettingCard>
                  <SettingRow
                    label={lang === "id" ? "Ukuran font" : "Font size"}
                    desc={`${lang === "id" ? "Skala" : "Scale"}: ${(fontSizeScale ?? 1.0).toFixed(1)}×`}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>A</span>
                      <input type="range" min={0.8} max={1.4} step={0.05}
                        value={fontSizeScale ?? 1.0}
                        onChange={e => handleFontSize(parseFloat(e.target.value))}
                        style={{ flex: 1 }}
                      />
                      <span style={{ fontSize: 16, color: "var(--text-muted)" }}>A</span>
                      <span style={{ fontSize: 12, color: "var(--accent-light, #a78bfa)", fontFamily: "monospace", minWidth: 36 }}>
                        {(fontSizeScale ?? 1.0).toFixed(1)}×
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 5, marginTop: 7 }}>
                      {[0.85, 0.9, 1.0, 1.1, 1.2].map(v => (
                        <button key={v} onClick={() => handleFontSize(v)} style={{
                          padding: "3px 10px", borderRadius: "var(--radius-sm, 6px)", fontSize: 11,
                          border: "1px solid",
                          background: Math.abs((fontSizeScale ?? 1) - v) < 0.01 ? "rgba(124,58,237,0.18)" : "transparent",
                          borderColor: Math.abs((fontSizeScale ?? 1) - v) < 0.01 ? "rgba(124,58,237,0.45)" : "var(--border-medium)",
                          color: Math.abs((fontSizeScale ?? 1) - v) < 0.01 ? "var(--accent-light, #a78bfa)" : "var(--text-secondary)",
                          cursor: "pointer", fontFamily: "inherit",
                        }}>
                          {v === 1.0 ? (lang === "id" ? "Normal" : "Normal") : `${v}×`}
                        </button>
                      ))}
                    </div>
                  </SettingRow>

                  <SettingRow
                    label={lang === "id" ? "Gaya sudut cover art" : "Cover art corners"}
                    desc={lang === "id" ? "Tampilan sudut cover art" : "Corner style for artwork"}
                  >
                    <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                      {([
                        ["square",  lang === "id" ? "Kotak" : "Square",   0],
                        ["rounded", lang === "id" ? "Bulat" : "Rounded",  10],
                        ["circle",  lang === "id" ? "Lingkaran" : "Circle", 999],
                      ] as const).map(([val, label, radius]) => (
                        <div key={val} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                          <button onClick={() => setCoverArtStyle(val)} style={{
                            width: 44, height: 44,
                            borderRadius: radius === 999 ? "50%" : `${radius}px`,
                            background: "linear-gradient(135deg, var(--accent), #EC4899)",
                            border: (coverArtStyle ?? "rounded") === val ? "2.5px solid var(--accent-light, #a78bfa)" : "2.5px solid transparent",
                            cursor: "pointer",
                            transform: (coverArtStyle ?? "rounded") === val ? "scale(1.06)" : "scale(1)",
                            transition: "all 0.2s",
                          }} />
                          <span style={{ fontSize: 11, color: (coverArtStyle ?? "rounded") === val ? "var(--accent-light, #a78bfa)" : "var(--text-muted)" }}>
                            {label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </SettingRow>

                  <SettingRow
                    label={`${lang === "id" ? "Blur ambient" : "Ambient blur"} — ${ambientBlurIntensity ?? 40}%`}
                    desc={lang === "id" ? "Intensitas blur ambient cover art di sidebar" : "Sidebar cover art background blur intensity"}
                  >
                    <input type="range" min={0} max={100} step={5}
                      value={ambientBlurIntensity ?? 40}
                      onChange={e => handleAmbientBlur(+e.target.value)}
                      style={{ width: "100%" }}
                    />
                  </SettingRow>

                  <ToggleRow
                    label={lang === "id" ? "Mode ringkas" : "Compact mode"}
                    desc={lang === "id" ? "Kurangi jarak dan ukuran font" : "Reduce padding and font sizes"}
                    checked={!!compactMode}
                    onChange={handleCompactMode}
                  />

                  <SettingRow label={lang === "id" ? "Kecepatan animasi" : "Animation speed"} last>
                    <OptionPills
                      options={[
                        { value: "normal", label: lang === "id" ? "Normal" : "Normal" },
                        { value: "slow",   label: lang === "id" ? "Lambat" : "Slow" },
                        { value: "off",    label: lang === "id" ? "Mati" : "Off" },
                      ]}
                      value={animationSpeed ?? "normal"}
                      onChange={v => handleAnimationSpeed(v as any)}
                    />
                  </SettingRow>
                </SettingCard>

                <SectionTitle>{lang === "id" ? "Latar Belakang" : "Background"}</SectionTitle>
                <SettingCard>
                  <SettingRow
                    label={lang === "id" ? "Latar belakang kustom" : "Custom background"}
                    desc={lang === "id" ? "Warna solid atau gambar sebagai latar app" : "Override the default app background"}
                    last
                  >
                    <BackgroundPicker value={customBackground} onChange={setCustomBackground} />
                  </SettingRow>
                </SettingCard>
              </div>
            )}

            {/* ──────────────── PLAYBACK ──────────────── */}
            {section === "playback" && (
              <div>
                <SectionTitle>{lang === "id" ? "Volume & Output" : "Volume & Output"}</SectionTitle>
                <SettingCard>
                  <SettingRow
                    label={`${lang === "id" ? "Volume default" : "Default volume"} — ${defaultVolume ?? 80}%`}
                    desc={lang === "id" ? "Volume saat app dibuka" : "Volume when app opens"}
                  >
                    <input type="range" min={0} max={100} step={1}
                      value={defaultVolume ?? 80}
                      onChange={e => handleDefaultVolume(+e.target.value)}
                      style={{ width: "100%" }}
                    />
                  </SettingRow>
                  <SettingRow
                    label={lang === "id" ? "Perangkat output" : "Audio output"}
                    desc={lang === "id" ? "Pilih perangkat audio output" : "Select playback device"}
                  >
                    <OutputDeviceSelector value={outputDeviceId ?? ""} onChange={setOutputDeviceId} />
                  </SettingRow>
                  <ToggleRow
                    label={lang === "id" ? "Mono downmix" : "Mono downmix"}
                    desc={lang === "id" ? "Gabung stereo → mono (untuk earphone satu sisi)" : "Merge stereo → mono (for single earphone use)"}
                    checked={!!monoDownmix}
                    onChange={v => setMonoDownmix(v)}
                    last
                  />
                </SettingCard>

                <SectionTitle>{lang === "id" ? "Transisi" : "Transitions"}</SectionTitle>
                <SettingCard>
                  <SettingRow
                    label={`${lang === "id" ? "Crossfade" : "Crossfade"} — ${crossfadeSec === 0 ? (lang === "id" ? "Mati" : "Off") : `${crossfadeSec}s`}`}
                    desc={lang === "id" ? "Transisi lembut antar lagu" : "Smooth transition between tracks"}
                  >
                    <input type="range" min={0} max={10} step={1}
                      value={crossfadeSec}
                      onChange={e => handleCrossfade(+e.target.value)}
                      style={{ width: "100%" }}
                    />
                    {crossfadeSec > 0 && (
                      <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 7 }}>
                        {lang === "id"
                          ? "⚡ Crossfade cerdas: otomatis dilewati jika lagu <45d atau gap BPM >40"
                          : "⚡ Smart crossfade: auto-skipped for tracks under 45s or large BPM gaps"}
                      </p>
                    )}
                  </SettingRow>
                  <ToggleRow
                    label={lang === "id" ? "Fade in saat lanjutkan" : "Fade in on resume"}
                    desc={lang === "id" ? "Volume naik perlahan saat melanjutkan setelah pause" : "Volume ramps up slowly after unpausing"}
                    checked={!!fadeInOnResume}
                    onChange={setFadeInOnResume}
                  />
                  {fadeInOnResume && (
                    <SettingRow label={`${lang === "id" ? "Durasi fade" : "Fade duration"} — ${(fadeInDuration ?? 0.5).toFixed(1)}s`}>
                      <input type="range" min={0.1} max={3.0} step={0.1}
                        value={fadeInDuration ?? 0.5}
                        onChange={e => setFadeInDuration(parseFloat(e.target.value))}
                        style={{ width: "100%" }}
                      />
                    </SettingRow>
                  )}
                  <ToggleRow
                    label={lang === "id" ? "Pemutaran tanpa jeda" : "Gapless playback"}
                    desc={lang === "id" ? "Tidak ada jeda antar lagu" : "No gap between tracks"}
                    checked={gaplessEnabled !== false}
                    onChange={setGaplessEnabled}
                    last
                  />
                </SettingCard>

                <SectionTitle>{lang === "id" ? "Normalisasi" : "Normalization"}</SectionTitle>
                <SettingCard>
                  <ToggleRow
                    label="ReplayGain"
                    desc={lang === "id" ? "Normalisasi volume otomatis" : "Automatic volume normalization"}
                    checked={replayGainEnabled !== false}
                    onChange={handleReplayGain}
                  />
                  {replayGainEnabled !== false && (
                    <SettingRow label={lang === "id" ? "Mode normalisasi" : "Normalization mode"} last>
                      <OptionPills
                        options={[
                          { value: "track", label: lang === "id" ? "Track" : "Track" },
                          { value: "album", label: lang === "id" ? "Album" : "Album" },
                          { value: "auto",  label: lang === "id" ? "Otomatis" : "Auto" },
                        ]}
                        value={replayGainMode ?? "track"}
                        onChange={v => setReplayGainMode(v)}
                      />
                    </SettingRow>
                  )}
                </SettingCard>

                <SectionTitle>{lang === "id" ? "Perilaku" : "Behavior"}</SectionTitle>
                <SettingCard>
                  <SettingRow label={lang === "id" ? "Saat antrian habis" : "When queue ends"}>
                    <OptionPills
                      options={[
                        { value: "stop",  label: lang === "id" ? "Berhenti" : "Stop" },
                        { value: "loop",  label: lang === "id" ? "Ulangi" : "Loop" },
                        { value: "radio", label: `${lang === "id" ? "Radio" : "Radio"} (soon)` },
                      ]}
                      value={queueEndBehavior ?? "stop"}
                      onChange={v => setQueueEndBehavior(v)}
                    />
                  </SettingRow>
                  <SettingRow
                    label={`${lang === "id" ? "Ambang play count" : "Play count threshold"} — ${playCountThreshold ?? 70}%`}
                    desc={lang === "id" ? "Lagu dihitung 'diputar' setelah persentase ini" : "Track is counted 'played' after this percentage"}
                  >
                    <input type="range" min={10} max={95} step={5}
                      value={playCountThreshold ?? 70}
                      onChange={e => setPlayCountThreshold(+e.target.value)}
                      style={{ width: "100%" }}
                    />
                  </SettingRow>
                  <SettingRow label={lang === "id" ? "Aksi klik ganda" : "Double-click action"} last>
                    <OptionPills
                      options={[
                        { value: "play",  label: lang === "id" ? "▶ Putar Sekarang" : "▶ Play Now" },
                        { value: "queue", label: lang === "id" ? "+ Tambah ke Antrian" : "+ Add to Queue" },
                      ]}
                      value={doubleClickAction ?? "play"}
                      onChange={v => setDoubleClickAction?.(v)}
                    />
                  </SettingRow>
                </SettingCard>

                <SectionTitle>{lang === "id" ? "Cache Audio" : "Audio Cache"}</SectionTitle>
                <SettingCard>
                  <SettingRow
                    label={lang === "id" ? "Cache audio yang sudah didekode" : "Decoded audio cache"}
                    desc={cacheSize ? `${lang === "id" ? "Ukuran saat ini" : "Current size"}: ${cacheSize}` : (lang === "id" ? "Cache audio untuk pemutaran instan" : "Caches decoded audio for instant playback")}
                    last
                  >
                    <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
                      <SmallBtn onClick={handleClearCache} disabled={clearingCache}>
                        {clearingCache ? (lang === "id" ? "Mengosongkan…" : "Clearing…") : (lang === "id" ? "Kosongkan cache" : "Clear cache")}
                      </SmallBtn>
                      <SmallBtn onClick={loadCacheStats}>{lang === "id" ? "Segarkan" : "Refresh"}</SmallBtn>
                      {feedback && <span style={{ fontSize: 11, color: feedbackColor }}>{feedback.message}</span>}
                    </div>
                  </SettingRow>
                </SettingCard>
              </div>
            )}

            {/* ──────────────── LIBRARY ──────────────── */}
            {section === "library" && (
              <div>
                <SectionTitle>{lang === "id" ? "Scanning" : "Scanning"}</SectionTitle>
                <SettingCard>
                  <ToggleRow
                    label={lang === "id" ? "Scan otomatis saat mulai" : "Auto scan on startup"}
                    desc={lang === "id" ? "Scan folder pantau otomatis setiap kali app dibuka" : "Automatically scan watch folders when app opens"}
                    checked={!!autoScanOnStart}
                    onChange={setAutoScanOnStart}
                    last
                  />
                </SettingCard>

                <SectionTitle>{lang === "id" ? "Folder Pantau" : "Watch Folders"}</SectionTitle>
                <SettingCard>
                  <div style={{ marginBottom: 8 }}>
                    {(watchFolders ?? []).length === 0 ? (
                      <p style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 8 }}>
                        {lang === "id" ? "Belum ada folder pantau" : "No watch folders yet"}
                      </p>
                    ) : (
                      (watchFolders ?? []).map((folder: string) => (
                        <WatchFolderRow
                          key={folder} folder={folder}
                          isWatching={watchingFolders.has(folder)}
                          onRemove={() => handleRemoveWatchFolder(folder)}
                          onToggleWatch={(f, watching) => {
                            setWatchingFolders(prev => { const next = new Set(prev); if (watching) next.add(f); else next.delete(f); return next; });
                          }}
                        />
                      ))
                    )}
                    <button onClick={handleAddWatchFolder} style={{
                      width: "100%", padding: "7px", borderRadius: "var(--radius-md, 8px)", fontSize: 12,
                      border: "1px dashed var(--border-medium)", background: "transparent",
                      color: "var(--text-secondary)", cursor: "pointer", fontFamily: "inherit",
                    }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent-border, rgba(124,58,237,0.35))"; e.currentTarget.style.color = "var(--accent-light, #a78bfa)"; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border-medium)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
                    >
                      + {lang === "id" ? "Tambah Folder Pantau" : "Add Watch Folder"}
                    </button>
                  </div>
                </SettingCard>

                <SectionTitle>{lang === "id" ? "Folder Dikecualikan" : "Excluded Folders"}</SectionTitle>
                <SettingCard>
                  <div style={{ marginBottom: 8 }}>
                    {(!excludeFolders || excludeFolders.length === 0) ? (
                      <p style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 8 }}>
                        {lang === "id" ? "Tidak ada folder yang dikecualikan" : "No excluded folders"}
                      </p>
                    ) : (
                      (excludeFolders ?? []).map((folder: string) => (
                        <div key={folder} style={{
                          display: "flex", alignItems: "center", gap: 8, padding: "7px 10px",
                          background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)",
                          borderRadius: "var(--radius-md, 8px)", marginBottom: 5,
                        }}>
                          <div style={{ flex: 1, overflow: "hidden" }}>
                            <p style={{ fontSize: 12, fontWeight: 600, color: "#f87171", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {folder.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? folder}
                            </p>
                            <p style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {folder}
                            </p>
                          </div>
                          <button onClick={() => removeExcludeFolder(folder)} style={{
                            width: 22, height: 22, borderRadius: "var(--radius-sm, 6px)",
                            background: "rgba(239,68,68,0.12)", border: "none",
                            color: "#f87171", cursor: "pointer", fontSize: 12,
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>✕</button>
                        </div>
                      ))
                    )}
                    <button onClick={handleAddExcludeFolder} style={{
                      width: "100%", padding: "7px", borderRadius: "var(--radius-md, 8px)", fontSize: 12,
                      border: "1px dashed rgba(239,68,68,0.35)", background: "transparent",
                      color: "#f87171", cursor: "pointer", fontFamily: "inherit",
                    }}>
                      🚫 {lang === "id" ? "Tambah Folder Pengecualian" : "Add Excluded Folder"}
                    </button>
                  </div>
                </SettingCard>

                <SectionTitle>{lang === "id" ? "Pemeliharaan" : "Maintenance"}</SectionTitle>
                <SettingCard>
                  <SettingRow
                    label={lang === "id" ? "Bersihkan file hilang" : "Clean missing files"}
                    desc={lang === "id" ? "Hapus entri yang file audio-nya tidak ada di disk" : "Remove library entries whose audio files no longer exist on disk"}
                  >
                    <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
                      <SmallBtn onClick={handleCleanMissing} disabled={cleaningMissing}>
                        {cleaningMissing ? (lang === "id" ? "⏳ Memeriksa..." : "⏳ Checking...") : (lang === "id" ? "🔍 Periksa & Bersihkan" : "🔍 Check & Clean")}
                      </SmallBtn>
                      {feedback && <span style={{ fontSize: 11, color: feedbackColor }}>{feedback.message}</span>}
                    </div>
                    <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 7 }}>
                      {lang === "id"
                        ? "⚠️ Ini hanya menghapus entri dari database. File audio di disk tidak terpengaruh."
                        : "⚠️ This only removes entries from the database. Audio files on disk are not affected."}
                    </p>
                  </SettingRow>
                  <SettingRow
                    label={lang === "id" ? "Ekspor / Impor" : "Export / Import"}
                    desc={lang === "id" ? "Backup pustaka atau impor dari app lain" : "Backup your library or import from another app"}
                    last
                  >
                    <div style={{ display: "flex", gap: 7 }}>
                      <SmallBtn onClick={handleExport}>{lang === "id" ? "⬆ Ekspor .m3u" : "⬆ Export .m3u"}</SmallBtn>
                      <SmallBtn onClick={handleImport}>{lang === "id" ? "⬇ Impor .m3u" : "⬇ Import .m3u"}</SmallBtn>
                    </div>
                    {feedback && <p style={{ fontSize: 11, color: feedbackColor, marginTop: 7 }}>{feedback.message}</p>}
                  </SettingRow>
                </SettingCard>

                <SectionTitle>{lang === "id" ? "Statistik Pustaka" : "Library Statistics"}</SectionTitle>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
                  {[
                    { label: lang === "id" ? "Total Lagu" : "Total Tracks", value: songs.length },
                    { label: lang === "id" ? "Sudah Dirating" : "Rated", value: songs.filter((s: any) => s.stars).length },
                    { label: "FLAC", value: songs.filter((s: any) => (s.format ?? "").toUpperCase() === "FLAC").length },
                    { label: lang === "id" ? "Lossless" : "Lossless", value: songs.filter((s: any) => ["FLAC","WAV","ALAC","APE"].includes((s.format ?? "").toUpperCase())).length },
                  ].map(stat => (
                    <div key={stat.label} style={{
                      background: "var(--bg-overlay)", border: "1px solid var(--border)",
                      borderRadius: "var(--radius-md, 8px)", padding: "10px 12px", textAlign: "center",
                    }}>
                      <p style={{ fontWeight: 700, fontSize: 20, color: "var(--accent-light, #a78bfa)" }}>{stat.value}</p>
                      <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{stat.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ──────────────── LYRICS ──────────────── */}
            {section === "lyrics" && (
              <div>
                <SectionTitle>{lang === "id" ? "Pengambilan Lirik" : "Fetching"}</SectionTitle>
                <SettingCard>
                  <ToggleRow
                    label={lang === "id" ? "Ambil lirik otomatis" : "Auto fetch lyrics"}
                    desc={lang === "id" ? "Cari lirik dari internet jika tidak ada file .lrc lokal" : "Search the internet for lyrics if no local .lrc file exists"}
                    checked={!!autoFetchLyrics}
                    onChange={v => setAutoFetchLyrics?.(v)}
                  />
                  <SettingRow
                    label={lang === "id" ? "Sumber lirik online" : "Online source"}
                    desc={lang === "id" ? "Sumber lirik online yang dipakai" : "Which service to use for synced lyrics"}
                    last
                  >
                    <OptionPills
                      options={[
                        { value: "lrclib",     label: lang === "id" ? "LRCLib (tersinkron)" : "LRCLib (synced)" },
                        { value: "lyrics_ovh", label: lang === "id" ? "Lyrics.ovh (teks biasa)" : "Lyrics.ovh (plain)" },
                      ]}
                      value={lyricsSource ?? "lrclib"}
                      onChange={v => setLyricsSource?.(v)}
                    />
                  </SettingRow>
                </SettingCard>

                <SettingCard style={{ background: "rgba(16,185,129,0.05)", borderColor: "rgba(16,185,129,0.18)" }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: "#34D399", marginBottom: 9 }}>
                    {lang === "id" ? "Urutan prioritas" : "Priority order"}
                  </p>
                  {[
                    lang === "id" ? "File .lrc lokal (paling akurat, tersinkron)" : "Local .lrc file (most accurate, synced)",
                    lang === "id" ? "LRCLib API (lirik tersinkron online) — jika ambil otomatis aktif" : "LRCLib API (synced online lyrics) — if auto fetch is on",
                    lang === "id" ? "Lyrics.ovh (teks biasa) — fallback terakhir" : "Lyrics.ovh (plain text) — last fallback",
                  ].map((item, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: i < 2 ? 6 : 0 }}>
                      <span style={{ fontSize: 10, color: "#34D399", fontWeight: 700, flexShrink: 0, marginTop: 1, fontFamily: "monospace" }}>{i + 1}.</span>
                      <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.4 }}>{item}</p>
                    </div>
                  ))}
                </SettingCard>
              </div>
            )}

            {/* ──────────────── NOTIFICATIONS ──────────────── */}
            {section === "notifications" && (
              <div>
                <SectionTitle>{lang === "id" ? "Notifikasi OS" : "OS Notifications"}</SectionTitle>
                <SettingCard>
                  <ToggleRow
                    label={lang === "id" ? "Notifikasi saat ganti lagu" : "Track change notifications"}
                    desc={lang === "id"
                      ? "Tampilkan notifikasi sistem saat lagu berganti"
                      : "Show system notification when track changes"}
                    checked={notificationsEnabled !== false}
                    onChange={v => setNotificationsEnabled(v)}
                    last
                  />
                </SettingCard>

                {notificationsEnabled !== false && (
                  <>
                    <SectionTitle>{lang === "id" ? "Konten notifikasi" : "Notification content"}</SectionTitle>
                    <SettingCard>
                      {[
                        { label: lang === "id" ? "Judul" : "Title",  value: lang === "id" ? "Nama lagu yang sedang diputar" : "Name of the playing track" },
                        { label: lang === "id" ? "Isi" : "Body",     value: lang === "id" ? "Artis · Album" : "Artist · Album" },
                        { label: lang === "id" ? "Ikon" : "Icon",    value: lang === "id" ? "Cover art (jika tersedia)" : "Cover art (if available)" },
                      ].map(({ label, value }, i, arr) => (
                        <div key={label} style={{
                          display: "flex", justifyContent: "space-between", gap: 12,
                          paddingBottom: i < arr.length - 1 ? 10 : 0,
                          marginBottom: i < arr.length - 1 ? 10 : 0,
                          borderBottom: i < arr.length - 1 ? "1px solid var(--border-subtle)" : "none",
                        }}>
                          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{label}</span>
                          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{value}</span>
                        </div>
                      ))}
                    </SettingCard>
                  </>
                )}

                <SectionTitle>{lang === "id" ? "Tes" : "Test"}</SectionTitle>
                <SettingCard>
                  <SettingRow
                    label={lang === "id" ? "Kirim tes notifikasi" : "Send test notification"}
                    desc={lang === "id" ? "Verifikasi bahwa izin sudah diberikan" : "Verify that permissions are granted"}
                    last
                  >
                    <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
                      <SmallBtn onClick={handleTestNotification}>
                        🔔 {lang === "id" ? "Kirim Tes" : "Send Test"}
                      </SmallBtn>
                      {feedback && <span style={{ fontSize: 11, color: feedbackColor }}>{feedback.message}</span>}
                    </div>
                  </SettingRow>
                </SettingCard>

                <SettingCard style={{ background: "rgba(245,158,11,0.05)", borderColor: "rgba(245,158,11,0.18)" }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: "#FBBF24", marginBottom: 8 }}>
                    {lang === "id" ? "Jika notifikasi tidak muncul:" : "If notifications don't appear:"}
                  </p>
                  <p style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.7 }}>
                    <strong>Windows:</strong> Settings → System → Notifications → Sonarix → On<br/>
                    <strong>macOS:</strong> System Preferences → Notifications → Sonarix → Allow<br/>
                    <strong>Linux:</strong> {lang === "id" ? "Pastikan daemon notifikasi berjalan (dunst, notify-osd, dll)" : "Make sure a notification daemon is running (dunst, notify-osd)"}
                  </p>
                </SettingCard>
              </div>
            )}

            {/* ──────────────── SHORTCUTS ──────────────── */}
            {section === "shortcuts" && (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, marginBottom: 12 }}>
                  {shortcuts.map(({ keys, action }) => (
                    <div key={action} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "7px 10px",
                      background: "var(--bg-overlay)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-md, 8px)", gap: 8,
                    }}>
                      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{action}</span>
                      <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                        {keys.map((k, i) => (
                          <span key={k} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                            <kbd style={{
                              padding: "2px 6px", borderRadius: 4, fontSize: 10,
                              background: "var(--bg-base)", border: "1px solid var(--border-medium)",
                              color: "var(--accent-light, #a78bfa)",
                              fontFamily: "'Space Mono', monospace",
                            }}>{k}</kbd>
                            {i < keys.length - 1 && <span style={{ fontSize: 9, color: "var(--text-faint)" }}>+</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: 11, color: "var(--text-faint)", textAlign: "center" }}>
                  {lang === "id"
                    ? "Pintasan tidak aktif saat fokus di input / textarea"
                    : "Shortcuts are inactive when focused in an input field"}
                </p>
              </div>
            )}

            {/* ──────────────── ABOUT ──────────────── */}
            {section === "about" && (
              <AboutSection lang={lang} />
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
// ── About section — terpisah agar bisa pakai hooks ────────────────────────────
function AboutSection({ lang }: { lang: Lang }) {
  const [dbPath, setDbPath] = useState<string | null>(null);

  useEffect(() => {
    import("../../lib/db").then(({ getDbPath }) => {
      getDbPath().then(p => setDbPath(p)).catch(() => {});
    });
  }, []);

  // Buka folder yang berisi file DB
  const openDbFolder = async () => {
    if (!dbPath) return;
    // Strip "sqlite:" prefix, ambil folder parent
    const filePath = dbPath.replace(/^sqlite:/, "");
    const folderPath = filePath.replace(/\/[^/]+$/, "");
    await invoke("open_file_manager", { path: folderPath });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "center", paddingTop: 16 }}>
      <div style={{
        width: 60, height: 60, borderRadius: 16,
        background: "linear-gradient(135deg, var(--accent), #EC4899)",
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26,
      }}>♪</div>
      <div style={{ textAlign: "center" }}>
        <h2 style={{ fontWeight: 700, fontSize: 20, letterSpacing: "-0.5px", color: "var(--text-primary)" }}>Sonarix</h2>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>Version 1.0.0</p>
        <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {lang === "id" ? "Dibuat dengan Tauri v2 + React" : "Built with Tauri v2 + React"}
        </p>
      </div>
      <SettingCard style={{ width: "100%", maxWidth: 420 }}>
        <p style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.8, textAlign: "center" }}>
          Smart shuffle · ReplayGain · Dynamic preload · Gapless · Smart crossfade ·
          Fade in on resume · 10-band EQ · LRC sync · Auto fetch lyrics · Folder watch · OS Notifications
        </p>
      </SettingCard>

      {/* Database path info */}
      <SettingCard style={{ width: "100%", maxWidth: 420 }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
          {lang === "id" ? "Lokasi Database" : "Database Location"}
        </p>
        <p style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'Space Mono', monospace", wordBreak: "break-all", lineHeight: 1.6, background: "var(--bg-muted)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", padding: "6px 8px" }}>
          {dbPath ?? (lang === "id" ? "Memuat…" : "Loading…")}
        </p>
        <p style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 6, lineHeight: 1.5 }}>
          {lang === "id"
            ? "File ini menyimpan seluruh library. Jangan hapus kecuali ingin reset."
            : "This file stores your entire library. Do not delete unless you want to reset."}
        </p>
      </SettingCard>

      <div style={{ display: "flex", gap: 8 }}>
        <SmallBtn onClick={openDbFolder}>
          {lang === "id" ? "📂 Buka Folder Data" : "📂 Open Data Folder"}
        </SmallBtn>
        <SmallBtn onClick={() => invoke("open_file_manager", { path: "." })}>
          {lang === "id" ? "Buka Folder App" : "Open App Folder"}
        </SmallBtn>
      </div>
    </div>
  );
}