/**
 * useKeyboardShortcuts.ts — Global Keyboard Shortcut Handler
 *
 * WHY di level App (bukan per komponen):
 *   - Shortcut harus aktif di mana pun user berada di dalam app
 *   - Satu tempat untuk manage semua shortcut → tidak ada conflict
 *
 * EXCEPTION: jangan trigger shortcut saat user sedang mengetik di input/textarea
 */

import { useEffect } from "react";
import { audioEngine } from "../../lib/audioEngine";
import { usePlayerStore } from "../../store";

interface Handlers {
  onPlayPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
  onToggleMini: () => void;
  onToggleLyrics: () => void;
  onOpenSettings: () => void;
  onFocusSearch: () => void;
}

export function useKeyboardShortcuts(handlers: Handlers) {
  const { setVolume, volume, currentSong, setRating } = usePlayerStore() as any;

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      // Jangan intercept saat mengetik di input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const ctrl = e.ctrlKey || e.metaKey;

      switch (e.code) {
        // ── Playback ──────────────────────────────────────────────────────
        case "Space":
          e.preventDefault();
          handlers.onPlayPause();
          break;

        case "ArrowRight":
          e.preventDefault();
          if (e.shiftKey) handlers.onNext();
          else audioEngine.seek(audioEngine.currentTime + 5);
          break;

        case "ArrowLeft":
          e.preventDefault();
          if (e.shiftKey) handlers.onPrev();
          else audioEngine.seek(Math.max(0, audioEngine.currentTime - 5));
          break;

        // ── Volume ────────────────────────────────────────────────────────
        case "ArrowUp":
          e.preventDefault();
          {
            const newVol = Math.min(100, volume + 5);
            setVolume?.(newVol);
            audioEngine.setVolume(newVol);
          }
          break;

        case "ArrowDown":
          e.preventDefault();
          {
            const newVol = Math.max(0, volume - 5);
            setVolume?.(newVol);
            audioEngine.setVolume(newVol);
          }
          break;

        case "KeyM":
          if (!ctrl) {
            // Mute toggle
            const isMuted = volume === 0;
            const newVol = isMuted ? 80 : 0;
            setVolume?.(newVol);
            audioEngine.setVolume(newVol);
          }
          break;

        // ── Shuffle & Repeat ──────────────────────────────────────────────
        case "KeyS":
          if (!ctrl) {
            e.preventDefault();
            handlers.onToggleShuffle();
          }
          break;

        case "KeyR":
          if (!ctrl) {
            e.preventDefault();
            handlers.onCycleRepeat();
          }
          break;

        // ── UI ────────────────────────────────────────────────────────────
        case "Key0":
          if (ctrl) { e.preventDefault(); handlers.onToggleMini(); }
          break;

        case "KeyL":
          if (ctrl) { e.preventDefault(); handlers.onToggleLyrics(); }
          break;

        case "Comma":
          if (ctrl) { e.preventDefault(); handlers.onOpenSettings(); }
          break;

        case "KeyF":
          if (!ctrl) { e.preventDefault(); handlers.onFocusSearch(); }
          break;

        // ── Rating 1–5 ────────────────────────────────────────────────────
        case "Digit1": case "Digit2": case "Digit3":
        case "Digit4": case "Digit5":
          if (!ctrl && currentSong) {
            const stars = parseInt(e.code.replace("Digit", ""));
            // Toggle: jika sudah sama, reset ke 0
            // setRating di store
            usePlayerStore.getState().setCurrentSong?.({
              ...currentSong,
              stars: currentSong.stars === stars ? 0 : stars,
            });
          }
          break;
      }
    };

    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [volume, currentSong, handlers]);
}