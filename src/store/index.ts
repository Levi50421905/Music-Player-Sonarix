/**
 * store/index.ts — Zustand State Management
 *
 * WHY Zustand vs Redux/Context:
 *   - Minimal boilerplate
 *   - Tidak butuh Provider wrapper
 *   - Subscribe ke slice state (tidak re-render seluruh tree)
 *   - Bisa dipakai di luar React component (misal: di audioEngine callback)
 *
 * PATTERN: Satu file untuk semua store agar import lebih simpel.
 * Setiap store punya state + actions dalam satu object.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Song, PlayRecord } from "../lib/db"; // type import

// ── Player Store ──────────────────────────────────────────────────────────────
// Bertanggung jawab atas state playback saat ini

interface PlayerState {
  // State
  currentSong: Song | null;
  isPlaying: boolean;
  progress: number;       // 0–100
  currentTime: number;    // detik
  duration: number;       // detik
  volume: number;         // 0–100
  shuffle: boolean;
  repeat: "off" | "one" | "all";
  queue: Song[];
  queueIndex: number;
  history: PlayRecord[];  // play history in-memory (sync dengan DB)

  // Actions
  setCurrentSong: (song: Song) => void;
  setIsPlaying: (v: boolean) => void;
  setProgress: (v: number) => void;
  setCurrentTime: (v: number) => void;
  setDuration: (v: number) => void;
  setVolume: (v: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setQueue: (songs: Song[], startIndex?: number) => void;
  nextTrack: () => Song | null;
  prevTrack: () => Song | null;
  addToHistory: (songId: number) => void;
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      currentSong: null,
      isPlaying: false,
      progress: 0,
      currentTime: 0,
      duration: 0,
      volume: 80,
      shuffle: false,
      repeat: "off",
      queue: [],
      queueIndex: 0,
      history: [],

      setCurrentSong: (song) => set({ currentSong: song }),
      setIsPlaying: (v) => set({ isPlaying: v }),
      setProgress: (v) => set({ progress: v }),
      setCurrentTime: (v) => set({ currentTime: v }),
      setDuration: (v) => set({ duration: v }),
      setVolume: (v) => set({ volume: v }),

      toggleShuffle: () => set(s => ({ shuffle: !s.shuffle })),

      cycleRepeat: () => set(s => ({
        repeat: s.repeat === "off" ? "all" : s.repeat === "all" ? "one" : "off"
      })),

      setQueue: (songs, startIndex = 0) => set({
        queue: songs,
        queueIndex: startIndex,
        currentSong: songs[startIndex] ?? null,
      }),

      nextTrack: () => {
        const { queue, queueIndex, repeat, shuffle, history } = get();
        if (queue.length === 0) return null;

        if (repeat === "one") {
          return queue[queueIndex];
        }

        if (shuffle) {
          // Weighted random (import di sini untuk menghindari circular dependency)
          const { weightedRandom } = require("../lib/smartShuffle");
          const next = weightedRandom(queue, history);
          const idx = queue.findIndex(s => s.id === next.id);
          set({ queueIndex: idx, currentSong: next });
          return next;
        }

        const nextIdx = (queueIndex + 1) % queue.length;
        if (nextIdx === 0 && repeat === "off") return null; // end of queue
        set({ queueIndex: nextIdx, currentSong: queue[nextIdx] });
        return queue[nextIdx];
      },

      prevTrack: () => {
        const { queue, queueIndex } = get();
        if (queue.length === 0) return null;
        const prevIdx = (queueIndex - 1 + queue.length) % queue.length;
        set({ queueIndex: prevIdx, currentSong: queue[prevIdx] });
        return queue[prevIdx];
      },

      addToHistory: (songId) => {
        const record: PlayRecord = { song_id: songId, played_at: new Date().toISOString() };
        set(s => ({ history: [record, ...s.history].slice(0, 500) })); // keep last 500
      },
    }),
    {
      name: "resonance-player",
      // Hanya persist setting, bukan playback state
      partialize: (s) => ({ volume: s.volume, shuffle: s.shuffle, repeat: s.repeat }),
    }
  )
);

// ── Library Store ─────────────────────────────────────────────────────────────
// Bertanggung jawab atas koleksi lagu dan playlist

interface LibraryState {
  songs: Song[];
  playlists: { id: number; name: string; count: number; created_at: string }[];
  isLoading: boolean;
  scanProgress: { total: number; current: number; currentFile: string; done: boolean } | null;

  setSongs: (songs: Song[]) => void;
  updateSongRating: (songId: number, stars: number) => void;
  setPlaylists: (playlists: LibraryState["playlists"]) => void;
  setLoading: (v: boolean) => void;
  setScanProgress: (p: LibraryState["scanProgress"]) => void;
  addSongs: (songs: Song[]) => void;
}

export const useLibraryStore = create<LibraryState>()((set) => ({
  songs: [],
  playlists: [],
  isLoading: false,
  scanProgress: null,

  setSongs: (songs) => set({ songs }),
  updateSongRating: (songId, stars) => set(s => ({
    songs: s.songs.map(song => song.id === songId ? { ...song, stars } : song)
  })),
  setPlaylists: (playlists) => set({ playlists }),
  setLoading: (v) => set({ isLoading: v }),
  setScanProgress: (p) => set({ scanProgress: p }),
  addSongs: (newSongs) => set(s => {
    // Merge: update existing, append new
    const map = new Map(s.songs.map(s => [s.path, s]));
    newSongs.forEach(ns => map.set(ns.path, { ...map.get(ns.path), ...ns }));
    return { songs: Array.from(map.values()) };
  }),
}));

// ── Settings Store ────────────────────────────────────────────────────────────
// Persistent user preferences

interface SettingsState {
  theme: "dark" | "darker" | "amoled";
  accentColor: string;
  eqGains: number[];
  eqPreset: string;
  visualizerType: "bar" | "wave" | "circle";
  showLyrics: boolean;
  sleepTimer: number | null; // menit, null = off
  watchFolders: string[];

  setTheme: (t: SettingsState["theme"]) => void;
  setAccentColor: (c: string) => void;
  setEqGains: (gains: number[]) => void;
  setEqPreset: (preset: string) => void;
  setVisualizerType: (t: SettingsState["visualizerType"]) => void;
  toggleLyrics: () => void;
  setSleepTimer: (min: number | null) => void;
  addWatchFolder: (path: string) => void;
  removeWatchFolder: (path: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "dark",
      accentColor: "#7C3AED",
      eqGains: new Array(10).fill(0),
      eqPreset: "Flat",
      visualizerType: "bar",
      showLyrics: true,
      sleepTimer: null,
      watchFolders: [],

      setTheme: (t) => set({ theme: t }),
      setAccentColor: (c) => set({ accentColor: c }),
      setEqGains: (gains) => set({ eqGains: gains }),
      setEqPreset: (preset) => set({ eqPreset: preset }),
      setVisualizerType: (t) => set({ visualizerType: t }),
      toggleLyrics: () => set(s => ({ showLyrics: !s.showLyrics })),
      setSleepTimer: (min) => set({ sleepTimer: min }),
      addWatchFolder: (path) => set(s => ({
        watchFolders: s.watchFolders.includes(path)
          ? s.watchFolders
          : [...s.watchFolders, path]
      })),
      removeWatchFolder: (path) => set(s => ({
        watchFolders: s.watchFolders.filter(f => f !== path)
      })),
    }),
    { name: "resonance-settings" }
  )
);