/**
 * MiniPlayer.tsx — v3 (Design Fix)
 *
 * PERUBAHAN vs v2:
 *   [FIX] Semua unicode icon (⏮ ⏭ ✕) diganti SVG inline
 *   [FIX] Hardcode hex (#1a1a2e, #7a7a96, #52527a, #eaeaf5) → CSS variable
 *   [FIX] Close button area diperbesar ke 28×28px untuk tap yang nyaman
 */

import { useEffect, useState, useCallback } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import CoverArt from "../CoverArt";

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

// ── SVG Icons ──────────────────────────────────────────────────────────────────
function IconPrev() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="19 20 9 12 19 4 19 20"/>
      <line x1="5" y1="19" x2="5" y2="5"/>
    </svg>
  );
}

function IconNext() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 4 15 12 5 20 5 4"/>
      <line x1="19" y1="5" x2="19" y2="19"/>
    </svg>
  );
}

function IconPlay() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5 3 19 12 5 21 5 3"/>
    </svg>
  );
}

function IconPause() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4" height="16"/>
      <rect x="14" y="4" width="4" height="16"/>
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="1" y1="1" x2="11" y2="11"/>
      <line x1="11" y1="1" x2="1" y2="11"/>
    </svg>
  );
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

  useEffect(() => {
    const unlisteners: (() => void)[] = [];
    if (!(window as any).__TAURI_INTERNALS__) return;
    (async () => {
      unlisteners.push(await listen<MiniState>("mini:state", (e) => {
        setState(e.payload);
      }));
    })();
    emit("mini:request-state");
    return () => unlisteners.forEach(fn => fn());
  }, []);

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
        width: "100%",
        minHeight: 82,
        background: "var(--bg-surface)",
        border: "1px solid rgba(124,58,237,0.35)",
        borderRadius: 12,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        userSelect: "none",
        backdropFilter: "blur(20px)",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {/* Progress bar */}
      <div style={{ height: 3, background: "var(--bg-muted)", flexShrink: 0 }}>
        <div style={{
          height: "100%",
          width: `${state.progress}%`,
          background: "linear-gradient(to right, var(--accent), var(--accent-pink))",
          transition: "width 0.5s linear",
          borderRadius: "0 2px 2px 0",
        }} />
      </div>

      {/* Main content */}
      <div style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        gap: 9,
        padding: "8px 10px",
      }}>
        {/* Cover */}
        <CoverArt id={state.songId} coverArt={state.coverArt} size={44} />

        {/* Info */}
        <div style={{ flex: 1, overflow: "hidden", minWidth: 0 }}>
          <div style={{
            fontWeight: 600,
            fontSize: 12,
            color: "var(--text-primary)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            lineHeight: 1.3,
          }}>
            {state.title}
          </div>
          <div style={{
            fontSize: 11,
            color: "var(--text-muted)",
            marginTop: 2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}>
            {state.artist || "—"}
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
          <MiniBtn onClick={() => send("prev")} title="Previous" size={32}>
            <IconPrev />
          </MiniBtn>

          <button
            onClick={() => send("playpause")}
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "linear-gradient(135deg, var(--accent), var(--accent-pink))",
              border: "none",
              cursor: "pointer",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 12px rgba(124,58,237,0.45)",
              flexShrink: 0,
            }}
          >
            {state.isPlaying ? <IconPause /> : <IconPlay />}
          </button>

          <MiniBtn onClick={() => send("next")} title="Next" size={32}>
            <IconNext />
          </MiniBtn>
        </div>

        {/* Time + close */}
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 3,
          flexShrink: 0,
        }}>
          {/* Close button — diperbesar ke 28×28 agar mudah diklik */}
          <button
            onClick={() => send("close")}
            style={{
              width: 28,
              height: 28,
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-faint)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 6,
            }}
            onMouseEnter={e => e.currentTarget.style.color = "var(--text-secondary)"}
            onMouseLeave={e => e.currentTarget.style.color = "var(--text-faint)"}
          >
            <IconClose />
          </button>
          <span style={{
            fontSize: 10,
            color: "var(--text-faint)",
            fontFamily: "'Space Mono', monospace",
          }}>
            {fmt(elapsed)}
          </span>
        </div>
      </div>
    </div>
  );
}

function MiniBtn({ children, onClick, title, size = 28 }: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
  size?: number;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: size,
        height: size,
        background: "none",
        border: "none",
        cursor: "pointer",
        color: "var(--text-muted)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 6,
        flexShrink: 0,
      }}
      onMouseEnter={e => e.currentTarget.style.color = "var(--accent-light)"}
      onMouseLeave={e => e.currentTarget.style.color = "var(--text-muted)"}
    >
      {children}
    </button>
  );
}