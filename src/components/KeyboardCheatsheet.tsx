/**
 * KeyboardCheatsheet.tsx — v2 (Design Refresh)
 *
 * PERUBAHAN vs v1:
 *   [DESIGN] Semua warna pakai CSS variable
 *   [DESIGN] Card group lebih clean
 *   [DESIGN] Kbd element lebih readable
 */

import { useEffect, useState } from "react";

interface ShortcutGroup {
  group: string;
  items: { keys: string[]; action: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    group: "Playback",
    items: [
      { keys: ["Space"],       action: "Play / Pause" },
      { keys: ["→"],           action: "Seek +5s" },
      { keys: ["←"],           action: "Seek -5s" },
      { keys: ["Ctrl","→"],    action: "Seek +30s" },
      { keys: ["Ctrl","←"],    action: "Seek -30s" },
      { keys: ["Shift","→"],   action: "Next track" },
      { keys: ["Shift","←"],   action: "Previous track" },
    ],
  },
  {
    group: "Volume",
    items: [
      { keys: ["↑"],  action: "Volume +5%" },
      { keys: ["↓"],  action: "Volume -5%" },
      { keys: ["M"],  action: "Mute / Unmute" },
    ],
  },
  {
    group: "Modes",
    items: [
      { keys: ["S"],  action: "Toggle shuffle" },
      { keys: ["R"],  action: "Cycle repeat" },
    ],
  },
  {
    group: "Interface",
    items: [
      { keys: ["F"],        action: "Focus search" },
      { keys: ["Ctrl","M"], action: "Mini player" },
      { keys: ["Ctrl","L"], action: "Toggle lyrics" },
      { keys: ["Ctrl",","], action: "Open settings" },
      { keys: ["?"],        action: "This cheatsheet" },
    ],
  },
  {
    group: "Rating",
    items: [
      { keys: ["1"], action: "1 star (toggle)" },
      { keys: ["2"], action: "2 stars (toggle)" },
      { keys: ["3"], action: "3 stars (toggle)" },
      { keys: ["4"], action: "4 stars (toggle)" },
      { keys: ["5"], action: "5 stars (toggle)" },
    ],
  },
  {
    group: "Media keys",
    items: [
      { keys: ["⏯"], action: "Play / Pause" },
      { keys: ["⏭"], action: "Next track" },
      { keys: ["⏮"], action: "Previous track" },
    ],
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function KeyboardCheatsheet({ open, onClose }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) { setVisible(true); }
    else { const t = setTimeout(() => setVisible(false), 220); return () => clearTimeout(t); }
  }, [open]);

  if (!visible && !open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 500,
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(10px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        opacity: open ? 1 : 0,
        transition: "opacity 0.22s ease",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-medium)",
          borderRadius: "var(--radius-xl, 16px)",
          padding: "24px 28px",
          width: 660,
          maxWidth: "94vw",
          maxHeight: "86vh",
          overflowY: "auto",
          boxShadow: "0 32px 80px rgba(0,0,0,0.8)",
          transform: open ? "translateY(0) scale(1)" : "translateY(12px) scale(0.97)",
          transition: "transform 0.22s cubic-bezier(0.34,1.56,0.64,1)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h2 style={{ fontWeight: 700, fontSize: 16, color: "var(--text-primary)", letterSpacing: "-0.3px" }}>
              Keyboard shortcuts
            </h2>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
              Press <Kbd>?</Kbd> to open · <Kbd>Esc</Kbd> to close
            </p>
          </div>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: "var(--radius-md, 8px)",
            background: "transparent", border: "1px solid var(--border)",
            color: "var(--text-muted)", cursor: "pointer", fontSize: 15,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--border-medium)"; e.currentTarget.style.color = "var(--text-primary)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-muted)"; }}
          >✕</button>
        </div>

        {/* Groups grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {SHORTCUT_GROUPS.map(group => (
            <div key={group.group} style={{
              background: "var(--bg-overlay)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg, 12px)",
              padding: "12px 14px",
            }}>
              <div style={{
                fontSize: 10, fontWeight: 700,
                color: "var(--accent-light, #a78bfa)",
                textTransform: "uppercase", letterSpacing: "0.1em",
                marginBottom: 10, paddingBottom: 8,
                borderBottom: "1px solid var(--border-subtle)",
              }}>
                {group.group}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {group.items.map(item => (
                  <div key={item.action} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{item.action}</span>
                    <div style={{ display: "flex", gap: 3, flexShrink: 0, alignItems: "center" }}>
                      {item.keys.map((k, i) => (
                        <span key={k} style={{ display: "flex", alignItems: "center", gap: 2 }}>
                          <Kbd>{k}</Kbd>
                          {i < item.keys.length - 1 && (
                            <span style={{ fontSize: 9, color: "var(--text-faint)" }}>+</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{
          marginTop: 16, paddingTop: 14,
          borderTop: "1px solid var(--border-subtle)",
          fontSize: 11, color: "var(--text-faint)", textAlign: "center",
        }}>
          Shortcuts inactive when focused in an input or textarea
        </div>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      padding: "2px 6px", borderRadius: 5,
      fontSize: 10, fontFamily: "'Space Mono', monospace",
      background: "var(--bg-muted)",
      border: "1px solid var(--border-medium)",
      color: "var(--accent-light, #a78bfa)",
      minWidth: 20, lineHeight: 1.4,
    }}>
      {children}
    </kbd>
  );
}