/**
 * useMiniPlayer.ts — Hook untuk manage mini player window
 *
 * Tugasnya:
 *   1. Buka/tutup window mini player
 *   2. Sync state (track, progress) ke mini player via event
 *   3. Terima command dari mini player (play/pause/next/prev/close)
 */

import { useEffect, useRef, useCallback } from "react";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emit, listen } from "@tauri-apps/api/event";
import { usePlayerStore } from "../../store";

export function useMiniPlayer() {
  const miniWinRef = useRef<WebviewWindow | null>(null);
  const { currentSong, isPlaying, progress, duration, volume } = usePlayerStore();

  // ── Sync state ke mini window setiap ada perubahan ───────────────────────
  useEffect(() => {
    if (!miniWinRef.current) return;

    emit("mini:state", {
      title: currentSong?.title ?? "No track",
      artist: currentSong?.artist ?? "",
      songId: currentSong?.id ?? 0,
      coverArt: currentSong?.cover_art ?? null,
      isPlaying,
      progress,
      duration,
      volume,
    });
  }, [currentSong, isPlaying, progress, duration, volume]);

  // ── Buka mini player ─────────────────────────────────────────────────────
  const openMini = useCallback(async () => {
    if (miniWinRef.current) {
      // Sudah ada, focus saja
      await miniWinRef.current.setFocus();
      return;
    }

    const win = new WebviewWindow("mini", {
      url: "/#/mini",         // route mini player
      title: "Resonance Mini",
      width: 340,
      height: 68,
      minWidth: 280,
      minHeight: 60,
      maxHeight: 80,
      resizable: true,
      decorations: false,     // no title bar (custom drag)
      alwaysOnTop: true,
      skipTaskbar: true,      // tidak muncul di taskbar
      transparent: true,
    });

    miniWinRef.current = win;

    // Kirim state saat mini siap
    win.once("tauri://created", async () => {
      await emit("mini:state", {
        title: currentSong?.title ?? "No track",
        artist: currentSong?.artist ?? "",
        songId: currentSong?.id ?? 0,
        coverArt: currentSong?.cover_art ?? null,
        isPlaying, progress, duration, volume,
      });
    });

    win.once("tauri://destroyed", () => {
      miniWinRef.current = null;
    });
  }, [currentSong, isPlaying, progress, duration, volume]);

  const closeMini = useCallback(async () => {
    await miniWinRef.current?.close();
    miniWinRef.current = null;
  }, []);

  const isMiniOpen = () => miniWinRef.current !== null;

  return { openMini, closeMini, isMiniOpen };
}

/**
 * Hook untuk dipakai di MAIN window — listen command dari mini player
 * dan forward ke audio engine.
 */
export function useMiniPlayerCommands(handlers: {
  onPlayPause: () => void;
  onNext: () => void;
  onPrev: () => void;
}) {
  useEffect(() => {
    const unlisteners: (() => void)[] = [];

    (async () => {
      unlisteners.push(await listen("mini:playpause", handlers.onPlayPause));
      unlisteners.push(await listen("mini:next",      handlers.onNext));
      unlisteners.push(await listen("mini:prev",      handlers.onPrev));
      unlisteners.push(await listen("mini:close",     async () => {
        // Tutup dari main window side
        const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
        const win = await WebviewWindow.getByLabel("mini");
        await win?.close();
      }));
      // Main window kirim state saat mini minta
      unlisteners.push(await listen("mini:request-state", () => {
        // State sync sudah di-handle di useMiniPlayer useEffect
      }));
    })();

    return () => unlisteners.forEach(fn => fn());
  }, [handlers.onPlayPause, handlers.onNext, handlers.onPrev]);
}