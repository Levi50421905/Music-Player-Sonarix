/**
 * lrcParser.test.ts — Unit Tests untuk LRC Parser
 */

import { describe, it, expect } from "vitest";
import { parseLrc, getActiveLine, getLrcPath } from "../lib/lrcParser";

// ── Sample LRC content ────────────────────────────────────────────────────────

const SAMPLE_LRC = `
[ti: Test Song]
[ar: Test Artist]
[al: Test Album]

[00:01.00]Baris pertama
[00:05.50]Baris kedua
[00:10.00]Baris ketiga
[00:15.75]Baris keempat
[00:20.00]Baris kelima
`;

const MULTI_TIMESTAMP_LRC = `
[00:10.00][00:45.00]Chorus baris ini
[00:12.00][00:47.00]Chorus baris kedua
`;

const A2_LRC = `
[00:01.00]<00:01.00>Kata <00:01.50>per <00:02.00>kata
`;

// ── Tests: parseLrc ───────────────────────────────────────────────────────────

describe("parseLrc", () => {
  it("parse metadata dengan benar", () => {
    const result = parseLrc(SAMPLE_LRC);
    expect(result.metadata.title).toBe("Test Song");
    expect(result.metadata.artist).toBe("Test Artist");
    expect(result.metadata.album).toBe("Test Album");
  });

  it("parse lyric lines dengan benar", () => {
    const result = parseLrc(SAMPLE_LRC);
    expect(result.lines).toHaveLength(5);
  });

  it("konversi timestamp ke detik dengan benar", () => {
    const result = parseLrc(SAMPLE_LRC);
    expect(result.lines[0].time).toBeCloseTo(1.0);
    expect(result.lines[1].time).toBeCloseTo(5.5);
    expect(result.lines[2].time).toBeCloseTo(10.0);
    expect(result.lines[3].time).toBeCloseTo(15.75);
  });

  it("teks lyric benar", () => {
    const result = parseLrc(SAMPLE_LRC);
    expect(result.lines[0].text).toBe("Baris pertama");
    expect(result.lines[4].text).toBe("Baris kelima");
  });

  it("lines diurutkan berdasarkan waktu", () => {
    const shuffled = `
[00:20.00]Lima
[00:01.00]Satu
[00:10.00]Tiga
[00:05.00]Dua
[00:15.00]Empat
`;
    const result = parseLrc(shuffled);
    for (let i = 1; i < result.lines.length; i++) {
      expect(result.lines[i].time).toBeGreaterThan(result.lines[i-1].time);
    }
  });

  it("multiple timestamp untuk satu baris (chorus)", () => {
    const result = parseLrc(MULTI_TIMESTAMP_LRC);
    // 2 baris × 2 timestamp = 4 entries
    expect(result.lines).toHaveLength(4);
    expect(result.lines.some(l => Math.abs(l.time - 10) < 0.01)).toBe(true);
    expect(result.lines.some(l => Math.abs(l.time - 45) < 0.01)).toBe(true);
  });

  it("handle file kosong tanpa crash", () => {
    const result = parseLrc("");
    expect(result.lines).toHaveLength(0);
    expect(result.metadata).toEqual({});
  });

  it("parse A2 word-level timestamps", () => {
    const result = parseLrc(A2_LRC);
    expect(result.lines[0].words).toBeDefined();
    expect(result.lines[0].words!.length).toBeGreaterThan(0);
  });
});

// ── Tests: getActiveLine ──────────────────────────────────────────────────────

describe("getActiveLine", () => {
  const lines = [
    { time: 1, text: "Line 1" },
    { time: 5, text: "Line 2" },
    { time: 10, text: "Line 3" },
    { time: 15, text: "Line 4" },
  ];

  it("return -1 sebelum lirik pertama", () => {
    expect(getActiveLine(lines, 0)).toBe(-1);
    expect(getActiveLine(lines, 0.5)).toBe(-1);
  });

  it("return index baris yang tepat", () => {
    expect(getActiveLine(lines, 1)).toBe(0);
    expect(getActiveLine(lines, 3)).toBe(0);
    expect(getActiveLine(lines, 5)).toBe(1);
    expect(getActiveLine(lines, 7)).toBe(1);
    expect(getActiveLine(lines, 10)).toBe(2);
    expect(getActiveLine(lines, 15)).toBe(3);
    expect(getActiveLine(lines, 100)).toBe(3); // setelah semua lirik
  });

  it("handle array kosong", () => {
    expect(getActiveLine([], 5)).toBe(-1);
  });
});

// ── Tests: getLrcPath ─────────────────────────────────────────────────────────

describe("getLrcPath", () => {
  it("ganti ekstensi mp3 ke lrc", () => {
    expect(getLrcPath("/music/song.mp3")).toBe("/music/song.lrc");
  });

  it("ganti ekstensi flac ke lrc", () => {
    expect(getLrcPath("/music/song.flac")).toBe("/music/song.lrc");
  });

  it("handle path Windows dengan backslash", () => {
    const path = "C:\\Music\\song.mp3";
    expect(getLrcPath(path)).toBe("C:\\Music\\song.lrc");
  });

  it("handle nama file dengan titik di dalam nama", () => {
    expect(getLrcPath("/music/song.v2.0.mp3")).toBe("/music/song.v2.0.lrc");
  });
});