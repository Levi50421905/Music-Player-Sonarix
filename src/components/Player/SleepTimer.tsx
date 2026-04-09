/**
 * SleepTimer.tsx — Auto-pause setelah X menit
 *
 * WHY sleep timer:
 *   Berguna saat mendengarkan musik sebelum tidur.
 *   Setelah countdown habis, musik otomatis pause (bukan stop,
 *   agar posisi track tidak hilang).
 *
 * IMPLEMENTASI:
 *   - Simpan target waktu selesai (Date.now() + menit * 60000)
 *   - setInterval cek tiap detik
 *   - Saat countdown = 0 → pause + clear timer + notifikasi
 *
 * FADE OUT: 30 detik sebelum pause, volume perlahan turun ke 0
 * agar tidak tiba-tiba hening.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { audioEngine } from "../../lib/audioEngine";
import { usePlayerStore, useSettingsStore } from "../../store";

const PRESETS = [5, 10, 15, 30, 45, 60, 90] as const;
const FADE_SECONDS = 30; // mulai fade X detik sebelum pause

interface TimerState {
  endsAt: number | null;   // timestamp ms
  remaining: number;       // detik
  fading: boolean;
}

export function useSleepTimer() {
  const [timer, setTimer] = useState<TimerState>({
    endsAt: null, remaining: 0, fading: false,
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const originalVolume = useRef<number>(80);

  const { volume } = usePlayerStore();
  const { setSleepTimer } = useSettingsStore();

  const clear = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    // Restore volume jika sedang fade
    if (timer.fading) {
      audioEngine.setVolume(originalVolume.current);
    }
    setTimer({ endsAt: null, remaining: 0, fading: false });
    setSleepTimer(null);
  }, [timer.fading]);

  const start = useCallback((minutes: number) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    originalVolume.current = volume;

    const endsAt = Date.now() + minutes * 60_000;
    setTimer({ endsAt, remaining: minutes * 60, fading: false });
    setSleepTimer(minutes);

    intervalRef.current = setInterval(() => {
      setTimer(prev => {
        if (!prev.endsAt) return prev;

        const remaining = Math.max(0, Math.round((prev.endsAt - Date.now()) / 1000));

        // Fade out saat mendekati habis
        if (remaining <= FADE_SECONDS && !prev.fading) {
          // Start fade
          const fadePct = remaining / FADE_SECONDS;
          audioEngine.setVolume(Math.round(originalVolume.current * fadePct));
          return { ...prev, remaining, fading: true };
        }

        if (prev.fading && remaining > 0) {
          // Lanjutkan fade
          const fadePct = remaining / FADE_SECONDS;
          audioEngine.setVolume(Math.max(0, Math.round(originalVolume.current * fadePct)));
        }

        if (remaining <= 0) {
          // Pause!
          audioEngine.pause();
          usePlayerStore.getState().setIsPlaying(false);
          audioEngine.setVolume(originalVolume.current); // restore volume
          if (intervalRef.current) clearInterval(intervalRef.current);
          setSleepTimer(null);
          return { endsAt: null, remaining: 0, fading: false };
        }

        return { ...prev, remaining };
      });
    }, 1000);
  }, [volume]);

  useEffect(() => () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  return { timer, start, clear, PRESETS };
}

// ── UI Component ──────────────────────────────────────────────────────────────
export default function SleepTimerButton() {
  const { timer, start, clear, PRESETS } = useSleepTimer();
  const [open, setOpen] = useState(false);

  const formatRemaining = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m === 0) return `${s}s`;
    return s === 0 ? `${m}m` : `${m}m ${s}s`;
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Sleep Timer"
        style={{
          background: timer.endsAt ? "rgba(124,58,237,0.2)" : "transparent",
          border: `1px solid ${timer.endsAt ? "#7C3AED" : "#2a2a3e"}`,
          borderRadius: 8, cursor: "pointer",
          color: timer.endsAt ? "#a78bfa" : "#6b7280",
          padding: "5px 10px",
          fontSize: 11, fontFamily: "inherit",
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
        }}
      >
        <span>🌙</span>
        {timer.endsAt
          ? <span style={{ fontFamily: "Space Mono, monospace" }}>
              {formatRemaining(timer.remaining)}
              {timer.fading && " 🔉"}
            </span>
          : <span>Sleep</span>
        }
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 8px)", right: 0,
          background: "#1a1a2e", border: "1px solid #2a2a3e",
          borderRadius: 10, padding: 12, width: 200,
          boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
          zIndex: 100,
        }}>
          <p style={{ fontSize: 11, color: "#6b7280", marginBottom: 10, fontWeight: 600 }}>
            Sleep Timer
          </p>

          {/* Preset buttons */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            {PRESETS.map(min => (
              <button key={min} onClick={() => { start(min); setOpen(false); }} style={{
                padding: "5px 10px", borderRadius: 6, fontSize: 11,
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
              >
                {min}m
              </button>
            ))}
          </div>

          {/* Cancel */}
          {timer.endsAt && (
            <button onClick={() => { clear(); setOpen(false); }} style={{
              width: "100%", padding: "7px", borderRadius: 6, fontSize: 11,
              background: "rgba(239,68,68,0.15)", border: "1px solid #EF4444",
              color: "#f87171", cursor: "pointer", fontFamily: "inherit",
            }}>
              Cancel ({formatRemaining(timer.remaining)} remaining)
            </button>
          )}

          <p style={{ fontSize: 10, color: "#4b5563", marginTop: 8, lineHeight: 1.4 }}>
            Musik akan fade out {FADE_SECONDS}s sebelum pause.
          </p>
        </div>
      )}
    </div>
  );
}