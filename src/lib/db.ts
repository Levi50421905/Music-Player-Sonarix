/**
 * db.ts — SQLite Database Layer
 *
 * WHY: Semua data library, rating, play history, dan settings disimpan secara
 * lokal menggunakan SQLite via Tauri's SQL plugin. Ini lebih ringan dari
 * IndexedDB dan lebih powerful dari localStorage untuk data relasional.
 *
 * PATTERN: Semua fungsi async, return typed objects, error selalu di-throw
 * agar bisa di-catch di layer atas (store/component).
 */

import Database from "@tauri-apps/plugin-sql";

let _db: Database | null = null;

// ── Singleton DB connection ──────────────────────────────────────────────────
export async function getDb(): Promise<Database> {
  if (_db) return _db;
  _db = await Database.load("sqlite:resonance.db");
  await migrate(_db);
  return _db;
}

// ── Schema migration ─────────────────────────────────────────────────────────
// WHY migration pattern: memastikan schema selalu up-to-date tanpa
// menghapus data yang sudah ada saat app di-update.
async function migrate(db: Database) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS songs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      path        TEXT    UNIQUE NOT NULL,
      title       TEXT,
      artist      TEXT,
      album       TEXT,
      genre       TEXT,
      year        INTEGER,
      duration    REAL,
      bitrate     INTEGER,
      format      TEXT,
      cover_art   TEXT,   -- base64 atau file path thumbnail
      bpm         REAL,
      date_added  DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ratings (
      song_id  INTEGER PRIMARY KEY,
      stars    INTEGER CHECK(stars BETWEEN 1 AND 5),
      FOREIGN KEY(song_id) REFERENCES songs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS play_history (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      song_id    INTEGER NOT NULL,
      played_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(song_id) REFERENCES songs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS playlists (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS playlist_songs (
      playlist_id  INTEGER NOT NULL,
      song_id      INTEGER NOT NULL,
      position     INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(playlist_id, song_id),
      FOREIGN KEY(playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
      FOREIGN KEY(song_id)     REFERENCES songs(id)     ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key    TEXT PRIMARY KEY,
      value  TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_play_history_song ON play_history(song_id);
    CREATE INDEX IF NOT EXISTS idx_songs_artist      ON songs(artist);
    CREATE INDEX IF NOT EXISTS idx_songs_album       ON songs(album);
  `);
}

// ── Song CRUD ────────────────────────────────────────────────────────────────

export interface Song {
  id: number;
  path: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  year: number | null;
  duration: number;
  bitrate: number;
  format: string;
  cover_art: string | null;
  bpm: number | null;
  date_added: string;
  // joined fields
  stars?: number;
  play_count?: number;
}

/** Insert atau update (upsert) lagu berdasarkan path */
export async function upsertSong(db: Database, song: Omit<Song, "id" | "date_added">) {
  await db.execute(
    `INSERT INTO songs (path, title, artist, album, genre, year, duration, bitrate, format, cover_art, bpm)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT(path) DO UPDATE SET
       title=excluded.title, artist=excluded.artist, album=excluded.album,
       genre=excluded.genre, year=excluded.year, duration=excluded.duration,
       bitrate=excluded.bitrate, format=excluded.format,
       cover_art=excluded.cover_art, bpm=excluded.bpm`,
    [song.path, song.title, song.artist, song.album, song.genre,
     song.year, song.duration, song.bitrate, song.format, song.cover_art, song.bpm]
  );
}

/** Ambil semua lagu beserta rating & play count (LEFT JOIN) */
export async function getAllSongs(db: Database): Promise<Song[]> {
  return await db.select<Song[]>(`
    SELECT s.*,
           r.stars,
           COUNT(ph.id) AS play_count
    FROM songs s
    LEFT JOIN ratings r     ON r.song_id = s.id
    LEFT JOIN play_history ph ON ph.song_id = s.id
    GROUP BY s.id
    ORDER BY s.title
  `);
}

/** Cari lagu berdasarkan query (title/artist/album) */
export async function searchSongs(db: Database, query: string): Promise<Song[]> {
  const q = `%${query}%`;
  return await db.select<Song[]>(
    `SELECT s.*, r.stars, COUNT(ph.id) AS play_count
     FROM songs s
     LEFT JOIN ratings r ON r.song_id = s.id
     LEFT JOIN play_history ph ON ph.song_id = s.id
     WHERE s.title LIKE $1 OR s.artist LIKE $1 OR s.album LIKE $1
     GROUP BY s.id ORDER BY s.title`,
    [q]
  );
}

// ── Rating ───────────────────────────────────────────────────────────────────

export async function setRating(db: Database, songId: number, stars: number) {
  await db.execute(
    `INSERT INTO ratings (song_id, stars) VALUES ($1,$2)
     ON CONFLICT(song_id) DO UPDATE SET stars=excluded.stars`,
    [songId, stars]
  );
}

// ── Play History ─────────────────────────────────────────────────────────────

export async function recordPlay(db: Database, songId: number) {
  await db.execute(
    `INSERT INTO play_history (song_id) VALUES ($1)`,
    [songId]
  );
}

export async function getPlayHistory(db: Database, limit = 200) {
  return await db.select<{ song_id: number; played_at: string }[]>(
    `SELECT song_id, played_at FROM play_history ORDER BY played_at DESC LIMIT $1`,
    [limit]
  );
}

// ── Playlists ─────────────────────────────────────────────────────────────────

export async function createPlaylist(db: Database, name: string): Promise<number> {
  const result = await db.execute(
    `INSERT INTO playlists (name) VALUES ($1)`, [name]
  );
  return result.lastInsertId as number;
}

export async function getPlaylists(db: Database) {
  return await db.select<{ id: number; name: string; count: number; created_at: string }[]>(`
    SELECT p.*, COUNT(ps.song_id) AS count
    FROM playlists p
    LEFT JOIN playlist_songs ps ON ps.playlist_id = p.id
    GROUP BY p.id ORDER BY p.created_at DESC
  `);
}

export async function addToPlaylist(db: Database, playlistId: number, songId: number) {
  const rows = await db.select<{ max_pos: number }[]>(
    `SELECT COALESCE(MAX(position),0) AS max_pos FROM playlist_songs WHERE playlist_id=$1`,
    [playlistId]
  );
  const pos = (rows[0]?.max_pos ?? 0) + 1;
  await db.execute(
    `INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id, position) VALUES ($1,$2,$3)`,
    [playlistId, songId, pos]
  );
}

export async function getPlaylistSongs(db: Database, playlistId: number): Promise<Song[]> {
  return await db.select<Song[]>(`
    SELECT s.*, r.stars, COUNT(ph.id) AS play_count
    FROM playlist_songs ps
    JOIN songs s ON s.id = ps.song_id
    LEFT JOIN ratings r ON r.song_id = s.id
    LEFT JOIN play_history ph ON ph.song_id = s.id
    WHERE ps.playlist_id = $1
    GROUP BY s.id ORDER BY ps.position
  `, [playlistId]);
}

// ── Settings ──────────────────────────────────────────────────────────────────

export async function getSetting(db: Database, key: string): Promise<string | null> {
  const rows = await db.select<{ value: string }[]>(
    `SELECT value FROM settings WHERE key=$1`, [key]
  );
  return rows[0]?.value ?? null;
}

export async function setSetting(db: Database, key: string, value: string) {
  await db.execute(
    `INSERT INTO settings (key,value) VALUES ($1,$2)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
    [key, value]
  );
}