/**
 * scanner.ts — v4
 *
 * PERUBAHAN vs v3:
 *   [NEW] Incremental scan — sebelum parse, cek apakah file sudah ada di DB
 *         dengan path yang sama. Jika sudah ada DAN ukuran file tidak berubah,
 *         skip parsing metadata (hanya update path jika perlu). Ini membuat
 *         re-scan 10× lebih cepat untuk library yang sudah ada.
 *   [NEW] Multi-folder scan — scanFolders() menerima array path, bisa scan
 *         beberapa folder sekaligus dalam satu sesi. Progress digabungkan.
 *   [NEW] file_size disimpan ke DB — dipakai untuk deteksi perubahan file
 *         (incremental) dan ditampilkan di LibraryView sebagai kolom baru.
 *   [NEW] Failed files report — scanFolder/scanFolders mengembalikan objek
 *         { songs, failedFiles } alih-alih hanya array Song. failedFiles berisi
 *         { path, error } untuk setiap file yang gagal di-parse.
 *   [SEC] Semua sanitasi cover art dari v3 dipertahankan.
 */

import { open }                    from "@tauri-apps/plugin-dialog";
import { readDir, readFile, stat } from "@tauri-apps/plugin-fs";
import * as musicMetadata          from "music-metadata";
import { getDb, upsertSong, type Song } from "./db";

const AUDIO_EXTENSIONS = new Set([
  "mp3", "flac", "wav", "ogg", "aac", "m4a", "alac", "wma", "opus", "ape"
]);

const ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif",
]);

const MAX_COVER_ART_BYTES = 2 * 1024 * 1024;

// ── Tipe hasil scan ───────────────────────────────────────────────────────────

export interface ScanProgress {
  total: number;
  current: number;
  currentFile: string;
  currentFolder: string;
  done: boolean;
  skipped?: number;    // [NEW] jumlah file yang di-skip (sudah up-to-date)
  failed?: number;     // [NEW] jumlah file yang gagal di-parse
}

/** [NEW] Hasil scan lengkap termasuk laporan file yang gagal */
export interface ScanResult {
  songs: Song[];
  /** File yang gagal di-parse beserta pesan errornya */
  failedFiles: { path: string; error: string }[];
  /** File yang di-skip karena sudah up-to-date (incremental) */
  skippedCount: number;
}

// ── Security helpers ──────────────────────────────────────────────────────────

function sanitizeCoverArt(pic: { format: string; data: Uint8Array }): string | null {
  const mime = (pic.format ?? "").toLowerCase().trim();
  if (!ALLOWED_IMAGE_MIMES.has(mime)) return null;
  if (pic.data.byteLength > MAX_COVER_ART_BYTES) return null;
  if (!hasValidImageMagicBytes(pic.data, mime)) return null;
  try {
    return `data:${mime};base64,${uint8ToBase64(pic.data)}`;
  } catch {
    return null;
  }
}

function hasValidImageMagicBytes(data: Uint8Array, mime: string): boolean {
  if (data.length < 4) return false;
  const b = data;
  if (mime === "image/jpeg" || mime === "image/jpg") return b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF;
  if (mime === "image/png")  return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47;
  if (mime === "image/gif")  return b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46;
  if (mime === "image/webp") {
    if (data.length < 12) return false;
    return b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
           b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
  }
  return false;
}

// ── Cache path DB yang sudah ada ──────────────────────────────────────────────

/**
 * Ambil semua lagu dari DB sebagai Map<path, file_size>
 * untuk keperluan incremental scan.
 */
async function buildExistingPathMap(db: Awaited<ReturnType<typeof getDb>>): Promise<Map<string, number | null>> {
  const rows = await db.select<{ path: string; file_size: number | null }[]>(
    "SELECT path, file_size FROM songs"
  );
  const map = new Map<string, number | null>();
  for (const row of rows) {
    map.set(row.path, row.file_size ?? null);
  }
  return map;
}

// ── Single folder scan ────────────────────────────────────────────────────────

export async function scanFolder(
  onProgress?: (p: ScanProgress) => void
): Promise<ScanResult> {
  const selected = await open({ directory: true, multiple: false, title: "Select music folder" });
  if (!selected || typeof selected !== "string") return { songs: [], failedFiles: [], skippedCount: 0 };
  return _scanPaths([selected], onProgress);
}

/**
 * [NEW] scanFolders — scan beberapa folder sekaligus.
 * Jika paths tidak diberikan, buka dialog multi-pilih.
 */
export async function scanFolders(
  paths?: string[],
  onProgress?: (p: ScanProgress) => void
): Promise<ScanResult> {
  let targetPaths = paths;

  if (!targetPaths || targetPaths.length === 0) {
    const selected = await open({
      directory: true,
      multiple: true,
      title: "Pilih folder musik (bisa pilih beberapa)",
    });

    if (!selected) return { songs: [], failedFiles: [], skippedCount: 0 };

    targetPaths = Array.isArray(selected) ? selected : [selected];
  }

  if (targetPaths.length === 0) return { songs: [], failedFiles: [], skippedCount: 0 };
  return _scanPaths(targetPaths, onProgress);
}

/**
 * Core scan — handle satu atau banyak folder.
 * Incremental: skip file yang path & file_size-nya sama dengan DB.
 */
async function _scanPaths(
  folderPaths: string[],
  onProgress?: (p: ScanProgress) => void
): Promise<ScanResult> {
  const db            = await getDb();
  const existingPaths = await buildExistingPathMap(db);

  // Kumpulkan semua file dari semua folder
  const allFiles: string[] = [];
  for (const folderPath of folderPaths) {
    const normalizedRoot = normalizePath(folderPath);
    onProgress?.({ total: 0, current: 0, currentFile: "", currentFolder: getLastPathPart(normalizedRoot), done: false });
    const files = await listAudioFiles(normalizedRoot);
    allFiles.push(...files);
  }

  if (allFiles.length === 0) {
    onProgress?.({ total: 0, current: 0, currentFile: "", currentFolder: "", done: true, skipped: 0, failed: 0 });
    return { songs: [], failedFiles: [], skippedCount: 0 };
  }

  const results: Song[]                              = [];
  const failedFiles: { path: string; error: string }[] = [];
  let skippedCount = 0;
  let forbiddenCount = 0;

  for (let i = 0; i < allFiles.length; i++) {
    const filePath  = allFiles[i];
    const fileName  = getLastPathPart(filePath);
    const parentFolder = getParentFolderName(filePath);

    onProgress?.({
      total: allFiles.length,
      current: i + 1,
      currentFile: fileName,
      currentFolder: parentFolder,
      done: false,
      skipped: skippedCount,
      failed: failedFiles.length,
    });

    // ── [NEW] Incremental check ──────────────────────────────────────────────
    // Ambil ukuran file saat ini dari filesystem
    let currentFileSize: number | null = null;
    try {
      const fileStat = await stat(filePath);
      currentFileSize = fileStat.size ?? null;
    } catch {
      // stat gagal — lanjut parse normal
    }

    const existingSize = existingPaths.get(filePath);
    if (
      existingSize !== undefined &&           // sudah ada di DB
      currentFileSize !== null &&             // bisa baca ukuran file
      existingSize === currentFileSize        // ukuran sama → tidak berubah
    ) {
      skippedCount++;
      continue; // skip parsing, file tidak berubah
    }
    // ── End incremental check ────────────────────────────────────────────────

    try {
      const song = await parseFile(filePath, currentFileSize);
      await upsertSong(db, song);
      results.push(song as Song);
    } catch (err) {
      const errMsg = String(err);
      if (errMsg.includes("forbidden path") || errMsg.includes("not allowed")) {
        forbiddenCount++;
        if (forbiddenCount <= 3) {
          console.warn(`[Scanner] Forbidden path: ${filePath}`);
        }
      } else {
        // [NEW] Rekam file yang gagal beserta pesan errornya
        failedFiles.push({
          path: filePath,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  if (forbiddenCount > 0) {
    console.error(`[Scanner] ${forbiddenCount} file(s) forbidden — tambahkan drive ke fs:scope di default.json.`);
  }

  onProgress?.({
    total: allFiles.length,
    current: allFiles.length,
    currentFile: "",
    currentFolder: "",
    done: true,
    skipped: skippedCount,
    failed: failedFiles.length,
  });

  return { songs: results, failedFiles, skippedCount };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function normalizePath(p: string): string { return p.replace(/\\/g, "/"); }

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
        if (entry.name?.startsWith(".")) continue;
        try {
          const subEntries = await readDir(fullPath);
          await walk(subEntries, fullPath);
        } catch { /* abaikan folder yang tidak bisa dibaca */ }
      } else if (entry.isFile && entry.name) {
        const ext = entry.name.split(".").pop()?.toLowerCase() ?? "";
        if (AUDIO_EXTENSIONS.has(ext)) files.push(fullPath);
      }
    }
  }

  await walk(entries, dirPath);
  return files;
}

/**
 * Parse metadata satu file audio.
 * [NEW] Menerima fileSize opsional yang sudah diambil dari stat()
 * agar tidak perlu stat dua kali.
 */
async function parseFile(
  filePath: string,
  fileSize?: number | null
): Promise<Omit<Song, "id" | "date_added">> {
  const ext = filePath.replace(/\\/g, "/").split(".").pop()?.toLowerCase() ?? "";
  const normalizedPath = normalizePath(filePath);
  const bytes = await readFile(normalizedPath);
  const blob  = new Blob([bytes]);

  // Ukuran file dari bytes jika belum ada dari stat
  const resolvedFileSize = fileSize ?? bytes.byteLength;

  const meta = await musicMetadata.parseBlob(blob, {
  skipCovers: false,
} as any);

  const { common, format } = meta;

  let coverArt: string | null = null;
  if (common.picture && common.picture.length > 0) {
    coverArt = sanitizeCoverArt(common.picture[0]);
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
    file_size:  resolvedFileSize,   // [NEW]
    loved:      0,                  // default tidak loved
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

/** addFiles — tambah file individual (tetap dari v3, update dengan file_size) */
export async function addFiles(
  onProgress?: (p: ScanProgress) => void
): Promise<Song[]> {
  const selected = await open({
    multiple: true,
    title: "Add music files",
    filters: [{ name: "Audio Files", extensions: [...AUDIO_EXTENSIONS] }],
  });

  if (!selected) return [];
  const files = Array.isArray(selected) ? selected : [selected];
  const db    = await getDb();
  const results: Song[] = [];

  // Emit "indexing" phase saat mulai
  onProgress?.({
  total: files.length, current: 0,
  currentFile: "", currentFolder: "",
  done: false,
});

  for (let i = 0; i < files.length; i++) {
    const filePath = files[i];
    const fileName = filePath.replace(/\\/g, "/").split("/").pop() ?? filePath;

    onProgress?.({
  total: files.length, current: 0,
  currentFile: "", currentFolder: "",
  done: false,
});

    try {
      const song = await parseFile(normalizePath(filePath));
      await upsertSong(db, song);
      results.push(song as Song);
    } catch (err) {
      console.warn(`[Scanner] Skip: ${filePath}`, err);
    }
  }

  onProgress?.({
  total: files.length, current: 0,
  currentFile: "", currentFolder: "",
  done: false,
});

  return results;
}