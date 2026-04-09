/**
 * playlistIO.ts — Export & Import Playlist (.m3u / .m3u8)
 *
 * WHY format .m3u:
 *   - Standar universal yang didukung hampir semua media player
 *   - Format teks biasa → mudah di-edit manual
 *   - Compatible dengan VLC, Winamp, foobar2000, dll
 *
 * FORMAT M3U EXTENDED:
 *   #EXTM3U
 *   #EXTINF:243,Artist - Title
 *   /path/to/song.mp3
 *   #EXTINF:198,Artist2 - Title2
 *   /path/to/song2.flac
 *
 * IMPORT: parse tiap baris, cari file yang cocok di DB,
 * buat playlist baru dari hasil match.
 */

import { save, open } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import type { Song } from "./db";
import { getDb, createPlaylist, addToPlaylist, getAllSongs } from "./db";

// ── Export ────────────────────────────────────────────────────────────────────

/**
 * Export playlist ke file .m3u
 * @param name nama playlist
 * @param songs daftar lagu
 */
export async function exportPlaylist(name: string, songs: Song[]): Promise<boolean> {
  // Pilih lokasi simpan
  const savePath = await save({
    title: "Export Playlist",
    defaultPath: `${sanitizeFilename(name)}.m3u`,
    filters: [{ name: "M3U Playlist", extensions: ["m3u", "m3u8"] }],
  });

  if (!savePath) return false;

  // Build M3U content
  const lines: string[] = ["#EXTM3U", `#PLAYLIST:${name}`, ""];

  for (const song of songs) {
    const duration = Math.round(song.duration);
    const artist = song.artist ?? "Unknown Artist";
    const title = song.title ?? "Unknown Title";

    lines.push(`#EXTINF:${duration},${artist} - ${title}`);
    // Konversi backslash ke forward slash untuk compatibility
    lines.push(song.path.replace(/\\/g, "/"));
    lines.push(""); // blank line antar track
  }

  await writeTextFile(savePath, lines.join("\n"));
  return true;
}

/**
 * Export semua lagu library ke satu M3U besar
 */
export async function exportLibrary(songs: Song[]): Promise<boolean> {
  return exportPlaylist("My Library", songs);
}

// ── Import ────────────────────────────────────────────────────────────────────

interface ImportResult {
  playlistId: number;
  matched: number;
  total: number;
  notFound: string[];
}

/**
 * Import .m3u file → buat playlist baru di DB
 * Lagu di-match berdasarkan path yang sama di library.
 */
export async function importPlaylist(): Promise<ImportResult | null> {
  const selected = await open({
    title: "Import Playlist",
    multiple: false,
    filters: [{ name: "M3U Playlist", extensions: ["m3u", "m3u8"] }],
  });

  if (!selected || typeof selected !== "string") return null;

  const content = await readTextFile(selected);
  const { name, paths } = parseM3u(content);

  // Nama playlist dari file atau filename
  const playlistName = name || selected.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "") || "Imported";

  const db = await getDb();

  // Ambil semua lagu dari DB untuk matching
  const allSongs = await getAllSongs(db);
  const pathMap = new Map(allSongs.map(s => [
    s.path.replace(/\\/g, "/").toLowerCase(),
    s,
  ]));

  // Buat playlist baru
  const playlistId = await createPlaylist(db, playlistName);

  let matched = 0;
  const notFound: string[] = [];

  for (const filePath of paths) {
    const normalized = filePath.replace(/\\/g, "/").toLowerCase();
    const song = pathMap.get(normalized);

    if (song) {
      await addToPlaylist(db, playlistId, song.id);
      matched++;
    } else {
      notFound.push(filePath);
    }
  }

  return { playlistId, matched, total: paths.length, notFound };
}

// ── Parser ─────────────────────────────────────────────────────────────────────

interface ParsedM3u {
  name: string;
  paths: string[];
}

function parseM3u(content: string): ParsedM3u {
  const lines = content.split(/\r?\n/);
  const paths: string[] = [];
  let name = "";

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line === "#EXTM3U") continue;

    if (line.startsWith("#PLAYLIST:")) {
      name = line.slice(10).trim();
      continue;
    }

    // Skip metadata lines, ambil hanya path
    if (line.startsWith("#")) continue;

    // Path bisa absolute atau relative
    paths.push(line);
  }

  return { name, paths };
}

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, "_").trim() || "playlist";
}