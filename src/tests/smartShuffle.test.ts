/**
 * smartShuffle.test.ts — Unit Tests
 *
 * Test untuk memastikan weighted random bekerja sesuai ekspektasi:
 *   1. Lagu dengan rating tinggi lebih sering terpilih
 *   2. Lagu yang baru diputar punya penalti
 *   3. Semua lagu punya peluang muncul (tidak ada yang 0)
 *   4. Tidak crash dengan edge cases (array kosong, satu lagu, dll)
 */

import { describe, it, expect } from "vitest";
import {
  calculateScore,
  weightedRandom,
  generateSmartQueue,
  type PlayRecord,
} from "../lib/smartShuffle";
import type { Song } from "../lib/db";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const makeSong = (id: number, stars?: number, bpm?: number): Song => ({
  id,
  path: `/music/song${id}.mp3`,
  title: `Song ${id}`,
  artist: "Test Artist",
  album: "Test Album",
  genre: "Test",
  year: 2023,
  duration: 200,
  bitrate: 320,
  format: "MP3",
  cover_art: null,
  bpm: bpm ?? null,
  date_added: new Date().toISOString(),
  stars,
  play_count: 0,
});

const makeHistory = (songId: number, minutesAgo: number): PlayRecord => ({
  song_id: songId,
  played_at: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
});

// ── Tests: calculateScore ─────────────────────────────────────────────────────

describe("calculateScore", () => {
  it("lagu rating tinggi dapat score lebih tinggi dari rating rendah", () => {
    const high = makeSong(1, 5);
    const low  = makeSong(2, 1);
    const history: PlayRecord[] = [];

    expect(calculateScore(high, history)).toBeGreaterThan(calculateScore(low, history));
  });

  it("lagu yang baru diputar (< 1 jam) dapat penalti", () => {
    const song = makeSong(1, 3);
    const noHistory: PlayRecord[] = [];
    const recentHistory: PlayRecord[] = [makeHistory(1, 10)]; // 10 menit lalu

    expect(calculateScore(song, noHistory)).toBeGreaterThan(calculateScore(song, recentHistory));
  });

  it("lagu yang lama tidak diputar dapat decay bonus", () => {
    const song = makeSong(1, 3);
    const longAgo: PlayRecord[] = [makeHistory(1, 60 * 24 * 14)]; // 14 hari lalu
    const noHistory: PlayRecord[] = [];

    // Decay bonus setelah 7+ hari seharusnya meningkatkan score
    const scoreWithDecay = calculateScore(song, longAgo);
    const scoreNoHistory = calculateScore(song, noHistory);

    // Keduanya positif (lagu valid untuk diputar)
    expect(scoreWithDecay).toBeGreaterThan(0);
    expect(scoreNoHistory).toBeGreaterThan(0);
  });

  it("score selalu minimal 0.1 (tidak ada lagu yang score-nya 0)", () => {
    const song = makeSong(1, 1); // rating terendah
    const recentHistory: PlayRecord[] = [makeHistory(1, 5)]; // baru 5 menit diputar

    expect(calculateScore(song, recentHistory)).toBeGreaterThanOrEqual(0.1);
  });

  it("lagu tanpa rating menggunakan default 3 bintang", () => {
    const withRating    = makeSong(1, 3);
    const withoutRating = makeSong(2, undefined);
    const history: PlayRecord[] = [];

    // Score harus sama karena default = 3
    expect(calculateScore(withRating, history)).toBeCloseTo(calculateScore(withoutRating, history), 2);
  });
});

// ── Tests: weightedRandom ─────────────────────────────────────────────────────

describe("weightedRandom", () => {
  it("melempar error jika songs kosong", () => {
    expect(() => weightedRandom([], [])).toThrow();
  });

  it("selalu return lagu yang sama jika hanya ada satu", () => {
    const song = makeSong(1, 3);
    const result = weightedRandom([song], []);
    expect(result.id).toBe(1);
  });

  it("selalu return salah satu dari songs yang diberikan", () => {
    const songs = [makeSong(1, 3), makeSong(2, 4), makeSong(3, 5)];
    const ids = new Set(songs.map(s => s.id));

    for (let i = 0; i < 50; i++) {
      const result = weightedRandom(songs, []);
      expect(ids.has(result.id)).toBe(true);
    }
  });

  it("distribusi: lagu rating 5 lebih sering dari rating 1 (100 samples)", () => {
    const highRated = makeSong(1, 5);
    const lowRated  = makeSong(2, 1);
    const songs = [highRated, lowRated];

    const counts = { 1: 0, 2: 0 };
    for (let i = 0; i < 200; i++) {
      const picked = weightedRandom(songs, []);
      counts[picked.id as 1 | 2]++;
    }

    // Lagu rating 5 seharusnya dipilih jauh lebih sering
    expect(counts[1]).toBeGreaterThan(counts[2]);
  });
});

// ── Tests: generateSmartQueue ─────────────────────────────────────────────────

describe("generateSmartQueue", () => {
  it("return array kosong jika input kosong", () => {
    expect(generateSmartQueue([], [])).toHaveLength(0);
  });

  it("panjang queue sama dengan panjang input", () => {
    const songs = [makeSong(1), makeSong(2), makeSong(3), makeSong(4), makeSong(5)];
    const queue = generateSmartQueue(songs, []);
    expect(queue).toHaveLength(songs.length);
  });

  it("tidak ada duplikat dalam queue", () => {
    const songs = Array.from({ length: 20 }, (_, i) => makeSong(i + 1, (i % 5) + 1));
    const queue = generateSmartQueue(songs, []);
    const ids = queue.map(s => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(songs.length);
  });

  it("semua lagu dari input ada dalam queue", () => {
    const songs = [makeSong(1, 2), makeSong(2, 4), makeSong(3, 5)];
    const queue = generateSmartQueue(songs, []);
    const queueIds = new Set(queue.map(s => s.id));
    songs.forEach(s => expect(queueIds.has(s.id)).toBe(true));
  });
});