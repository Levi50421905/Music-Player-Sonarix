/**
 * MiniPlayer.tsx — Compact Always-On-Top Player
 *
 * WHY mini player:
 *   Saat user kerja di app lain, mereka tetap bisa kontrol musik
 *   tanpa harus switch window. Mini player adalah window terpisah
 *   yang selalu di atas semua window lain (always on top).
 *
 * CARA KERJA di Tauri:
 *   - Buat window baru via Tauri WebviewWindow API
 *   - Set always_on_top: true
 *   - Window ini merender route "/mini" (atau component terpisah)
 *   - Komunikasi dengan main window via Tauri event emit/listen
 *
 * Komponen ini adalah UI mini player itu sendiri (dirender di window mini).
 */

import { useEffect, useState, useCallback } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import CoverArt from "../CoverArt";

// State yang dikirim dari main window ke mini player
interface MiniState {
  title: string;
  artist: string;
  songId: number;
  coverArt: string | null;
  isPlaying: boolean;
  progress: number;
  duration: number;
  volume: number;
}

export default function MiniPlayer() {
  const [state, setState] = useState<MiniState>({
    title: "No track",
    artist: "",
    songId: 0,
    coverArt: null,
    isPlaying: false,
    progress: 0,
    duration: 0,
    volume: 80,
  });
  const [isDragging, setIsDragging] = useState(false);

  // Terima state update dari main window
  useEffect(() => {
    const unlisteners: (() => void)[] = [];

    (async () => {
      unlisteners.push(await listen<MiniState>("mini:state", (e) => {
        setState(e.payload);
      }));
    })();

    // Minta main window kirim state saat ini
    emit("mini:request-state");

    return () => unlisteners.forEach(fn => fn());
  }, []);

  // Draggable window
  const handleMouseDown = useCallback(async (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    const win = getCurrentWindow();
    await win.startDragging();
  }, []);

  const send = (event: string) => emit(`mini:${event}`);

  const fmt = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  const elapsed = (state.progress / 100) * state.duration;

  return (
    <div
      onMouseDown={handleMouseDown}
      style={{
        width: "100%", height: "100%",
        background: "rgba(10,10,20,0.96)",
        border: "1px solid rgba(124,58,237,0.4)",
        borderRadius: 12,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        userSelect: "none",
        backdropFilter: "blur(20px)",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {/* Progress bar - top */}
      <div style={{ height: 2, background: "#1a1a2e", flexShrink: 0 }}>
        <div style={{
          height: "100%",
          width: `${state.progress}%`,
          background: "linear-gradient(to right, #7C3AED, #EC4899)",
          transition: "width 0.5s linear",
        }} />
      </div>

      {/* Main content */}
      <div style={{
        flex: 1, display: "flex", alignItems: "center",
        gap: 10, padding: "8px 12px",
      }}>
        {/* Cover */}
        <CoverArt id={state.songId} coverArt={state.coverArt} size={40} />

        {/* Info */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          <div style={{
            fontWeight: 600, fontSize: 12, color: "#f1f5f9",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {state.title}
          </div>
          <div style={{ fontSize: 10, color: "#6b7280", marginTop: 1 }}>
            {state.artist}
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <MiniBtn onClick={() => send("prev")} title="Previous">⏮</MiniBtn>
          <button
            onClick={() => send("playpause")}
            style={{
              width: 30, height: 30, borderRadius: "50%",
              background: "linear-gradient(135deg,#7C3AED,#EC4899)",
              border: "none", cursor: "pointer",
              color: "white", fontSize: 12,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 0 12px rgba(124,58,237,0.5)",
            }}
          >
            {state.isPlaying ? "⏸" : "▶"}
          </button>
          <MiniBtn onClick={() => send("next")} title="Next">⏭</MiniBtn>
        </div>

        {/* Time + close */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
          <button
            onClick={() => send("close")}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "#4b5563", fontSize: 10, padding: "0 2px",
              lineHeight: 1,
            }}
          >✕</button>
          <span style={{
            fontSize: 9, color: "#6b7280",
            fontFamily: "Space Mono, monospace",
          }}>
            {fmt(elapsed)}
          </span>
        </div>
      </div>
    </div>
  );
}

function MiniBtn({ children, onClick, title }: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button onClick={onClick} title={title} style={{
      background: "none", border: "none", cursor: "pointer",
      color: "#9ca3af", fontSize: 16, padding: 4,
      display: "flex", alignItems: "center", justifyContent: "center",
      borderRadius: 6, transition: "color 0.15s",
    }}
      onMouseEnter={e => (e.currentTarget.style.color = "#a78bfa")}
      onMouseLeave={e => (e.currentTarget.style.color = "#9ca3af")}
    >
      {children}
    </button>
  );
}