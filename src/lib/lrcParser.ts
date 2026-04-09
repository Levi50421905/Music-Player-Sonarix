/**
 * lrcParser.ts — LRC Lyric File Parser
 *
 * WHY: Format .lrc adalah standar de-facto untuk lyrics dengan timestamp.
 * Setiap baris memiliki timestamp [mm:ss.xx] yang kita sync dengan posisi audio.
 *
 * FORMAT .lrc:
 *   [00:12.34] Baris lirik pertama
 *   [00:16.80] Baris berikutnya
 *   [ti: Judul lagu]   ← metadata tag (opsional)
 *
 * ENHANCED LRC (A2 extension):
 *   [00:12.34] <00:12.34>kata <00:12.80>per <00:13.20>kata
 */

export interface LyricLine {
  time: number;    // dalam detik
  text: string;    // teks lirik
  words?: LyricWord[]; // untuk word-by-word highlight (A2 extension)
}

export interface LyricWord {
  time: number;
  word: string;
}

export interface LrcMetadata {
  title?: string;
  artist?: string;
  album?: string;
  by?: string;    // pembuat file LRC
}

export interface ParsedLrc {
  metadata: LrcMetadata;
  lines: LyricLine[];
}

/**
 * Parse string isi file .lrc menjadi array LyricLine yang sudah di-sort.
 */
export function parseLrc(content: string): ParsedLrc {
  const lines = content.split("\n");
  const lyricLines: LyricLine[] = [];
  const metadata: LrcMetadata = {};

  // Regex untuk timestamp: [mm:ss.xx] atau [mm:ss:xx]
  const timeRegex = /\[(\d{1,2}):(\d{2})[.:]((\d{2,3}))\]/g;
  const metaRegex = /^\[([a-z]+):\s*(.+)\]$/i;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Cek apakah ini metadata tag
    const metaMatch = line.match(metaRegex);
    if (metaMatch) {
      const [, key, val] = metaMatch;
      switch (key.toLowerCase()) {
        case "ti": metadata.title = val; break;
        case "ar": metadata.artist = val; break;
        case "al": metadata.album = val; break;
        case "by": metadata.by = val; break;
      }
      continue;
    }

    // Parse timestamp(s) dan teks
    // Satu baris bisa punya multiple timestamp: [00:10.00][00:45.00]teks
    const timestamps: number[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    timeRegex.lastIndex = 0;
    while ((match = timeRegex.exec(line)) !== null) {
      const minutes = parseInt(match[1]);
      const seconds = parseInt(match[2]);
      const centiseconds = parseInt(match[4]);
      const multiplier = match[4].length === 3 ? 1000 : 100; // ms vs cs
      const time = minutes * 60 + seconds + centiseconds / multiplier;
      timestamps.push(time);
      lastIndex = match.index + match[0].length;
    }

    if (timestamps.length === 0) continue;

    // Teks setelah semua timestamp
    const text = line.slice(lastIndex).trim();
    if (!text) continue;

    // Parse word-by-word jika ada A2 extension (<mm:ss.xx>kata)
    const words = parseA2Words(text);

    for (const time of timestamps) {
      lyricLines.push({ time, text: stripA2Tags(text), words: words.length > 0 ? words : undefined });
    }
  }

  // Sort berdasarkan waktu
  lyricLines.sort((a, b) => a.time - b.time);

  return { metadata, lines: lyricLines };
}

/** Parse A2 word-level timestamps: <mm:ss.xx>kata */
function parseA2Words(text: string): LyricWord[] {
  const wordRegex = /<(\d{1,2}):(\d{2})\.(\d{2,3})>([^<]*)/g;
  const words: LyricWord[] = [];
  let match: RegExpExecArray | null;

  while ((match = wordRegex.exec(text)) !== null) {
    const time = parseInt(match[1]) * 60 + parseInt(match[2]) + parseInt(match[3]) / 100;
    const word = match[4].trim();
    if (word) words.push({ time, word });
  }

  return words;
}

/** Hapus A2 tags dari teks untuk display biasa */
function stripA2Tags(text: string): string {
  return text.replace(/<\d{1,2}:\d{2}\.\d{2,3}>/g, "").trim();
}

/**
 * Cari index baris lirik yang aktif berdasarkan posisi audio saat ini.
 * Return -1 jika belum ada lirik yang aktif.
 *
 * CARA KERJA: Binary-search-like — ambil baris terakhir yang timenya <= currentTime
 */
export function getActiveLine(lines: LyricLine[], currentTime: number): number {
  let active = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= currentTime) active = i;
    else break;
  }
  return active;
}

/**
 * Cari file .lrc yang bersesuaian dengan file audio.
 * Konvensi: sama-sama nama file, beda ekstensi.
 * Contoh: "song.mp3" → cari "song.lrc"
 */
export function getLrcPath(audioPath: string): string {
  return audioPath.replace(/\.[^.]+$/, ".lrc");
}