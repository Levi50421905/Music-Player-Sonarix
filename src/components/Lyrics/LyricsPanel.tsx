/**
 * LyricsPanel.tsx — v3 (security: lyrics sanitization + HTTPS enforcement)
 *
 * SECURITY FIXES vs v2:
 *   [SEC] stripHtml(): hapus semua HTML tags dari lyrics sebelum render
 *         agar tidak ada XSS via manipulated lyrics data dari API.
 *   [SEC] enforceHttps(): pastikan semua fetch ke lyrics API pakai HTTPS,
 *         reject jika URL tidak HTTPS.
 *   [SEC] Batas panjang lyrics: max 50.000 karakter per fetch response
 *         untuk mencegah memory exhaustion via oversized payload.
 *   [SEC] sanitizeLine(): tiap baris lyrics di-sanitize sebelum masuk state.
 */

import { useEffect, useState, useRef } from "react";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { parseLrc, getActiveLine, getLrcPath, type ParsedLrc } from "../../lib/lrcParser";
import { useSettingsStore } from "../../store";

interface Props {
  songPath: string;
  currentTime: number;
  songTitle?: string;
  songArtist?: string;
}

// ─── Security helpers ─────────────────────────────────────────────────────────

/** [SEC] Strip semua HTML tags dari string */
function stripHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")           // hapus HTML tags
    .replace(/&lt;/g, "<")             // decode HTML entities yang aman
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/** [SEC] Sanitasi satu baris lyrics */
function sanitizeLine(text: string): string {
  if (typeof text !== "string") return "";
  const stripped = stripHtml(text);
  // Batasi panjang satu baris (max 500 karakter)
  return stripped.slice(0, 500);
}

/** [SEC] Sanitasi seluruh ParsedLrc result */
function sanitizeParsedLrc(parsed: ParsedLrc): ParsedLrc {
  return {
    metadata: {
      title:  parsed.metadata?.title  ? stripHtml(parsed.metadata.title).slice(0, 200)  : undefined,
      artist: parsed.metadata?.artist ? stripHtml(parsed.metadata.artist).slice(0, 200) : undefined,
      album:  parsed.metadata?.album  ? stripHtml(parsed.metadata.album).slice(0, 200)  : undefined,
      by:     parsed.metadata?.by     ? stripHtml(parsed.metadata.by).slice(0, 200)     : undefined,
    },
    lines: parsed.lines
      .slice(0, 2000) // max 2000 baris lyrics
      .map(line => ({
        ...line,
        text: sanitizeLine(line.text),
      }))
      .filter(line => line.text.length > 0), // hapus baris kosong setelah sanitasi
  };
}

/** [SEC] Pastikan URL adalah HTTPS. Return null jika bukan HTTPS. */
function enforceHttps(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      console.warn(`[LyricsPanel] Rejected non-HTTPS URL: ${url}`);
      return null;
    }
    return url;
  } catch {
    console.warn(`[LyricsPanel] Invalid URL: ${url}`);
    return null;
  }
}

/** [SEC] Batas panjang response lyrics dari API */
const MAX_LYRICS_RESPONSE_LENGTH = 50_000; // 50KB

// ─── Online fetch cache ───────────────────────────────────────────────────────
const onlineLyricsCache = new Map<string, ParsedLrc | "not_found">();

// ─── LRCLib API ───────────────────────────────────────────────────────────────
async function fetchFromLrcLib(title: string, artist: string): Promise<ParsedLrc | null> {
  try {
    const params = new URLSearchParams({
      track_name:  title.trim().slice(0, 200),
      artist_name: artist.trim().slice(0, 200),
    });

    // [SEC] Enforce HTTPS
    const rawUrl = `https://lrclib.net/api/get?${params.toString()}`;
    const url = enforceHttps(rawUrl);
    if (!url) return null;

    const res = await fetch(url, {
      headers: { "Lrclib-Client": "Resonance/0.1.0" },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;

    // [SEC] Batas ukuran response
    const text = await res.text();
    if (text.length > MAX_LYRICS_RESPONSE_LENGTH) {
      console.warn("[LyricsPanel] LRCLib response too large, rejected");
      return null;
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text);
    } catch {
      console.warn("[LyricsPanel] LRCLib response is not valid JSON");
      return null;
    }

    if (typeof data.syncedLyrics === "string") {
      const parsed = parseLrc(data.syncedLyrics);
      // [SEC] Sanitasi sebelum return
      return sanitizeParsedLrc(parsed);
    }

    if (typeof data.plainLyrics === "string") {
      const lines = data.plainLyrics
        .split("\n")
        .slice(0, 2000)
        .map((text: string, i: number) => ({
          time: i * 5,
          text: sanitizeLine(text),
        }))
        .filter((l: { time: number; text: string }) => l.text.length > 0);
      return sanitizeParsedLrc({
        metadata: { title, artist },
        lines,
      });
    }

    return null;
  } catch {
    return null;
  }
}

// ─── Lyrics.ovh API ──────────────────────────────────────────────────────────
async function fetchFromLyricsOvh(title: string, artist: string): Promise<ParsedLrc | null> {
  try {
    // [SEC] Enforce HTTPS + encode parameter dengan benar
    const rawUrl = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist.trim().slice(0, 200))}/${encodeURIComponent(title.trim().slice(0, 200))}`;
    const url = enforceHttps(rawUrl);
    if (!url) return null;

    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;

    // [SEC] Batas ukuran response
    const text = await res.text();
    if (text.length > MAX_LYRICS_RESPONSE_LENGTH) {
      console.warn("[LyricsPanel] Lyrics.ovh response too large, rejected");
      return null;
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text);
    } catch {
      console.warn("[LyricsPanel] Lyrics.ovh response is not valid JSON");
      return null;
    }

    if (typeof data.lyrics !== "string") return null;

    const lines = data.lyrics
      .split("\n")
      .slice(0, 2000)
      .map((text: string, i: number) => ({
        time: i * 5,
        text: sanitizeLine(text),
      }))
      .filter((l: { time: number; text: string }) => l.text.length > 0);

    return sanitizeParsedLrc({
      metadata: { title, artist },
      lines,
    });
  } catch {
    return null;
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function LyricsPanel({ songPath, currentTime, songTitle, songArtist }: Props) {
  const [lyrics, setLyrics]         = useState<ParsedLrc | null>(null);
  const [loading, setLoading]       = useState(false);
  const [source, setSource]         = useState<"local" | "lrclib" | "lyrics_ovh" | "not_found">("local");
  const activeRef  = useRef<HTMLDivElement>(null);
  const prevSongRef = useRef<string>("");

  const { autoFetchLyrics, lyricsSource } = useSettingsStore() as any;

  useEffect(() => {
    if (!songPath || songPath === prevSongRef.current) return;
    prevSongRef.current = songPath;

    setLyrics(null);
    setSource("local");
    setLoading(true);

    const lrcPath    = getLrcPath(songPath);
    const cacheKey   = `${songTitle ?? ""}|${songArtist ?? ""}`;

    (async () => {
      // 1. Coba .lrc lokal dulu
      try {
        const content = await readTextFile(lrcPath);
        const parsed  = parseLrc(content);
        if (parsed.lines.length > 0) {
          // [SEC] Sanitasi lyrics lokal juga
          setLyrics(sanitizeParsedLrc(parsed));
          setSource("local");
          setLoading(false);
          return;
        }
      } catch {
        // File tidak ada → lanjut ke online fetch
      }

      // 2. Jika auto fetch nonaktif → stop
      if (!autoFetchLyrics || !songTitle || !songArtist) {
        setSource("not_found");
        setLoading(false);
        return;
      }

      // 3. Cek memory cache
      if (onlineLyricsCache.has(cacheKey)) {
        const cached = onlineLyricsCache.get(cacheKey)!;
        if (cached === "not_found") {
          setSource("not_found");
        } else {
          setLyrics(cached);
          setSource("lrclib");
        }
        setLoading(false);
        return;
      }

      // 4. Fetch dari internet
      let fetched: ParsedLrc | null = null;
      let fetchedFrom: "lrclib" | "lyrics_ovh" = "lrclib";

      if ((lyricsSource ?? "lrclib") === "lrclib") {
        fetched = await fetchFromLrcLib(songTitle, songArtist);
        fetchedFrom = "lrclib";
        if (!fetched) {
          fetched = await fetchFromLyricsOvh(songTitle, songArtist);
          fetchedFrom = "lyrics_ovh";
        }
      } else {
        fetched = await fetchFromLyricsOvh(songTitle, songArtist);
        fetchedFrom = "lyrics_ovh";
        if (!fetched) {
          fetched = await fetchFromLrcLib(songTitle, songArtist);
          fetchedFrom = "lrclib";
        }
      }

      if (fetched && fetched.lines.length > 0) {
        onlineLyricsCache.set(cacheKey, fetched);
        setLyrics(fetched);
        setSource(fetchedFrom);
      } else {
        onlineLyricsCache.set(cacheKey, "not_found");
        setSource("not_found");
      }

      setLoading(false);
    })();
  }, [songPath, songTitle, songArtist, autoFetchLyrics, lyricsSource]);

  // Auto-scroll
  const activeLine = lyrics ? getActiveLine(lyrics.lines, currentTime) : -1;

  useEffect(() => {
    if (activeLine < 0) return;
    activeRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [activeLine]);

  // ── Render states ─────────────────────────────────────────────────────────

  if (loading) return (
    <div style={containerStyle}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 24, gap: 8 }}>
        <div style={{
          width: 16, height: 16, borderRadius: "50%",
          border: "2px solid #7C3AED", borderTopColor: "transparent",
          animation: "spin 0.8s linear infinite",
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        <p style={{ ...placeholderStyle, marginTop: 0 }}>Mencari lyrics...</p>
      </div>
    </div>
  );

  if (source === "not_found" || !lyrics || lyrics.lines.length === 0) return (
    <div style={containerStyle}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 20, gap: 4 }}>
        <p style={{ fontSize: 20 }}>🎵</p>
        <p style={placeholderStyle}>Lyrics tidak ditemukan</p>
        <p style={{ ...placeholderStyle, fontSize: 10, color: "#3f3f5a", marginTop: 0 }}>
          Tambahkan file .lrc dengan nama yang sama di folder yang sama
        </p>
        {!autoFetchLyrics && (
          <p style={{ ...placeholderStyle, fontSize: 10, color: "#4b5563", marginTop: 4 }}>
            Aktifkan "Auto Fetch" di Settings untuk cari online
          </p>
        )}
      </div>
    </div>
  );

  const isSynced = lyrics.lines.some(l => l.time > 0 && l.time !== Math.floor(l.time / 5) * 5);

  return (
    <div style={containerStyle}>
      {/* Source badge */}
      {source !== "local" && (
        <div style={{
          textAlign: "center", marginBottom: 8,
          fontSize: 9, color: "#4b5563",
        }}>
          via {source === "lrclib" ? "LRCLib" : "Lyrics.ovh"}
          {!isSynced && " (teks)"}
        </div>
      )}

      {/* Metadata */}
      {(lyrics.metadata?.title || lyrics.metadata?.artist) && source === "local" && (
        <div style={{ marginBottom: 12, textAlign: "center" }}>
          {lyrics.metadata.title && (
            <p style={{ fontSize: 11, color: "#a78bfa", fontWeight: 600 }}>
              {lyrics.metadata.title}
            </p>
          )}
          {lyrics.metadata.artist && (
            <p style={{ fontSize: 10, color: "#6b7280" }}>{lyrics.metadata.artist}</p>
          )}
        </div>
      )}

      {/* Lines — [SEC] render sebagai text biasa, bukan dangerouslySetInnerHTML */}
      {lyrics.lines.map((line, i) => {
        const isActive = i === activeLine;
        const isPast   = i < activeLine;

        return (
          <div
            key={i}
            ref={isActive ? activeRef : undefined}
            style={{
              padding: "5px 12px",
              textAlign: "center",
              fontSize: isActive ? 14 : 12,
              fontWeight: isActive ? 700 : 400,
              color: isActive ? "#f1f5f9"
                   : isPast   ? "rgba(161,161,170,0.5)"
                   : "rgba(161,161,170,0.3)",
              lineHeight: 1.6,
              transition: "all 0.3s ease",
              transform: isActive ? "scale(1.03)" : "scale(1)",
              transformOrigin: "center",
              textShadow: isActive ? "0 0 12px rgba(124,58,237,0.6)" : "none",
              // [SEC] Pastikan text tidak bisa breakout via CSS injection
              wordBreak: "break-word",
              overflowWrap: "break-word",
            }}
          >
            {/* [SEC] Render sebagai text content biasa (bukan HTML) */}
            {line.text || "♪"}
          </div>
        );
      })}

      <div style={{ height: 60 }} />
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  height: "100%",
  overflowY: "auto",
  overflowX: "hidden",
  padding: "8px 0",
  scrollbarWidth: "thin",
  scrollbarColor: "rgba(124,58,237,0.3) transparent",
};

const placeholderStyle: React.CSSProperties = {
  textAlign: "center",
  fontSize: 12,
  color: "#4b5563",
  marginTop: 20,
  padding: "0 20px",
};