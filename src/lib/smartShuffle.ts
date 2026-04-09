/**
 * smartShuffle.ts — Weighted Random Track Selection
 *
 * WHY: Shuffle biasa (Math.random()) tidak mempertimbangkan preferensi user.
 * Smart shuffle menghitung "score" tiap lagu berdasarkan:
 *   - Rating bintang (bobot terbesar: 50%)
 *   - Frekuensi diputar (play count: 20%)
 *   - Decay factor: makin lama tidak diputar → peluang naik lagi (30%)
 *   - Recently played penalty: baru diputar → dikurangi sementara
 *
 * RESULT: Lagu favorit lebih sering muncul, tapi tidak repeat terus.
 * Lagu yang jarang diputar tetap bisa muncul sesekali (discovery).
 */

import type { Song } from "./db";

export interface PlayRecord {
  song_id: number;
  played_at: string; // ISO datetime string
}

/**
 * Hitung score untuk satu lagu.
 * Score >= 0.1 (minimal agar semua lagu tetap punya peluang muncul).
 */
export function calculateScore(song: Song, history: PlayRecord[]): number {
  const rating = song.stars ?? 3; // default 3 jika belum dirating

  // Play count dari history (bukan dari DB langsung, agar real-time)
  const playCount = history.filter(h => h.song_id === song.id).length;

  // Kapan terakhir diputar
  const lastRecord = history
    .filter(h => h.song_id === song.id)
    .sort((a, b) => new Date(b.played_at).getTime() - new Date(a.played_at).getTime())[0];

  const daysSincePlayed = lastRecord
    ? (Date.now() - new Date(lastRecord.played_at).getTime()) / 86_400_000
    : 999; // belum pernah diputar → bonus besar

  // Decay bonus: 0 jika baru diputar, naik sampai 1 setelah 7 hari tidak diputar
  // WHY: mencegah lagu yang sama muncul terus-menerus
  const decayBonus = Math.min(daysSincePlayed / 7, 1.0);

  // Recently played penalty: dalam 1 jam terakhir → dikurangi drastis
  const recentPenalty = daysSincePlayed < (1 / 24) ? -2.5 : 0;

  // Play frequency contribution (log agar tidak dominan untuk lagu yang sangat sering diputar)
  const freqBonus = Math.log1p(playCount) * 0.2;

  const score =
    (rating * 0.5) +       // rating punya bobot terbesar
    freqBonus +             // lagu yang sering diputar sedikit lebih sering muncul
    (decayBonus * 0.3) +    // bonus kalau sudah lama tidak diputar
    recentPenalty;          // penalti kalau baru diputar

  return Math.max(0.1, score); // minimal 0.1 agar semua lagu punya peluang
}

/**
 * Pilih satu lagu secara weighted random.
 *
 * CARA KERJA:
 *   1. Hitung score tiap lagu
 *   2. Jumlahkan semua score → total
 *   3. Random angka 0–total
 *   4. Loop, kurangi random dengan score tiap lagu
 *   5. Lagu pertama yang membuat random <= 0 adalah pemenangnya
 *
 * Lagu dengan score tinggi punya "segmen" lebih besar di range 0–total,
 * sehingga lebih sering terpilih.
 */
export function weightedRandom(songs: Song[], history: PlayRecord[]): Song {
  if (songs.length === 0) throw new Error("No songs to shuffle");
  if (songs.length === 1) return songs[0];

  const scores = songs.map(s => calculateScore(s, history));
  const total = scores.reduce((a, b) => a + b, 0);

  let rand = Math.random() * total;

  for (let i = 0; i < songs.length; i++) {
    rand -= scores[i];
    if (rand <= 0) return songs[i];
  }

  // Fallback (floating point edge case)
  return songs[songs.length - 1];
}

/**
 * Generate queue baru dengan urutan weighted random.
 * Memastikan tidak ada duplikat dalam queue.
 */
export function generateSmartQueue(songs: Song[], history: PlayRecord[]): Song[] {
  if (songs.length === 0) return [];

  const remaining = [...songs];
  const queue: Song[] = [];

  while (remaining.length > 0) {
    const picked = weightedRandom(remaining, history);
    queue.push(picked);
    const idx = remaining.findIndex(s => s.id === picked.id);
    remaining.splice(idx, 1);
  }

  return queue;
}

/**
 * Debug helper: tampilkan distribusi score untuk semua lagu.
 * Berguna untuk verifikasi algoritma saat development.
 */
export function debugScores(songs: Song[], history: PlayRecord[]) {
  const scores = songs.map(s => ({
    title: s.title,
    stars: s.stars ?? 3,
    plays: history.filter(h => h.song_id === s.id).length,
    score: calculateScore(s, history).toFixed(3),
  }));
  scores.sort((a, b) => parseFloat(b.score) - parseFloat(a.score));
  console.table(scores);
}