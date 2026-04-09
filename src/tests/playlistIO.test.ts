/**
 * playlistIO.test.ts — Unit Tests untuk M3U parser
 * 
 * Test parsing logic yang pure (tidak butuh Tauri/filesystem).
 * Fungsi parseM3u di-export untuk testing.
 */

import { describe, it, expect } from "vitest";

// ── Pure parser yang bisa kita test tanpa Tauri ───────────────────────────────
// (Salin logic dari playlistIO.ts agar bisa ditest secara isolated)

function parseM3u(content: string) {
  const lines = content.split(/\r?\n/);
  const paths: string[] = [];
  let name = "";

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line === "#EXTM3U") continue;
    if (line.startsWith("#PLAYLIST:")) { name = line.slice(10).trim(); continue; }
    if (line.startsWith("#")) continue;
    paths.push(line);
  }

  return { name, paths };
}

function buildM3u(name: string, entries: { path: string; duration: number; artist: string; title: string }[]) {
  const lines = ["#EXTM3U", `#PLAYLIST:${name}`, ""];
  for (const e of entries) {
    lines.push(`#EXTINF:${e.duration},${e.artist} - ${e.title}`);
    lines.push(e.path);
    lines.push("");
  }
  return lines.join("\n");
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("M3U Parser", () => {
  it("parse basic M3U", () => {
    const content = `#EXTM3U
#EXTINF:243,Artist - Song Title
/music/song.mp3
#EXTINF:198,Artist2 - Another Song
/music/song2.flac
`;
    const result = parseM3u(content);
    expect(result.paths).toHaveLength(2);
    expect(result.paths[0]).toBe("/music/song.mp3");
    expect(result.paths[1]).toBe("/music/song2.flac");
  });

  it("parse playlist name", () => {
    const content = `#EXTM3U
#PLAYLIST:My Favorites
/music/song.mp3
`;
    const result = parseM3u(content);
    expect(result.name).toBe("My Favorites");
  });

  it("handle Windows path dengan backslash", () => {
    const content = `#EXTM3U
C:\\Music\\Artist\\song.mp3
`;
    const result = parseM3u(content);
    expect(result.paths[0]).toBe("C:\\Music\\Artist\\song.mp3");
  });

  it("skip baris kosong dan comment", () => {
    const content = `#EXTM3U
# ini comment
   
#EXTINF:200,Artist - Title

/music/valid.mp3

`;
    const result = parseM3u(content);
    expect(result.paths).toHaveLength(1);
    expect(result.paths[0]).toBe("/music/valid.mp3");
  });

  it("handle file kosong", () => {
    const result = parseM3u("");
    expect(result.paths).toHaveLength(0);
    expect(result.name).toBe("");
  });

  it("handle M3U tanpa header #EXTM3U (simple format)", () => {
    const content = `/music/a.mp3\n/music/b.flac\n/music/c.wav`;
    const result = parseM3u(content);
    expect(result.paths).toHaveLength(3);
  });
});

describe("M3U Builder", () => {
  it("generate valid M3U format", () => {
    const entries = [
      { path: "/music/song.mp3", duration: 243, artist: "Artist", title: "Song" },
    ];
    const m3u = buildM3u("Test Playlist", entries);
    expect(m3u).toContain("#EXTM3U");
    expect(m3u).toContain("#PLAYLIST:Test Playlist");
    expect(m3u).toContain("#EXTINF:243,Artist - Song");
    expect(m3u).toContain("/music/song.mp3");
  });

  it("round-trip: build → parse → same paths", () => {
    const entries = [
      { path: "/music/a.mp3", duration: 100, artist: "A1", title: "T1" },
      { path: "/music/b.flac", duration: 200, artist: "A2", title: "T2" },
      { path: "/music/c.wav", duration: 300, artist: "A3", title: "T3" },
    ];
    const m3u = buildM3u("Test", entries);
    const parsed = parseM3u(m3u);
    expect(parsed.paths).toHaveLength(3);
    entries.forEach((e, i) => {
      expect(parsed.paths[i]).toBe(e.path);
    });
  });
});