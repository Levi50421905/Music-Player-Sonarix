/**
 * scanner.ts — File Scanner & Metadata Reader
 *
 * Fix:
 *   - scanFolder: rekursif via walk() yang benar untuk Tauri v2
 *   - readDir tidak ada recursive option di Tauri v2 — harus manual walk
 *   - addFiles: support multiple file select
 */

import { open } from "@tauri-apps/plugin-dialog";
import { readDir, readFile } from "@tauri-apps/plugin-fs";
import * as musicMetadata from "music-metadata";
import { getDb, upsertSong, type Song } from "./db";

const AUDIO_EXTENSIONS = new Set([
  "mp3", "flac", "wav", "ogg", "aac", "m4a", "alac", "wma", "opus", "ape"
]);

export interface ScanProgress {
  total: number;
  current: number;
  currentFile: string;
  done: boolean;
}

export async function scanFolder(
  onProgress?: (p: ScanProgress) => void
): Promise<Song[]> {
  const selected = await open({
    directory: true,
    multiple: false,
    title: "Pilih folder musik",
  });

  if (!selected || typeof selected !== "string") return [];

  const allFiles = await listAudioFiles(selected);

  if (allFiles.length === 0) {
    onProgress?.({ total: 0, current: 0, currentFile: "", done: true });
    return [];
  }

  const db = await getDb();
  const results: Song[] = [];

  for (let i = 0; i < allFiles.length; i++) {
    const filePath = allFiles[i];
    const fileName = filePath.replace(/\\/g, "/").split("/").pop() ?? filePath;

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

  onProgress?.({ total: allFiles.length, current: allFiles.length, currentFile: "", done: true });
  return results;
}

async function listAudioFiles(dirPath: string): Promise<string[]> {
  const entries = await readDir(dirPath);
  const files: string[] = [];

  async function walk(items: Awaited<ReturnType<typeof readDir>>, basePath: string) {
    for (const entry of items) {
      const fullPath = `${basePath}/${entry.name}`;

      if (entry.isDirectory) {
        try {
          const subEntries = await readDir(fullPath);
          await walk(subEntries, fullPath);
        } catch {
          // Skip inaccessible folders
        }
      } else if (entry.isFile && entry.name) {
        const ext = entry.name.split(".").pop()?.toLowerCase() ?? "";
        if (AUDIO_EXTENSIONS.has(ext)) {
          files.push(fullPath);
        }
      }
    }
  }

  await walk(entries, dirPath);
  return files;
}

async function parseFile(filePath: string): Promise<Omit<Song, "id" | "date_added">> {
  const ext = filePath.replace(/\\/g, "/").split(".").pop()?.toLowerCase() ?? "";

  const bytes = await readFile(filePath);
  const blob  = new Blob([bytes]);

  const meta = await musicMetadata.parseBlob(blob, {
    mimeType: getMimeType(ext),
    skipCovers: false,
  });

  const { common, format } = meta;

  let coverArt: string | null = null;
  if (common.picture && common.picture.length > 0) {
    const pic = common.picture[0];
    coverArt  = `data:${pic.format};base64,${uint8ToBase64(pic.data)}`;
  }

  const fileName = filePath.replace(/\\/g, "/").split("/").pop()?.replace(/\.[^.]+$/, "") ?? "Unknown";

  return {
    path:      filePath,
    title:     common.title ?? fileName,
    artist:    common.artist ?? common.albumartist ?? "Unknown Artist",
    album:     common.album ?? "Unknown Album",
    genre:     common.genre?.[0] ?? "Unknown",
    year:      common.year ?? null,
    duration:  format.duration ?? 0,
    bitrate:   format.bitrate ? Math.round(format.bitrate / 1000) : 0,
    format:    ext.toUpperCase(),
    cover_art: coverArt,
    bpm:       common.bpm ?? null,
    stars:     undefined,
    play_count: undefined,
  };
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
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

export async function addFiles(): Promise<Song[]> {
  const selected = await open({
    multiple: true,
    title: "Tambah file musik",
    filters: [{ name: "Audio Files", extensions: [...AUDIO_EXTENSIONS] }],
  });

  if (!selected) return [];
  const files = Array.isArray(selected) ? selected : [selected];

  const db      = await getDb();
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