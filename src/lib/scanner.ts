/**
 * scanner.ts — File Scanner & Metadata Reader
 *
 * WHY: Tauri tidak bisa langsung pakai `music-metadata` (Node.js) di renderer
 * karena renderer adalah browser context. Solusinya:
 *   1. Tauri command (Rust) membaca bytes dari file
 *   2. Kita parse metadata di frontend menggunakan music-metadata/browser
 *
 * FLOW:
 *   user pilih folder → Rust list semua file audio →
 *   frontend baca tiap file → parse metadata → upsert ke SQLite
 */

import { open } from "@tauri-apps/plugin-dialog";
import { readDir, readFile } from "@tauri-apps/plugin-fs";
import * as musicMetadata from "music-metadata";
import { getDb, upsertSong, type Song } from "./db";

// Format audio yang didukung
const AUDIO_EXTENSIONS = new Set([
  "mp3", "flac", "wav", "ogg", "aac", "m4a", "alac", "wma", "opus", "ape"
]);

export interface ScanProgress {
  total: number;
  current: number;
  currentFile: string;
  done: boolean;
}

/**
 * Buka dialog pilih folder, scan semua file audio di dalamnya,
 * baca metadata, lalu simpan ke SQLite.
 *
 * @param onProgress callback dipanggil setiap file diproses
 * @returns array Song yang berhasil di-scan
 */
export async function scanFolder(
  onProgress?: (p: ScanProgress) => void
): Promise<Song[]> {
  // 1. Buka dialog pilih folder
  const selected = await open({
    directory: true,
    multiple: false,
    title: "Pilih folder musik",
  });

  if (!selected || typeof selected !== "string") return [];

  // 2. List semua file secara rekursif
  const allFiles = await listAudioFiles(selected);

  if (allFiles.length === 0) return [];

  const db = await getDb();
  const results: Song[] = [];

  // 3. Proses tiap file
  for (let i = 0; i < allFiles.length; i++) {
    const filePath = allFiles[i];
    const fileName = filePath.split(/[\\/]/).pop() ?? filePath;

    onProgress?.({
      total: allFiles.length,
      current: i + 1,
      currentFile: fileName,
      done: false,
    });

    try {
      const song = await parseFile(filePath);
      await upsertSong(db, song);
      results.push(song as Song);
    } catch (err) {
      console.warn(`Skip file (error): ${filePath}`, err);
    }
  }

  onProgress?.({
    total: allFiles.length,
    current: allFiles.length,
    currentFile: "",
    done: true,
  });

  return results;
}

/** Recursively list semua file audio dari sebuah folder */
async function listAudioFiles(dirPath: string): Promise<string[]> {
  const entries = await readDir(dirPath, { recursive: true });
  const files: string[] = [];

  function walk(items: typeof entries) {
    for (const entry of items) {
      if (entry.children) {
        walk(entry.children);
      } else if (entry.name) {
        const ext = entry.name.split(".").pop()?.toLowerCase() ?? "";
        if (AUDIO_EXTENSIONS.has(ext)) {
          files.push(entry.path);
        }
      }
    }
  }

  walk(entries);
  return files;
}

/**
 * Parse metadata dari satu file audio.
 * Menggunakan music-metadata untuk baca ID3/Vorbis/APE tags.
 */
async function parseFile(filePath: string): Promise<Omit<Song, "id" | "date_added">> {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";

  // Baca file sebagai Uint8Array via Tauri FS
  const bytes = await readFile(filePath);
  const blob = new Blob([bytes]);

  // Parse metadata
  const meta = await musicMetadata.parseBlob(blob, {
    mimeType: getMimeType(ext),
    skipCovers: false,
  });

  const { common, format } = meta;

  // Extract cover art → base64 string
  let coverArt: string | null = null;
  if (common.picture && common.picture.length > 0) {
    const pic = common.picture[0];
    const b64 = uint8ToBase64(pic.data);
    coverArt = `data:${pic.format};base64,${b64}`;
  }

  // Fallback title dari filename jika tag kosong
  const fileName = filePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "") ?? "Unknown";

  return {
    path: filePath,
    title: common.title ?? fileName,
    artist: common.artist ?? common.albumartist ?? "Unknown Artist",
    album: common.album ?? "Unknown Album",
    genre: common.genre?.[0] ?? "Unknown",
    year: common.year ?? null,
    duration: format.duration ?? 0,
    bitrate: format.bitrate ? Math.round(format.bitrate / 1000) : 0,
    format: ext.toUpperCase(),
    cover_art: coverArt,
    bpm: common.bpm ?? null,
    stars: undefined,
    play_count: undefined,
  };
}

/** Konversi Uint8Array ke base64 string */
function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Map file extension ke MIME type */
function getMimeType(ext: string): string {
  const map: Record<string, string> = {
    mp3: "audio/mpeg",
    flac: "audio/flac",
    wav: "audio/wav",
    ogg: "audio/ogg",
    aac: "audio/aac",
    m4a: "audio/mp4",
    alac: "audio/mp4",
    wma: "audio/x-ms-wma",
    opus: "audio/opus",
    ape: "audio/ape",
  };
  return map[ext] ?? "audio/mpeg";
}

/**
 * Tambah file satu per satu (drag & drop / open file dialog).
 * Berguna saat user tidak mau scan satu folder penuh.
 */
export async function addFiles(): Promise<Song[]> {
  const selected = await open({
    multiple: true,
    title: "Tambah file musik",
    filters: [{
      name: "Audio Files",
      extensions: [...AUDIO_EXTENSIONS],
    }],
  });

  if (!selected) return [];
  const files = Array.isArray(selected) ? selected : [selected];

  const db = await getDb();
  const results: Song[] = [];

  for (const filePath of files) {
    try {
      const song = await parseFile(filePath);
      await upsertSong(db, song);
      results.push(song as Song);
    } catch (err) {
      console.warn(`Skip: ${filePath}`, err);
    }
  }

  return results;
}