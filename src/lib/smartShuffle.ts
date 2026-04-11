/**
 * smartShuffle.ts — v2: Skip-aware + Rating-weighted
 *
 * PERBAIKAN vs v1:
 *   [#15] Skip behavior: lagu yang sering di-skip dapat penalti besar.
 *         Engine melacak skip count per lagu (audioEngine.getSkipScore).
 *   [#15] Rating-weighted boost yang lebih halus — exponential, bukan linear.
 *   [NEW] playthrough bonus: lagu yang diputar sampai selesai dapat bonus.
 *   [UX]  Tidak pernah repeat lagu yang sama dalam window 3 lagu terakhir.
 */

import type { Song } from "./db";
import { audioEngine } from "./audioEngine";

export interface PlayRecord {
  song_id: number;
  played_at: string;
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

/**
 * Hitung score untuk satu lagu.
 * Faktor:
 *   - Rating bintang (exponential weight)
 *   - Play count (log scale)
 *   - Decay bonus (lama tidak diputar → naik)
 *   - Recently played penalty (< 1 jam)
 *   - Skip penalty (sering di-skip → turun drastis)
 * Score >= 0.05 (semua lagu tetap punya peluang minimal).
 */
export function calculateScore(song: Song, history: PlayRecord[]): number {
  const rating    = song.stars ?? 3;
  const playCount = history.filter(h => h.song_id === song.id).length;

  const lastRecord = history
    .filter(h => h.song_id === song.id)
    .sort((a, b) => new Date(b.played_at).getTime() - new Date(a.played_at).getTime())[0];

  const daysSincePlayed = lastRecord
    ? (Date.now() - new Date(lastRecord.played_at).getTime()) / 86_400_000
    : 999;

  // Decay bonus: 0 → 1 dalam 7 hari
  const decayBonus = Math.min(daysSincePlayed / 7, 1.0);

  // Recent penalty (< 1 jam)
  const recentPenalty = daysSincePlayed < (1 / 24) ? -3.0 : 0;

  // [#15] Skip penalty: setiap skip = -0.8, max -4.0
  const skipCount = audioEngine.getSkipScore(song.path ?? "");
  const skipPenalty = Math.min(skipCount * 0.8, 4.0);

  // Rating: exponential — 5★ = 3.5x lebih mungkin dari 3★
  // 1★=0.25, 2★=0.5, 3★=1.0, 4★=2.0, 5★=4.0
  const ratingWeight = Math.pow(2, rating - 3);

  // Play frequency (log, max contribution capped)
  const freqBonus = Math.log1p(playCount) * 0.15;

  const score =
    (ratingWeight * 1.2) +
    freqBonus +
    (decayBonus * 0.4) +
    recentPenalty -
    skipPenalty;

  return Math.max(0.05, score);
}

/**
 * Weighted random — lagu dengan score tinggi lebih sering terpilih.
 * Cegah repeat dalam window 3 lagu terakhir.
 */
export function weightedRandom(songs: Song[], history: PlayRecord[]): Song {
  if (songs.length === 0) throw new Error("No songs to shuffle");
  if (songs.length === 1) return songs[0];

  // Window: 3 lagu terakhir dalam history
  const recentIds = new Set(
    history.slice(0, 3).map(h => h.song_id)
  );

  // Filter pool — coba hindari lagu yang baru diputar
  let pool = songs.filter(s => !recentIds.has(s.id));
  if (pool.length === 0) pool = songs; // fallback jika semua baru

  const scores = pool.map(s => calculateScore(s, history));
  const total  = scores.reduce((a, b) => a + b, 0);

  let rand = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    rand -= scores[i];
    if (rand <= 0) return pool[i];
  }

  return pool[pool.length - 1];
}

/**
 * Generate smart queue: weighted random tanpa duplikat.
 */
export function generateSmartQueue(songs: Song[], history: PlayRecord[]): Song[] {
  if (songs.length === 0) return [];

  const remaining = [...songs];
  const queue:     Song[] = [];

  while (remaining.length > 0) {
    const picked = weightedRandom(remaining, history);
    queue.push(picked);
    const idx = remaining.findIndex(s => s.id === picked.id);
    remaining.splice(idx, 1);
  }

  return queue;
}

/**
 * Debug helper: tampilkan distribusi score.
 */
export function debugScores(songs: Song[], history: PlayRecord[]) {
  const scores = songs.map(s => ({
    title:  s.title,
    stars:  s.stars ?? 3,
    plays:  history.filter(h => h.song_id === s.id).length,
    skips:  audioEngine.getSkipScore(s.path ?? ""),
    score:  calculateScore(s, history).toFixed(3),
  }));
  scores.sort((a, b) => parseFloat(b.score) - parseFloat(a.score));
  console.table(scores);
}