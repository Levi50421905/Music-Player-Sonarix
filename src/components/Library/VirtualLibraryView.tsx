/**
 * VirtualLibraryView.tsx — Virtualized Library untuk 10.000+ lagu
 *
 * WHY virtual list:
 *   Library dengan 5.000 lagu = 5.000 DOM nodes → scroll lambat,
 *   memory besar, render awal lama.
 *
 *   Virtual list hanya render ~20–30 baris yang terlihat di viewport.
 *   Sisanya digantikan spacer div. Scroll tetap mulus karena
 *   total height di-preserve.
 *
 * IMPLEMENTASI:
 *   - Tidak pakai library eksternal (react-window dll) → zero dependency
 *   - Pure React dengan useRef + onScroll
 *   - Kompatibel dengan semua fitur LibraryView yang sudah ada
 */

import { useState, useRef, useCallback, useMemo } from "react";
import { useLibraryStore, usePlayerStore } from "../../store";
import type { Song } from "../../lib/db";
import CoverArt from "../CoverArt";
import StarRating from "../StarRating";
import { formatDuration, getVirtualListRange, debounce } from "../../utils/performance";

const ROW_HEIGHT = 54; // px per row (cover 38px + padding 8px atas/bawah)

interface Props {
  onPlay: (song: Song) => void;
  onRating: (songId: number, stars: number) => void;
}

type SortKey = "title" | "artist" | "album" | "stars" | "play_count" | "bitrate";

export default function VirtualLibraryView({ onPlay, onRating }: Props) {
  const { songs } = useLibraryStore();
  const { currentSong, isPlaying } = usePlayerStore();

  const [search, setSearch]       = useState("");
  const [searchInput, setSearchInput] = useState(""); // debounced
  const [sortKey, setSortKey]     = useState<SortKey>("title");
  const [sortDir, setSortDir]     = useState<"asc" | "desc">("asc");
  const [filterFormat, setFilterFormat] = useState("all");
  const [scrollTop, setScrollTop] = useState(0);
  const [containerH, setContainerH] = useState(600);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef    = useRef<HTMLInputElement>(null);

  // Debounce search input
  const debouncedSetSearch = useCallback(
    debounce((v: unknown) => setSearch(v as string), 200),
    []
  );

  // Unique formats
  const formats = useMemo(() => {
    const set = new Set(songs.map(s => (s.format ?? "").toUpperCase()).filter(Boolean));
    return ["all", ...Array.from(set).sort()];
  }, [songs]);

  // Filter + sort
  const filtered = useMemo(() => {
    let result = songs.filter(s => {
      const q = search.toLowerCase();
      const matchSearch = !q ||
        s.title?.toLowerCase().includes(q) ||
        s.artist?.toLowerCase().includes(q) ||
        s.album?.toLowerCase().includes(q);
      const matchFmt = filterFormat === "all" || (s.format ?? "").toUpperCase() === filterFormat;
      return matchSearch && matchFmt;
    });

    result = [...result].sort((a, b) => {
      let va: string | number = (a as Record<string, unknown>)[sortKey] as string | number ?? "";
      let vb: string | number = (b as Record<string, unknown>)[sortKey] as string | number ?? "";
      if (typeof va === "string") va = va.toLowerCase();
      if (typeof vb === "string") vb = vb.toLowerCase();
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [songs, search, sortKey, sortDir, filterFormat]);

  // Virtual range
  const { startIndex, endIndex, offsetY, totalHeight } = useMemo(
    () => getVirtualListRange({
      itemCount: filtered.length,
      itemHeight: ROW_HEIGHT,
      containerHeight: containerH,
      scrollTop,
      overscan: 5,
    }),
    [filtered.length, containerH, scrollTop]
  );

  const visibleRows = filtered.slice(startIndex, endIndex + 1);

  // Handle scroll
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop((e.target as HTMLDivElement).scrollTop);
  }, []);

  // Handle container resize
  const containerRefCb = useCallback((el: HTMLDivElement | null) => {
    (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      setContainerH(entries[0].contentRect.height);
    });
    ro.observe(el);
  }, []);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const sortArrow = (key: SortKey) => sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  const thStyle = (key: SortKey): React.CSSProperties => ({
    padding: "6px 8px", fontSize: 10, textAlign: "left",
    color: sortKey === key ? "#a78bfa" : "#4b5563",
    textTransform: "uppercase", letterSpacing: "0.08em",
    fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
    userSelect: "none", background: "#0a0a14",
    position: "sticky", top: 0, zIndex: 10,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Toolbar */}
      <div style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "center", flexWrap: "wrap", flexShrink: 0 }}>
        {/* Search */}
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#4b5563", pointerEvents: "none" }}>🔍</span>
          <input
            ref={searchRef}
            value={searchInput}
            onChange={e => { setSearchInput(e.target.value); debouncedSetSearch(e.target.value); }}
            placeholder={`Search ${songs.length.toLocaleString()} tracks...`}
            style={{
              width: "100%", padding: "8px 12px 8px 32px",
              background: "#0d0d1f", border: "1px solid #2a2a3e",
              borderRadius: 8, color: "#e2e8f0", fontSize: 13,
              fontFamily: "inherit", outline: "none",
            }}
          />
          {searchInput && (
            <button onClick={() => { setSearchInput(""); setSearch(""); }} style={{
              position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", cursor: "pointer",
              color: "#6b7280", fontSize: 14,
            }}>✕</button>
          )}
        </div>

        {/* Format filter */}
        <div style={{ display: "flex", gap: 4 }}>
          {formats.map(f => (
            <button key={f} onClick={() => setFilterFormat(f)} style={{
              padding: "5px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer",
              border: "1px solid", fontFamily: "inherit",
              background: filterFormat === f ? "rgba(124,58,237,0.2)" : "transparent",
              borderColor: filterFormat === f ? "#7C3AED" : "#2a2a3e",
              color: filterFormat === f ? "#a78bfa" : "#6b7280",
            }}>{f === "all" ? "All" : f}</button>
          ))}
        </div>

        <span style={{ fontSize: 11, color: "#4b5563", whiteSpace: "nowrap" }}>
          {filtered.length.toLocaleString()} tracks
        </span>
      </div>

      {/* Table header */}
      <table style={{ width: "100%", borderCollapse: "collapse", flexShrink: 0 }}>
        <thead>
          <tr>
            <th style={{ ...thStyle("title"), width: 32 }}>#</th>
            <th style={{ ...thStyle("title"), width: 44 }}></th>
            <th style={thStyle("title")} onClick={() => handleSort("title")}>Title{sortArrow("title")}</th>
            <th style={thStyle("artist")} onClick={() => handleSort("artist")}>Artist{sortArrow("artist")}</th>
            <th style={thStyle("stars")} onClick={() => handleSort("stars")}>Rating{sortArrow("stars")}</th>
            <th style={thStyle("play_count")} onClick={() => handleSort("play_count")}>Plays{sortArrow("play_count")}</th>
            <th style={{ ...thStyle("bitrate"), width: 80 }}>Format</th>
            <th style={{ ...thStyle("title"), width: 52 }}>Time</th>
          </tr>
        </thead>
      </table>

      {/* Virtualized rows */}
      <div
        ref={containerRefCb}
        onScroll={handleScroll}
        style={{ flex: 1, overflow: "auto" }}
      >
        <div style={{ height: totalHeight, position: "relative" }}>
          <table style={{
            width: "100%", borderCollapse: "collapse",
            position: "absolute", top: offsetY,
          }}>
            <tbody>
              {visibleRows.map((song, relIdx) => {
                const absIdx = startIndex + relIdx;
                const isActive = song.id === currentSong?.id;

                return (
                  <tr
                    key={song.id}
                    onClick={() => onPlay(song)}
                    style={{
                      height: ROW_HEIGHT, cursor: "pointer",
                      background: isActive ? "rgba(124,58,237,0.12)" : "transparent",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={e => { if (!isActive) (e.currentTarget).style.background = "rgba(255,255,255,0.03)"; }}
                    onMouseLeave={e => { if (!isActive) (e.currentTarget).style.background = "transparent"; }}
                  >
                    <td style={{ width: 32, textAlign: "center", padding: "0 8px" }}>
                      {isActive && isPlaying
                        ? <span style={{ color: "#a78bfa", fontSize: 12 }}>▶</span>
                        : <span style={{ fontSize: 11, color: "#4b5563", fontFamily: "monospace" }}>{absIdx + 1}</span>
                      }
                    </td>
                    <td style={{ width: 44, padding: "0 4px" }}>
                      <CoverArt id={song.id} coverArt={song.cover_art} size={38} />
                    </td>
                    <td style={{ padding: "0 8px" }}>
                      <div style={{ fontWeight: 500, fontSize: 13, color: isActive ? "#a78bfa" : "#e2e8f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220 }}>
                        {song.title}
                      </div>
                      <div style={{ fontSize: 10, color: "#6b7280" }}>{song.album}</div>
                    </td>
                    <td style={{ padding: "0 8px" }}>
                      <span style={{ fontSize: 12, color: "#9ca3af" }}>{song.artist}</span>
                    </td>
                    <td style={{ padding: "0 8px" }} onClick={e => e.stopPropagation()}>
                      <StarRating stars={song.stars ?? 0} onChange={s => onRating(song.id, s)} size={11} />
                    </td>
                    <td style={{ padding: "0 8px", textAlign: "center" }}>
                      <span style={{ fontSize: 11, color: "#6b7280", fontFamily: "monospace" }}>{song.play_count ?? 0}</span>
                    </td>
                    <td style={{ padding: "0 8px" }}>
                      <span style={{
                        fontSize: 9, padding: "2px 5px", borderRadius: 4, fontFamily: "monospace",
                        background: ["FLAC","WAV","ALAC"].includes(song.format ?? "") ? "rgba(16,185,129,0.12)" : "rgba(99,102,241,0.12)",
                        border: `1px solid ${["FLAC","WAV","ALAC"].includes(song.format ?? "") ? "#059669" : "#4f46e5"}`,
                        color: ["FLAC","WAV","ALAC"].includes(song.format ?? "") ? "#34D399" : "#818CF8",
                      }}>{song.format}</span>
                    </td>
                    <td style={{ padding: "0 8px" }}>
                      <span style={{ fontSize: 11, color: "#6b7280", fontFamily: "monospace" }}>
                        {formatDuration(song.duration)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer stats */}
      {filtered.length > 0 && (
        <div style={{ padding: "8px 0 0", fontSize: 10, color: "#4b5563", flexShrink: 0, display: "flex", gap: 16 }}>
          <span>Showing {Math.min(endIndex + 1, filtered.length)} of {filtered.length} tracks</span>
          <span>Virtual rows: {endIndex - startIndex + 1} rendered / {filtered.length} total</span>
        </div>
      )}
    </div>
  );
}