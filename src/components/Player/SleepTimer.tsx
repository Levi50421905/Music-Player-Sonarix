/**
 * SleepTimer.tsx — v3
 *
 * FIX:
 *   - useSleepTimer hook bisa digunakan di App.tsx (lifted state)
 *   - SleepTimerButton menerima timer state dari luar via props
 *   - Countdown terlihat jelas di button
 *   - Fade out 30 detik sebelum pause benar-benar terjadi
 *   - Semua state di-export agar bisa di-connect ke App.tsx
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
    // Restore volume jika sedang fading
    if (timer.fading) {
      audioEngine.setVolume(originalVolume.current);
    }
    setTimer({ endsAt: null, remaining: 0, fading: false, pauseAfterSong: false });
    pauseAfterRef.current = false;
  }, [timer.fading]);

  const start = useCallback((minutes: number) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    originalVolume.current = volume;

    const endsAt = Date.now() + minutes * 60_000;
    setTimer({ endsAt, remaining: minutes * 60, fading: false, pauseAfterSong: false });
    toastInfo(`⏱️ Sleep timer: musik pause dalam ${minutes} menit`);

    intervalRef.current = setInterval(() => {
      setTimer(prev => {
        if (!prev.endsAt) return prev;

        const remaining = Math.max(0, Math.round((prev.endsAt - Date.now()) / 1000));

        if (remaining <= 0) {
          // PAUSE musik
          audioEngine.pause();
          usePlayerStore.getState().setIsPlaying(false);
          audioEngine.setVolume(originalVolume.current);
          if (intervalRef.current) clearInterval(intervalRef.current);
          toastInfo("Sleep timer: musik di-pause 🌙");
          return { endsAt: null, remaining: 0, fading: false, pauseAfterSong: false };
        }

        // Fade out
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
    toastInfo("⏸ Musik akan pause setelah lagu ini selesai");
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
  if (m === 0) return `${s}d`;
  return s === 0 ? `${m}m` : `${m}m ${s}d`;
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

  const isActive = timer.endsAt !== null || timer.pauseAfterSong;

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Sleep Timer"
        style={{
          background: isActive ? "rgba(124,58,237,0.2)" : "transparent",
          border: `1px solid ${isActive ? "#7C3AED" : "rgba(255,255,255,0.06)"}`,
          borderRadius: 7,
          cursor: "pointer",
          color: isActive ? "#a78bfa" : "#6b7280",
          padding: "4px 8px",
          fontSize: 11,
          fontFamily: "inherit",
          display: "flex",
          alignItems: "center",
          gap: 5,
          height: 28,
          transition: "all 0.2s",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 13 }}>🌙</span>
        {timer.endsAt ? (
          <span style={{ fontFamily: "Space Mono, monospace", fontSize: 10 }}>
            {formatRemaining(timer.remaining)}
            {timer.fading && " 🔉"}
          </span>
        ) : timer.pauseAfterSong ? (
          <span style={{ fontSize: 10 }}>setelah lagu</span>
        ) : (
          <span style={{ fontSize: 10 }}>Sleep</span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 98 }}
            onClick={() => setOpen(false)}
          />
          <div style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            right: 0,
            background: "#1a1a2e",
            border: "1px solid #2a2a3e",
            borderRadius: 12,
            padding: 14,
            width: 230,
            boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
            zIndex: 99,
          }}>
            <p style={{ fontSize: 12, color: "#a78bfa", marginBottom: 12, fontWeight: 700 }}>
              🌙 Sleep Timer
            </p>

            {/* Active timer display */}
            {timer.endsAt && (
              <div style={{
                background: "rgba(124,58,237,0.1)",
                border: "1px solid rgba(124,58,237,0.3)",
                borderRadius: 8, padding: "8px 10px",
                marginBottom: 12, textAlign: "center",
              }}>
                <p style={{ fontSize: 20, fontWeight: 700, color: "#a78bfa", fontFamily: "monospace" }}>
                  {formatRemaining(timer.remaining)}
                </p>
                <p style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>
                  {timer.fading ? "🔉 Sedang fade out..." : "sebelum pause"}
                </p>
              </div>
            )}

            {/* Presets */}
            <p style={{ fontSize: 10, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Pause setelah
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              {PRESETS.map(min => (
                <button
                  key={min}
                  onClick={() => { onStart(min); setOpen(false); }}
                  style={{
                    padding: "5px 10px", borderRadius: 6, fontSize: 11,
                    border: "1px solid #3f3f5a", background: "transparent",
                    color: "#9ca3af", cursor: "pointer", fontFamily: "inherit",
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = "#7C3AED";
                    e.currentTarget.style.color = "#a78bfa";
                    e.currentTarget.style.background = "rgba(124,58,237,0.1)";
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = "#3f3f5a";
                    e.currentTarget.style.color = "#9ca3af";
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
                width: "100%", padding: "8px", borderRadius: 8, fontSize: 11,
                background: timer.pauseAfterSong ? "rgba(124,58,237,0.2)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${timer.pauseAfterSong ? "#7C3AED" : "#2a2a3e"}`,
                color: timer.pauseAfterSong ? "#a78bfa" : "#9ca3af",
                cursor: "pointer", fontFamily: "inherit", marginBottom: 8,
              }}
            >
              ⏸ Pause setelah lagu ini
            </button>

            {/* Cancel */}
            {isActive && (
              <button
                onClick={() => { onClear(); setOpen(false); }}
                style={{
                  width: "100%", padding: "7px", borderRadius: 6, fontSize: 11,
                  background: "rgba(239,68,68,0.15)", border: "1px solid #EF4444",
                  color: "#f87171", cursor: "pointer", fontFamily: "inherit",
                }}
              >
                Batalkan{timer.remaining > 0 ? ` (${formatRemaining(timer.remaining)} lagi)` : ""}
              </button>
            )}

            <p style={{ fontSize: 10, color: "#4b5563", marginTop: 8, lineHeight: 1.5 }}>
              Volume akan fade out {FADE_SECONDS} detik sebelum pause.
            </p>
          </div>
        </>
      )}
    </div>
  );
}