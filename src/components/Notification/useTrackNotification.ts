/**
 * useTrackNotification.ts — v2
 *
 * FIX vs v1:
 *   - notificationsEnabled sekarang membaca dari useSettingsStore
 *     (sebelumnya hardcoded = true, tidak bisa dimatikan dari Settings)
 *   - Hook otomatis berhenti kirim notifikasi kalau user matikan di Settings
 */

import { useEffect, useRef } from "react";
import { usePlayerStore, useSettingsStore } from "../../store";

// Cek apakah Tauri notification plugin tersedia
async function sendTauriNotification(title: string, body: string, icon?: string) {
  try {
    const { sendNotification, isPermissionGranted, requestPermission } =
      await import("@tauri-apps/plugin-notification");

    let granted = await isPermissionGranted();
    if (!granted) {
      const perm = await requestPermission();
      granted = perm === "granted";
    }

    if (granted) {
      await sendNotification({
        title,
        body,
        icon: icon || undefined,
      });
      return true;
    }
  } catch {
    // Plugin tidak tersedia, fallback ke Web API
  }
  return false;
}

// Fallback: Web Notification API
async function sendWebNotification(title: string, body: string, icon?: string) {
  if (!("Notification" in window)) return;

  if (Notification.permission === "default") {
    await Notification.requestPermission();
  }

  if (Notification.permission === "granted") {
    new Notification(title, { body, icon, silent: true });
  }
}

export function useTrackNotification() {
  const { currentSong } = usePlayerStore();
  const prevSongId = useRef<number | null>(null);

  // [FIX] Baca dari store, bukan hardcoded true
  const { notificationsEnabled } = useSettingsStore() as any;

  useEffect(() => {
    if (!currentSong) return;

    // Jika notifikasi dimatikan user → tidak kirim sama sekali
    if (!notificationsEnabled) return;

    // Hanya kirim jika lagu benar-benar berganti (bukan re-render)
    if (prevSongId.current === currentSong.id) return;
    prevSongId.current = currentSong.id;

    const title = currentSong.title ?? "Unknown Track";
    const body = [currentSong.artist, currentSong.album].filter(Boolean).join(" · ");
    const icon = currentSong.cover_art ?? undefined;

    // Coba Tauri dulu, fallback ke Web API
    sendTauriNotification(title, body, icon).then(sent => {
      if (!sent) sendWebNotification(title, body, icon);
    });
  }, [currentSong?.id, notificationsEnabled]);
}

/**
 * Hook untuk request notification permission saat app pertama dibuka.
 * Dipanggil sekali di App.tsx.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const { isPermissionGranted, requestPermission } =
      await import("@tauri-apps/plugin-notification");
    const granted = await isPermissionGranted();
    if (!granted) {
      const result = await requestPermission();
      return result === "granted";
    }
    return true;
  } catch {
    // Fallback web API
    if ("Notification" in window && Notification.permission === "default") {
      const result = await Notification.requestPermission();
      return result === "granted";
    }
    return Notification.permission === "granted";
  }
}