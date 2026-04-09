/**
 * LyricsPanel.tsx — Synced Lyrics Display
 *
 * Flow:
 *   1. Dari path audio (misal: /music/song.mp3) → cari /music/song.lrc
 *   2. Baca file .lrc via Tauri FS → parseLrc()
 *   3. getActiveLine(lines, currentTime) → highlight baris aktif
 *   4. Auto-scroll ke baris aktif dengan smooth behavior
 *
 * Jika tidak ada .lrc → tampil placeholder "No lyrics found"
 */

import { useEffect, useState, useRef, useCallback } from "react";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { parseLrc, getActiveLine, type ParsedLrc } from "../../lib/lrcParser";
import { getLrcPath } from "../../lib/lrcParser";

interface Props {
  songPath: string;
  currentTime: number;
}

export default function LyricsPanel({ songPath, currentTime }: Props) {
  const [lyrics, setLyrics] = useState<ParsedLrc | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const activeRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevSongRef = useRef<string>("");

  // Load .lrc saat lagu berganti
  useEffect(() => {
    if (!songPath || songPath === prevSongRef.current) return;
    prevSongRef.current = songPath;

    setLyrics(null);
    setError(false);
    setLoading(true);

    const lrcPath = getLrcPath(songPath);

    readTextFile(lrcPath)
      .then(content => {
        const parsed = parseLrc(content);
        setLyrics(parsed);
      })
      .catch(() => {
        setError(true);
      })
      .finally(() => setLoading(false));
  }, [songPath]);

  // Auto-scroll ke baris aktif
  const activeLine = lyrics ? getActiveLine(lyrics.lines, currentTime) : -1;

  useEffect(() => {
    if (activeLine < 0) return;
    activeRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [activeLine]);

  if (loading) return (
    <div style={containerStyle}>
      <p style={placeholderStyle}>Loading lyrics...</p>
    </div>
  );

  if (error || !lyrics || lyrics.lines.length === 0) return (
    <div style={containerStyle}>
      <p style={placeholderStyle}>
        {error ? "No lyrics found" : "No lyrics"}
      </p>
      <p style={{ ...placeholderStyle, fontSize: 10, marginTop: 4 }}>
        {error ? `Add a .lrc file next to the audio file` : ""}
      </p>
    </div>
  );

  return (
    <div ref={containerRef} style={containerStyle}>
      {/* Metadata */}
      {(lyrics.metadata.title || lyrics.metadata.artist) && (
        <div style={{ marginBottom: 16, textAlign: "center" }}>
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

      {/* Lines */}
      {lyrics.lines.map((line, i) => {
        const isActive = i === activeLine;
        const isPast = i < activeLine;
        const isFuture = i > activeLine;

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
              // Active line glow
              textShadow: isActive ? "0 0 12px rgba(124,58,237,0.6)" : "none",
            }}
          >
            {line.text}
          </div>
        );
      })}

      {/* Padding bottom */}
      <div style={{ height: 60 }} />
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  height: "100%",
  overflowY: "auto",
  padding: "8px 0",
  scrollbarWidth: "thin",
};

const placeholderStyle: React.CSSProperties = {
  textAlign: "center",
  fontSize: 12,
  color: "#4b5563",
  marginTop: 20,
  padding: "0 20px",
};