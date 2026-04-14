/**
 * useFolderWatch.ts — Auto folder watch / rescan hook
 *
 * Cara kerja:
 *   1. Saat komponen mount, panggil `watch_folder` di Rust untuk setiap
 *      watch folder yang tersimpan di settings.
 *   2. Listen ke event "fs:file-added" dari Rust.
 *   3. Saat file baru terdeteksi, parse metadata via scanner.ts dan
 *      tambahkan ke DB + update store — tanpa perlu user action.
 *   4. Debounce 2 detik agar tidak re-scan terlalu cepat saat copy batch.
 *
 * Dipanggil sekali di App.tsx setelah library loaded.
 */

import { useEffect, useRef, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore, useLibraryStore } from "../store";
import { getDb, upsertSong, getAllSongs } from "./db";
import { toastInfo, toastSuccess } from "../components/Notification/ToastSystem";

// Re-use parser logic dari scanner — import fungsi internal
// Kita perlu parseFile yang sudah ada di scanner.ts
// Karena parseFile tidak diekspor, kita duplikat versi ringannya di sini
// untuk file tunggal. Versi lengkap ada di scanner.ts.
import * as musicMetadata from "music-metadata";
import { readFile } from "@tauri-apps/plugin-fs";

const AUDIO_EXTENSIONS = new Set([
  "mp3", "flac", "wav", "ogg", "aac", "m4a", "alac", "wma", "opus", "ape"
]);

const ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif",
]);

const MAX_COVER_ART_BYTES = 2 * 1024 * 1024;

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function getMimeType(ext: string): string {
  const map: Record<string, string> = {
    mp3: "audio/mpeg", flac: "audio/flac", wav: "audio/wav",
    ogg: "audio/ogg", aac: "audio/aac", m4a: "audio/mp4",
    alac: "audio/mp4", wma: "audio/x-ms-wma", opus: "audio/opus", ape: "audio/ape",
  };
  return map[ext] ?? "audio/mpeg";
}

async function parseSingleFile(filePath: string) {
  const ext = filePath.replace(/\\/g, "/").split(".").pop()?.toLowerCase() ?? "";
  const normalizedPath = filePath.replace(/\\/g, "/");
  const bytes = await readFile(normalizedPath);
  const blob  = new Blob([bytes]);

  const meta = await musicMetadata.parseBlob(blob, {
  skipCovers: false,
} as any);

  const { common, format } = meta;
  const fileName = filePath.replace(/\\/g, "/").split("/").pop()?.replace(/\.[^.]+$/, "") ?? "Unknown";

  let coverArt: string | null = null;
  if (common.picture && common.picture.length > 0) {
    const pic = common.picture[0];
    const mime = (pic.format ?? "").toLowerCase().trim();
    if (ALLOWED_IMAGE_MIMES.has(mime) && pic.data.byteLength <= MAX_COVER_ART_BYTES) {
      try {
        coverArt = `data:${mime};base64,${uint8ToBase64(pic.data)}`;
      } catch { /* skip */ }
    }
  }

  return {
  path:       normalizedPath,
  title:      common.title ?? fileName,
  artist:     common.artist ?? common.albumartist ?? "Unknown Artist",
  album:      common.album ?? "Unknown Album",
  genre:      common.genre?.[0] ?? "Unknown",
  year:       common.year ?? null,
  duration:   format.duration ?? 0,
  bitrate:    format.bitrate ? Math.round(format.bitrate / 1000) : 0,
  format:     ext.toUpperCase(),
  cover_art:  coverArt,
  bpm:        common.bpm ?? null,
  file_size:  null,
  loved:      0,
  stars:      undefined,
  play_count: undefined,
};
}

export function useFolderWatch() {
  const { watchFolders, autoScanOnStart } = useSettingsStore() as any;
  const { setSongs } = useLibraryStore();

  const pendingFiles = useRef<string[]>([]);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isProcessing = useRef(false);

  // Proses antrian file baru
  const processQueue = useCallback(async () => {
    if (isProcessing.current || pendingFiles.current.length === 0) return;
    isProcessing.current = true;

    const toProcess = [...pendingFiles.current];
    pendingFiles.current = [];

    try {
      const db = await getDb();
      let added = 0;

      for (const filePath of toProcess) {
        try {
          const song = await parseSingleFile(filePath);
          await upsertSong(db, song);
          added++;
        } catch (err) {
          console.warn("[FolderWatch] Gagal parse:", filePath, err);
        }
      }

      if (added > 0) {
        // Refresh store
        const updated = await getAllSongs(db);
        setSongs(Array.isArray(updated) ? updated : []);
        toastSuccess(`📂 ${added} file baru ditambahkan otomatis`);
      }
    } finally {
      isProcessing.current = false;
      // Jika ada file baru yang masuk saat processing, proses lagi
      if (pendingFiles.current.length > 0) {
        debounceTimer.current = setTimeout(processQueue, 2000);
      }
    }
  }, [setSongs]);

  // Handle event file baru dari Rust
  const handleFileAdded = useCallback((filePath: string) => {
    const ext = filePath.replace(/\\/g, "/").split(".").pop()?.toLowerCase() ?? "";
    if (!AUDIO_EXTENSIONS.has(ext)) return;

    pendingFiles.current.push(filePath);

    // Debounce 2 detik
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(processQueue, 2000);
  }, [processQueue]);

  // Setup: watch semua folder di settings
  useEffect(() => {
    if (!watchFolders || watchFolders.length === 0) return;
    if (!(window as any).__TAURI_INTERNALS__) return;

    // Start watching semua folder
    const startWatching = async () => {
      for (const folder of watchFolders) {
        try {
          await invoke("watch_folder", { path: folder });
        } catch (err) {
          console.warn("[FolderWatch] Gagal watch:", folder, err);
        }
      }
    };

    startWatching();

    // Listen ke event dari Rust
    let unlisten: (() => void) | null = null;
    listen<string>("fs:file-added", (event) => {
      handleFileAdded(event.payload);
    }).then((fn) => {
      unlisten = fn;
    });

    // Cleanup: unwatch semua folder saat unmount
    return () => {
      unlisten?.();
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      // Unwatch semua
      for (const folder of watchFolders) {
        invoke("unwatch_folder", { path: folder }).catch(() => {});
      }
    };
  }, [watchFolders, handleFileAdded]);

  // Auto-scan on startup
  useEffect(() => {
    if (!autoScanOnStart) return;
    if (!watchFolders || watchFolders.length === 0) return;
    if (!(window as any).__TAURI_INTERNALS__) return;

    // Tunda auto-scan 3 detik setelah app ready agar tidak berebut resource dengan init
    const timer = setTimeout(async () => {
      toastInfo("Auto scan on startup...");
      try {
        const db = await getDb();
        // Kita tidak scan ulang penuh di sini — hanya update count
        // Scan penuh tetap dilakukan user via tombol 📁
        // Tapi kita check apakah ada folder baru yang perlu di-watch
        for (const folder of watchFolders) {
          try {
            await invoke("watch_folder", { path: folder });
          } catch { /* skip */ }
        }
      } catch { /* skip */ }
    }, 3000);

    return () => clearTimeout(timer);
  }, [autoScanOnStart, watchFolders]);
}