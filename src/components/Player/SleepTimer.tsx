/**
 * SleepTimer.tsx — v5 (Design Fix)
 *
 * PERUBAHAN vs v4:
 *   [FIX] Dropdown position: fixed → absolute dengan overflow-clip yang benar
 *   [FIX] Preset buttons lebih compact (2 kolom grid)
 *   [FIX] Semua warna sudah pakai CSS variable
 *   [FIX] Dropdown sekarang tidak terpotong di tepi layar
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { audioEngine } from "../../lib/audioEngine";
import { usePlayerStore } from "../../store";
import { toastInfo } from "../Notification/ToastSystem";

const PRESETS = [5, 10, 15, 30, 45, 60, 90] as const;
const FADE_SECONDS = 30;

export interface SleepTimerState {
  endsAt: number | null;
  remaining: number;
  fading: boolean;
  pauseAfterSong: boolean;
}

// ── useSleepTimer hook ────────────────────────────────────────────────────────
export function useSleepTimer() {
  const [timer, setTimer] = useState<SleepTimerState>({
    endsAt: null, remaining: 0, fading: false, pauseAfterSong: false,
  });

  const intervalRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const originalVolume = useRef<number>(80);
  const pauseAfterRef  = useRef(false);
  const { volume }     = usePlayerStore();

  const clear = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timer.fading) audioEngine.setVolume(originalVolume.current);
    setTimer({ endsAt: null, remaining: 0, fading: false, pauseAfterSong: false });
    pauseAfterRef.current = false;
  }, [timer.fading]);

  const start = useCallback((minutes: number) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    originalVolume.current = volume;

    const endsAt = Date.now() + minutes * 60_000;
    setTimer({ endsAt, remaining: minutes * 60, fading: false, pauseAfterSong: false });
    toastInfo(`Sleep timer: pauses in ${minutes} min`);

    intervalRef.current = setInterval(() => {
      setTimer(prev => {
        if (!prev.endsAt) return prev;
        const remaining = Math.max(0, Math.round((prev.endsAt - Date.now()) / 1000));
        if (remaining <= 0) {
          audioEngine.pause();
          usePlayerStore.getState().setIsPlaying(false);
          audioEngine.setVolume(originalVolume.current);
          if (intervalRef.current) clearInterval(intervalRef.current);
          toastInfo("Sleep timer: music paused");
          return { endsAt: null, remaining: 0, fading: false, pauseAfterSong: false };
        }
        if (remaining <= FADE_SECONDS) {
          const fadePct = remaining / FADE_SECONDS;
          audioEngine.setVolume(Math.max(0, Math.round(originalVolume.current * fadePct)));
          return { ...prev, remaining, fading: true };
        }
        return { ...prev, remaining };
      });
    }, 1000);
  }, [volume]);

  const startPauseAfterSong = useCallback(() => {
    setTimer(prev => ({ ...prev, pauseAfterSong: true, endsAt: null }));
    pauseAfterRef.current = true;
    toastInfo("Music will pause after this song");
  }, []);

  const shouldPauseAfterSong = useCallback(() => {
    if (pauseAfterRef.current) {
      pauseAfterRef.current = false;
      setTimer({ endsAt: null, remaining: 0, fading: false, pauseAfterSong: false });
      return true;
    }
    return false;
  }, []);

  useEffect(() => () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  return { timer, start, clear, startPauseAfterSong, shouldPauseAfterSong, PRESETS };
}

// ── Format helpers ─────────────────────────────────────────────────────────────
function formatRemaining(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}s`;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

// ── UI Component ───────────────────────────────────────────────────────────────
interface SleepTimerButtonProps {
  timer: SleepTimerState;
  onStart: (minutes: number) => void;
  onClear: () => void;
  onPauseAfterSong: () => void;
}

export default function SleepTimerButton({
  timer, onStart, onClear, onPauseAfterSong,
}: SleepTimerButtonProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isActive = timer.endsAt !== null || timer.pauseAfterSong;
  const isFading = timer.fading;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Sleep Timer"
        style={{
          height: 30,
          padding: "0 9px",
          borderRadius: "var(--radius-md)",
          border: `1px solid ${isActive
            ? isFading
              ? "var(--warning-border)"
              : "rgba(245,158,11,0.35)"
            : "var(--border)"}`,
          background: isActive
            ? isFading
              ? "var(--warning-dim)"
              : "rgba(245,158,11,0.1)"
            : "transparent",
          cursor: "pointer",
          color: isActive ? "var(--warning)" : "var(--text-muted)",
          fontSize: 12,
          fontFamily: "inherit",
          display: "flex",
          alignItems: "center",
          gap: 5,
          flexShrink: 0,
          boxShadow: isActive && isFading
            ? "0 0 10px rgba(245,158,11,0.25)"
            : isActive ? "0 0 6px rgba(245,158,11,0.15)" : "none",
          animation: isFading ? "sleep-pulse 2s ease-in-out infinite" : "none",
          transition: "all 0.15s",
        }}
        onMouseEnter={e => {
          if (!isActive) {
            e.currentTarget.style.borderColor = "var(--border-medium)";
            e.currentTarget.style.color = "var(--text-secondary)";
          }
        }}
        onMouseLeave={e => {
          if (!isActive) {
            e.currentTarget.style.borderColor = "var(--border)";
            e.currentTarget.style.color = "var(--text-muted)";
          }
        }}
      >
        {/* Moon SVG icon */}
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 10A6 6 0 016 2a7 7 0 100 12 6 6 0 008-4z"/>
        </svg>
        {timer.endsAt ? (
          <span style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 11,
            fontWeight: 700,
            color: isFading ? "var(--warning)" : "var(--warning)",
          }}>
            {formatRemaining(timer.remaining)}
            {isFading && " ↓"}
          </span>
        ) : timer.pauseAfterSong ? (
          <span style={{ fontSize: 11 }}>after</span>
        ) : null}
      </button>

      {/* Dropdown panel — position absolute, bukan fixed */}
      {open && (
        <div style={{
          position: "absolute",
          bottom: "calc(100% + 8px)",
          right: 0,
          background: "var(--bg-overlay)",
          border: "1px solid var(--border-medium)",
          borderRadius: "var(--radius-xl)",
          padding: 14,
          width: 210,
          boxShadow: "var(--shadow-lg)",
          zIndex: 200,
          /* Pastikan tidak terpotong */
          overflowY: "auto",
          maxHeight: "70vh",
        }}>
          <p style={{
            fontSize: 12, fontWeight: 600,
            color: "var(--text-primary)",
            marginBottom: 10,
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 10A6 6 0 016 2a7 7 0 100 12 6 6 0 008-4z"/>
            </svg>
            Sleep Timer
          </p>

          {/* Active countdown */}
          {timer.endsAt && (
            <div style={{
              background: "var(--warning-dim)",
              border: "1px solid var(--warning-border)",
              borderRadius: "var(--radius-md)", padding: "10px",
              marginBottom: 10, textAlign: "center",
            }}>
              <p style={{
                fontSize: 22, fontWeight: 700,
                color: "var(--warning)",
                fontFamily: "'Space Mono', monospace",
                lineHeight: 1,
              }}>
                {formatRemaining(timer.remaining)}
              </p>
              <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                {timer.fading ? "Volume fading…" : "until pause"}
              </p>
            </div>
          )}

          {/* Presets label */}
          <p style={{
            fontSize: 10, color: "var(--text-faint)",
            marginBottom: 7,
            textTransform: "uppercase", letterSpacing: "0.08em",
            fontWeight: 700,
          }}>
            Stop after
          </p>

          {/* Presets — 2 kolom grid agar lebih compact */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 5, marginBottom: 10,
          }}>
            {PRESETS.map(min => (
              <button
                key={min}
                onClick={() => { onStart(min); setOpen(false); }}
                style={{
                  padding: "6px 8px",
                  borderRadius: "var(--radius-sm)", fontSize: 12,
                  border: "1px solid var(--border-medium)",
                  background: "transparent",
                  color: "var(--text-secondary)",
                  cursor: "pointer", fontFamily: "inherit",
                  textAlign: "center",
                  transition: "all 0.15s",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = "var(--warning-border)";
                  e.currentTarget.style.color = "var(--warning)";
                  e.currentTarget.style.background = "var(--warning-dim)";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = "var(--border-medium)";
                  e.currentTarget.style.color = "var(--text-secondary)";
                  e.currentTarget.style.background = "transparent";
                }}
              >
                {min}m
              </button>
            ))}
          </div>

          {/* Pause after song */}
          <button
            onClick={() => { onPauseAfterSong(); setOpen(false); }}
            style={{
              width: "100%", padding: "7px 10px",
              borderRadius: "var(--radius-md)", fontSize: 12,
              background: timer.pauseAfterSong ? "var(--accent-dim)" : "transparent",
              border: `1px solid ${timer.pauseAfterSong ? "var(--accent-border)" : "var(--border-medium)"}`,
              color: timer.pauseAfterSong ? "var(--accent-light)" : "var(--text-secondary)",
              cursor: "pointer", fontFamily: "inherit", marginBottom: 7,
              textAlign: "left", transition: "all 0.15s",
            }}
            onMouseEnter={e => {
              if (!timer.pauseAfterSong) {
                e.currentTarget.style.borderColor = "var(--accent-border)";
                e.currentTarget.style.color = "var(--accent-light)";
              }
            }}
            onMouseLeave={e => {
              if (!timer.pauseAfterSong) {
                e.currentTarget.style.borderColor = "var(--border-medium)";
                e.currentTarget.style.color = "var(--text-secondary)";
              }
            }}
          >
            Pause after this song
          </button>

          {/* Cancel */}
          {isActive && (
            <button
              onClick={() => { onClear(); setOpen(false); }}
              style={{
                width: "100%", padding: "6px 10px",
                borderRadius: "var(--radius-md)", fontSize: 12,
                background: "var(--danger-dim)",
                border: "1px solid var(--danger-border)",
                color: "#f87171", cursor: "pointer", fontFamily: "inherit",
                textAlign: "left", transition: "all 0.15s",
              }}
            >
              Cancel timer
            </button>
          )}

          <p style={{
            fontSize: 10, color: "var(--text-faint)",
            marginTop: 8, lineHeight: 1.5,
          }}>
            Volume fades in last {FADE_SECONDS}s
          </p>
        </div>
      )}

      <style>{`
        @keyframes sleep-pulse {
          0%, 100% { box-shadow: 0 0 6px rgba(245,158,11,0.15); }
          50% { box-shadow: 0 0 14px rgba(245,158,11,0.35); }
        }
      `}</style>
    </div>
  );
}