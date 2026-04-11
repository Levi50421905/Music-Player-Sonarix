/**
 * KeyboardCheatsheet.tsx — Shortcut overlay saat tekan "?"
 *
 * Tekan ? → overlay muncul dengan semua keyboard shortcuts.
 * Tekan Escape atau klik backdrop → tutup.
 */

import { useEffect, useState } from "react";

interface ShortcutGroup {
  group: string;
  icon: string;
  items: { keys: string[]; action: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    group: "Playback",
    icon: "▶",
    items: [
      { keys: ["Space"],        action: "Play / Pause" },
      { keys: ["→"],            action: "Maju 5 detik" },
      { keys: ["←"],            action: "Mundur 5 detik" },
      { keys: ["Ctrl", "→"],    action: "Maju 30 detik" },
      { keys: ["Ctrl", "←"],    action: "Mundur 30 detik" },
      { keys: ["Shift", "→"],   action: "Lagu berikutnya" },
      { keys: ["Shift", "←"],   action: "Lagu sebelumnya" },
    ],
  },
  {
    group: "Volume",
    icon: "🔊",
    items: [
      { keys: ["↑"],            action: "Volume naik 5%" },
      { keys: ["↓"],            action: "Volume turun 5%" },
      { keys: ["M"],            action: "Mute / Unmute" },
    ],
  },
  {
    group: "Mode",
    icon: "⇄",
    items: [
      { keys: ["S"],            action: "Toggle shuffle" },
      { keys: ["R"],            action: "Cycle repeat (off → all → one)" },
    ],
  },
  {
    group: "UI",
    icon: "🖥",
    items: [
      { keys: ["F"],            action: "Fokus ke search" },
      { keys: ["Ctrl", "M"],    action: "Buka / tutup mini player" },
      { keys: ["Ctrl", "L"],    action: "Toggle lyrics panel" },
      { keys: ["Ctrl", ","],    action: "Buka settings" },
      { keys: ["?"],            action: "Tampilkan shortcut ini" },
    ],
  },
  {
    group: "Rating",
    icon: "⭐",
    items: [
      { keys: ["1"],            action: "Rating 1 bintang (toggle)" },
      { keys: ["2"],            action: "Rating 2 bintang (toggle)" },
      { keys: ["3"],            action: "Rating 3 bintang (toggle)" },
      { keys: ["4"],            action: "Rating 4 bintang (toggle)" },
      { keys: ["5"],            action: "Rating 5 bintang (toggle)" },
    ],
  },
  {
    group: "OS Media Keys",
    icon: "⌨",
    items: [
      { keys: ["⏯"],           action: "Play / Pause" },
      { keys: ["⏭"],           action: "Lagu berikutnya" },
      { keys: ["⏮"],           action: "Lagu sebelumnya" },
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
    if (open) {
      setVisible(true);
    } else {
      const t = setTimeout(() => setVisible(false), 250);
      return () => clearTimeout(t);
    }
  }, [open]);

  if (!visible && !open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 500,
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(10px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: open ? 1 : 0,
        transition: "opacity 0.25s ease",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#0d0d1f",
          border: "1px solid rgba(124,58,237,0.3)",
          borderRadius: 16,
          padding: "28px 32px",
          width: 680,
          maxWidth: "95vw",
          maxHeight: "88vh",
          overflowY: "auto",
          boxShadow: "0 32px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(124,58,237,0.1)",
          transform: open ? "translateY(0) scale(1)" : "translateY(16px) scale(0.97)",
          transition: "transform 0.25s cubic-bezier(0.34,1.56,0.64,1)",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
        }}>
          <div>
            <h2 style={{
              fontWeight: 700,
              fontSize: 18,
              letterSpacing: "-0.4px",
              color: "#f1f5f9",
            }}>
              Keyboard Shortcuts
            </h2>
            <p style={{ fontSize: 12, color: "#6b7280", marginTop: 3 }}>
              Tekan <Kbd>?</Kbd> kapan saja untuk membuka overlay ini · <Kbd>Esc</Kbd> untuk tutup
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 30, height: 30, borderRadius: 8,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#9ca3af", cursor: "pointer", fontSize: 16,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >✕</button>
        </div>

        {/* Grid groups */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 20,
        }}>
          {SHORTCUT_GROUPS.map(group => (
            <div key={group.group} style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.05)",
              borderRadius: 10,
              padding: "14px 16px",
            }}>
              {/* Group header */}
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                marginBottom: 12,
                paddingBottom: 8,
                borderBottom: "1px solid rgba(255,255,255,0.05)",
              }}>
                <span style={{ fontSize: 14 }}>{group.icon}</span>
                <span style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#a78bfa",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}>{group.group}</span>
              </div>

              {/* Items */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {group.items.map(item => (
                  <div
                    key={item.action}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <span style={{ fontSize: 12, color: "#9ca3af" }}>{item.action}</span>
                    <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                      {item.keys.map((k, i) => (
                        <span key={k}>
                          <Kbd>{k}</Kbd>
                          {i < item.keys.length - 1 && (
                            <span style={{ fontSize: 9, color: "#4b5563", margin: "0 1px" }}>+</span>
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

        {/* Footer */}
        <div style={{
          marginTop: 20,
          paddingTop: 16,
          borderTop: "1px solid rgba(255,255,255,0.05)",
          fontSize: 11,
          color: "#4b5563",
          textAlign: "center",
        }}>
          Shortcuts tidak aktif saat focus di input / textarea
        </div>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "2px 6px",
      borderRadius: 5,
      fontSize: 10,
      fontFamily: "Space Mono, monospace",
      background: "#1a1a2e",
      border: "1px solid #3f3f5a",
      color: "#a78bfa",
      minWidth: 20,
      lineHeight: 1.4,
    }}>
      {children}
    </kbd>
  );
}