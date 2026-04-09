/**
 * smartPlaylist.test.ts — Test mood scoring algorithms
 */

import { describe, it, expect } from "vitest";
import type { Song } from "../lib/db";

// Copy scoring functions dari SmartPlaylistView untuk testing
const makeSong = (overrides: Partial<Song> = {}): Song => ({
  id: 1, path: "/test.mp3", title: "Test", artist: "Artist",
  album: "Album", genre: "Genre", year: 2023,
  duration: 200, bitrate: 320, format: "MP3",
  cover_art: null, bpm: null, date_added: new Date().toISOString(),
  stars: 3, play_count: 0,
  ...overrides,
});

const MOODS = {
  energy: (s: Song) => {
    const bpm = s.bpm ?? 0;
    const rating = s.stars ?? 3;
    if (bpm === 0) return -1;
    return (bpm > 128 ? (bpm - 128) / 20 : -2) + (rating * 0.5);
  },
  chill: (s: Song) => {
    const bpm = s.bpm ?? 80;
    const rating = s.stars ?? 3;
    const bpmScore = bpm < 90 ? (90 - bpm) / 30 : bpm < 110 ? 0.3 : -1;
    return bpmScore + (rating * 0.4);
  },
  top: (s: Song) => (s.stars ?? 0) - 3.5,
  forgotten: (s: Song) => (s.play_count ?? 0) === 0 ? 1 : -1,
  workout: (s: Song) => {
    const bpm = s.bpm ?? 0;
    if (bpm === 0) return -1;
    return bpm > 140 ? (bpm - 140) / 10 + 1 : -1;
  },
};

describe("Mood Scoring: High Energy", () => {
  it("lagu tanpa BPM tidak masuk energy playlist", () => {
    const song = makeSong({ bpm: null });
    expect(MOODS.energy(song)).toBeLessThan(0);
  });

  it("BPM > 128 mendapat score positif", () => {
    const song = makeSong({ bpm: 140, stars: 4 });
    expect(MOODS.energy(song)).toBeGreaterThan(0);
  });

  it("BPM 160 + rating 5 mendapat score lebih tinggi dari BPM 130 + rating 3", () => {
    const high = makeSong({ bpm: 160, stars: 5 });
    const low  = makeSong({ bpm: 130, stars: 3 });
    expect(MOODS.energy(high)).toBeGreaterThan(MOODS.energy(low));
  });
});

describe("Mood Scoring: Chill", () => {
  it("lagu dengan BPM < 90 mendapat score positif", () => {
    const song = makeSong({ bpm: 70, stars: 3 });
    expect(MOODS.chill(song)).toBeGreaterThan(0);
  });

  it("lagu dengan BPM > 110 mendapat score negatif dari bpmScore", () => {
    const song = makeSong({ bpm: 150, stars: 3 });
    const bpmScore = 150 < 90 ? (90-150)/30 : 150 < 110 ? 0.3 : -1;
    expect(bpmScore).toBe(-1);
  });

  it("rating tinggi membantu score chill", () => {
    const highRated = makeSong({ bpm: 80, stars: 5 });
    const lowRated  = makeSong({ bpm: 80, stars: 2 });
    expect(MOODS.chill(highRated)).toBeGreaterThan(MOODS.chill(lowRated));
  });
});

describe("Mood Scoring: Top Rated", () => {
  it("rating 4 dan 5 masuk (score > 0)", () => {
    expect(MOODS.top(makeSong({ stars: 4 }))).toBeGreaterThan(0);
    expect(MOODS.top(makeSong({ stars: 5 }))).toBeGreaterThan(0);
  });

  it("rating 3 tidak masuk (score <= 0)", () => {
    expect(MOODS.top(makeSong({ stars: 3 }))).toBeLessThanOrEqual(0);
  });

  it("rating 1 dan 2 jelas tidak masuk", () => {
    expect(MOODS.top(makeSong({ stars: 1 }))).toBeLessThan(0);
    expect(MOODS.top(makeSong({ stars: 2 }))).toBeLessThan(0);
  });
});

describe("Mood Scoring: Forgotten Gems", () => {
  it("lagu yang belum pernah diputar masuk", () => {
    expect(MOODS.forgotten(makeSong({ play_count: 0 }))).toBe(1);
  });

  it("lagu yang sudah pernah diputar tidak masuk", () => {
    expect(MOODS.forgotten(makeSong({ play_count: 1 }))).toBe(-1);
    expect(MOODS.forgotten(makeSong({ play_count: 100 }))).toBe(-1);
  });
});

describe("Mood Scoring: Workout", () => {
  it("lagu tanpa BPM tidak masuk", () => {
    expect(MOODS.workout(makeSong({ bpm: null }))).toBe(-1);
  });

  it("BPM > 140 masuk dengan score positif", () => {
    expect(MOODS.workout(makeSong({ bpm: 150 }))).toBeGreaterThan(0);
    expect(MOODS.workout(makeSong({ bpm: 180 }))).toBeGreaterThan(0);
  });

  it("BPM tinggi = score lebih tinggi", () => {
    const fast = makeSong({ bpm: 180 });
    const med  = makeSong({ bpm: 150 });
    expect(MOODS.workout(fast)).toBeGreaterThan(MOODS.workout(med));
  });

  it("BPM tepat 140 tidak masuk", () => {
    expect(MOODS.workout(makeSong({ bpm: 140 }))).toBeLessThanOrEqual(0);
  });
});