/**
 * shuffleEngine.ts — Proper Shuffle Engine (#1, #6, #7)
 *
 * FIX #1: Shuffle sekarang punya state sendiri (pool + history window)
 * FIX #6: Queue mode dan shuffle mode dipisah jelas
 * FIX #7: getUpNext() untuk preview lagu berikutnya
 *
 * CARA KERJA:
 *   - Queue mode: putar berurutan (atau repeat)
 *   - Shuffle mode: random dari "shuffle pool" (sisa lagu belum diputar)
 *     → Ketika pool habis, rebuild pool dari awal (kecuali lagu terakhir)
 *     → Tidak pernah repeat 3 lagu terakhir dalam window
 */

import type { Song } from "../lib/db";
import { audioEngine } from "../lib/audioEngine";

// ── Shuffle Pool State ────────────────────────────────────────────────────────
// State ini hidup di memory, tidak perlu persistent
let shufflePool: Song[] = [];
let shuffleHistory: number[] = []; // song ids, newest first (max 10)
let shuffleSource: Song[] = []; // full list saat shuffle dimulai

/**
 * Initialize shuffle pool dari daftar lagu.
 * Dipanggil saat user aktifkan shuffle atau saat play list baru.
 */
export function initShufflePool(songs: Song[], currentId?: number): void {
  shuffleSource = [...songs];
  // Exclude lagu yang sedang diputar dari pool
  shufflePool = songs.filter((s) => s.id !== currentId);
  // Shuffle pool secara acak (Fisher-Yates)
  for (let i = shufflePool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shufflePool[i], shufflePool[j]] = [shufflePool[j], shufflePool[i]];
  }
}

/**
 * Rebuild pool saat habis (untuk repeat all).
 */
function rebuildPool(excludeId?: number): void {
  shufflePool = shuffleSource.filter(
    (s) => s.id !== excludeId && !shuffleHistory.slice(0, 3).includes(s.id)
  );
  if (shufflePool.length === 0) {
    // Kalau semua ada di recent history, reset pool penuh
    shufflePool = shuffleSource.filter((s) => s.id !== excludeId);
  }
  // Re-shuffle
  for (let i = shufflePool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shufflePool[i], shufflePool[j]] = [shufflePool[j], shufflePool[i]];
  }
}

/**
 * Tambah ke shuffle history.
 */
function addToShuffleHistory(songId: number): void {
  shuffleHistory = [songId, ...shuffleHistory].slice(0, 10);
}

/**
 * Ambil lagu berikutnya dari shuffle pool.
 * @param repeatAll - jika true, rebuild pool saat habis
 */
export function getNextShuffled(currentId?: number, repeatAll = false): Song | null {
  if (shufflePool.length === 0) {
    if (!repeatAll) return null;
    rebuildPool(currentId);
    if (shufflePool.length === 0) return null;
  }

  const next = shufflePool.shift()!;
  addToShuffleHistory(next.id);
  return next;
}

/**
 * Preview N lagu berikutnya tanpa mengubah pool state (#7).
 * Dipakai untuk Up Next display.
 */
export function peekUpNextShuffled(count = 5): Song[] {
  return shufflePool.slice(0, count);
}

/**
 * Reset shuffle state (saat shuffle dimatikan atau queue diganti).
 */
export function resetShufflePool(): void {
  shufflePool = [];
  shuffleHistory = [];
  shuffleSource = [];
}

// ── Queue-based next/prev (non-shuffle) ──────────────────────────────────────

/**
 * Get next index dalam queue (non-shuffle).
 */
export function getNextQueueIndex(
  queue: Song[],
  currentIndex: number,
  repeat: "off" | "one" | "all"
): number | null {
  if (queue.length === 0) return null;
  if (repeat === "one") return currentIndex;

  const next = currentIndex + 1;
  if (next >= queue.length) {
    if (repeat === "all") return 0;
    return null;
  }
  return next;
}

/**
 * Get prev index.
 */
export function getPrevQueueIndex(
  queue: Song[],
  currentIndex: number
): number {
  return Math.max(0, currentIndex - 1);
}

/**
 * Get Up Next preview (#7) — works for both shuffle & queue mode.
 */
export function getUpNextPreview(
  queue: Song[],
  currentIndex: number,
  shuffle: boolean,
  repeat: "off" | "one" | "all",
  count = 5
): Song[] {
  if (shuffle) {
    return peekUpNextShuffled(count);
  }

  // Queue mode: ambil lagu-lagu setelah currentIndex
  const result: Song[] = [];
  for (let i = 1; i <= count; i++) {
    const idx = currentIndex + i;
    if (idx < queue.length) {
      result.push(queue[idx]);
    } else if (repeat === "all") {
      result.push(queue[idx % queue.length]);
    } else {
      break;
    }
  }
  return result;
}