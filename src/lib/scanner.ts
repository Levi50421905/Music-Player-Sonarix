/**
 * scanner.ts — v3 (security: cover art sanitization)
 *
 * FIXES vs v2:
 *   [SEC] Cover art validation: hanya izinkan MIME type image yang aman
 *         (jpeg/png/webp/gif). Format lain di-reject.
 *   [SEC] Cover art size limit: base64 > 2MB di-truncate/reject agar tidak
 *         jadi attack vector via manipulated metadata.
 *   [SEC] Path normalization tetap dipertahankan dari v2.
 */

import { open } from "@tauri-apps/plugin-dialog";
import { readDir, readFile } from "@tauri-apps/plugin-fs";
import * as musicMetadata from "music-metadata";
import { getDb, upsertSong, type Song } from "./db";

const AUDIO_EXTENSIONS = new Set([
  "mp3", "flac", "wav", "ogg", "aac", "m4a", "alac", "wma", "opus", "ape"
]);

// [SEC] Hanya MIME type gambar yang aman untuk cover art
const ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

// [SEC] Batas ukuran cover art base64: 2MB
const MAX_COVER_ART_BYTES = 2 * 1024 * 1024;

export interface ScanProgress {
  total: number;
  current: number;
  currentFile: string;
  currentFolder: string;
  done: boolean;
}

/**
 * [SEC] Validasi dan sanitasi cover art dari metadata.
 * Return null jika MIME tidak diizinkan atau ukuran terlalu besar.
 */
function sanitizeCoverArt(pic: { format: string; data: Uint8Array }): string | null {
  // Normalize MIME type
  const mime = (pic.format ?? "").toLowerCase().trim();

  // Reject MIME yang tidak diizinkan
  if (!ALLOWED_IMAGE_MIMES.has(mime)) {
    console.warn(`[Scanner] Cover art rejected: unsupported MIME type "${mime}"`);
    return null;
  }

  // [SEC] Reject jika data terlalu besar (kemungkinan payload berbahaya)
  if (pic.data.byteLength > MAX_COVER_ART_BYTES) {
    console.warn(
      `[Scanner] Cover art rejected: size ${(pic.data.byteLength / 1024 / 1024).toFixed(1)}MB exceeds 2MB limit`
    );
    return null;
  }

  // [SEC] Validasi magic bytes untuk jpeg, png, webp, gif
  if (!hasValidImageMagicBytes(pic.data, mime)) {
    console.warn(`[Scanner] Cover art rejected: magic bytes mismatch for MIME "${mime}"`);
    return null;
  }

  try {
    const base64 = uint8ToBase64(pic.data);
    return `data:${mime};base64,${base64}`;
  } catch {
    console.warn("[Scanner] Cover art rejected: base64 encoding failed");
    return null;
  }
}

/**
 * [SEC] Validasi magic bytes gambar agar MIME yang diklaim cocok dengan konten aktual.
 */
function hasValidImageMagicBytes(data: Uint8Array, mime: string): boolean {
  if (data.length < 4) return false;

  const b = data;

  if (mime === "image/jpeg" || mime === "image/jpg") {
    // JPEG: FF D8 FF
    return b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF;
  }

  if (mime === "image/png") {
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47;
  }

  if (mime === "image/gif") {
    // GIF87a or GIF89a
    return b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46;
  }

  if (mime === "image/webp") {
    // RIFF....WEBP
    if (data.length < 12) return false;
    const riff = b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46;
    const webp = b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
    return riff && webp;
  }

  // Format tidak dikenal → tolak
  return false;
}

export async function scanFolder(
  onProgress?: (p: ScanProgress) => void
): Promise<Song[]> {
  const selected = await open({
    directory: true,
    multiple: false,
    title: "Select music folder",
  });

  if (!selected || typeof selected !== "string") return [];

  const normalizedRoot = normalizePath(selected);
  const folderName = getLastPathPart(normalizedRoot);

  onProgress?.({
    total: 0, current: 0, currentFile: "",
    currentFolder: folderName, done: false
  });

  const allFiles = await listAudioFiles(normalizedRoot);

  if (allFiles.length === 0) {
    onProgress?.({
      total: 0, current: 0, currentFile: "",
      currentFolder: folderName, done: true
    });
    return [];
  }

  const db = await getDb();
  const results: Song[] = [];
  let forbiddenCount = 0;
  let errorCount = 0;

  for (let i = 0; i < allFiles.length; i++) {
    const filePath = allFiles[i];
    const fileName = getLastPathPart(filePath);
    const parentFolder = getParentFolderName(filePath);

    onProgress?.({
      total: allFiles.length,
      current: i + 1,
      currentFile: fileName,
      currentFolder: parentFolder,
      done: false,
    });

    try {
      const song = await parseFile(filePath);
      await upsertSong(db, song);
      results.push(song as Song);
    } catch (err) {
      const errMsg = String(err);
      if (errMsg.includes("forbidden path") || errMsg.includes("not allowed")) {
        forbiddenCount++;
        if (forbiddenCount <= 3) {
          console.warn(`[Scanner] Forbidden path (check default.json scope): ${filePath}`);
        }
      } else {
        errorCount++;
        console.warn(`[Scanner] Skip file (parse error): ${fileName}`, err);
      }
    }
  }

  if (forbiddenCount > 0) {
    console.error(
      `[Scanner] ${forbiddenCount} file(s) forbidden — tambahkan drive ke fs:scope di default.json.\n` +
      `Contoh: { "path": "H:\\\\**" }`
    );
  }
  if (errorCount > 0) {
    console.warn(`[Scanner] ${errorCount} file(s) gagal di-parse (format tidak didukung atau corrupt)`);
  }

  onProgress?.({
    total: allFiles.length,
    current: allFiles.length,
    currentFile: "",
    currentFolder: folderName,
    done: true,
  });

  return results;
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

function getLastPathPart(path: string): string {
  return path.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? path;
}

function getParentFolderName(filePath: string): string {
  const parts = filePath.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 2];
  return parts[0] ?? "";
}

async function listAudioFiles(dirPath: string): Promise<string[]> {
  const entries = await readDir(dirPath);
  const files: string[] = [];

  async function walk(items: Awaited<ReturnType<typeof readDir>>, basePath: string) {
    for (const entry of items) {
      const fullPath = `${basePath.replace(/\\/g, "/")}/${entry.name}`;

      if (entry.isDirectory) {
        try {
          const subEntries = await readDir(fullPath);
          await walk(subEntries, fullPath);
        } catch {
          // Skip inaccessible folders silently
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
  const normalizedPath = normalizePath(filePath);
  const bytes = await readFile(normalizedPath);
  const blob  = new Blob([bytes]);

  const meta = await musicMetadata.parseBlob(blob, {
    mimeType: getMimeType(ext),
    skipCovers: false,
  });

  const { common, format } = meta;

  // [SEC] Sanitasi cover art sebelum disimpan ke DB
  let coverArt: string | null = null;
  if (common.picture && common.picture.length > 0) {
    const pic = common.picture[0];
    coverArt = sanitizeCoverArt(pic);
  }

  const fileName = filePath.replace(/\\/g, "/").split("/").pop()?.replace(/\.[^.]+$/, "") ?? "Unknown";

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
    stars:      undefined,
    play_count: undefined,
  };
}

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

export async function addFiles(): Promise<Song[]> {
  const selected = await open({
    multiple: true,
    title: "Add music files",
    filters: [{ name: "Audio Files", extensions: [...AUDIO_EXTENSIONS] }],
  });

  if (!selected) return [];
  const files = Array.isArray(selected) ? selected : [selected];

  const db      = await getDb();
  const results: Song[] = [];

  for (const filePath of files) {
    try {
      const song = await parseFile(normalizePath(filePath));
      await upsertSong(db, song);
      results.push(song as Song);
    } catch (err) {
      console.warn(`[Scanner] Skip: ${filePath}`, err);
    }
  }

  return results;
}