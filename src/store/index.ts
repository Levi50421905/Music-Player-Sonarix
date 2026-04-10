/**
 * store/index.ts — Zustand State Management
 *
 * Key fixes:
 *   - Queue NOT auto-populated from library on init
 *   - nextTrack: respects repeat mode properly
 *     - repeat=one  → same song
 *     - repeat=all  → loop back to start when end reached
 *     - repeat=off  → stop at end
 *   - addToQueue / removeFromQueue / clearQueue
 *   - setSongs always validates array
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Song, PlayRecord } from "../lib/db";

// ── Player Store ──────────────────────────────────────────────────────────────
interface PlayerState {
  currentSong: Song | null;
  isPlaying: boolean;
  progress: number;
  currentTime: number;
  duration: number;
  volume: number;
  shuffle: boolean;
  repeat: "off" | "one" | "all";
  queue: Song[];
  queueIndex: number;
  history: PlayRecord[];

  setCurrentSong: (song: Song) => void;
  setIsPlaying: (v: boolean) => void;
  setProgress: (v: number) => void;
  setCurrentTime: (v: number) => void;
  setDuration: (v: number) => void;
  setVolume: (v: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setQueue: (songs: Song[], startIndex?: number) => void;
  addToQueue: (song: Song) => void;
  removeFromQueue: (songId: number) => void;
  clearQueue: () => void;
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
      setIsPlaying:   (v)    => set({ isPlaying: v }),
      setProgress:    (v)    => set({ progress: v }),
      setCurrentTime: (v)    => set({ currentTime: v }),
      setDuration:    (v)    => set({ duration: v }),
      setVolume:      (v)    => set({ volume: v }),

      toggleShuffle: () => set(s => ({ shuffle: !s.shuffle })),

      cycleRepeat: () => set(s => ({
        repeat: s.repeat === "off" ? "all" : s.repeat === "all" ? "one" : "off"
      })),

      // Explicitly set queue when user chooses to play something
      setQueue: (songs, startIndex = 0) => {
        const list  = Array.isArray(songs) ? songs : [];
        const idx   = Math.max(0, Math.min(startIndex, list.length - 1));
        set({
          queue:       list,
          queueIndex:  idx,
          currentSong: list[idx] ?? null,
        });
      },

      addToQueue: (song) => set(s => {
        // Don't duplicate
        if (s.queue.some(q => q.id === song.id)) return s;
        return { queue: [...s.queue, song] };
      }),

      removeFromQueue: (songId) => set(s => {
        const removedIdx = s.queue.findIndex(q => q.id === songId);
        if (removedIdx < 0) return s;
        const newQueue = s.queue.filter(q => q.id !== songId);
        let newIdx = s.queueIndex;
        if (removedIdx < s.queueIndex) {
          newIdx = Math.max(0, s.queueIndex - 1);
        } else if (removedIdx === s.queueIndex) {
          newIdx = Math.min(newIdx, newQueue.length - 1);
        }
        return { queue: newQueue, queueIndex: Math.max(0, newIdx) };
      }),

      clearQueue: () => set(s => {
        if (s.currentSong) return { queue: [s.currentSong], queueIndex: 0 };
        return { queue: [], queueIndex: 0 };
      }),

      nextTrack: () => {
        const { queue, queueIndex, repeat, shuffle, history } = get();
        if (queue.length === 0) return null;

        // Repeat one: replay same
        if (repeat === "one") {
          return queue[queueIndex];
        }

        // Shuffle: weighted random
        if (shuffle) {
          try {
            const { weightedRandom } = require("../lib/smartShuffle");
            const next = weightedRandom(queue, history);
            const idx  = queue.findIndex(s => s.id === next.id);
            set({ queueIndex: idx >= 0 ? idx : 0, currentSong: next });
            return next;
          } catch {
            // fallback to linear
          }
        }

        const nextIdx = queueIndex + 1;

        if (nextIdx >= queue.length) {
          // End of queue
          if (repeat === "all") {
            // Loop back to start
            set({ queueIndex: 0, currentSong: queue[0] });
            return queue[0];
          }
          // repeat === "off": stop
          return null;
        }

        set({ queueIndex: nextIdx, currentSong: queue[nextIdx] });
        return queue[nextIdx];
      },

      prevTrack: () => {
        const { queue, queueIndex } = get();
        if (queue.length === 0) return null;
        const prevIdx = Math.max(0, queueIndex - 1);
        set({ queueIndex: prevIdx, currentSong: queue[prevIdx] });
        return queue[prevIdx];
      },

      addToHistory: (songId) => {
        const record: PlayRecord = { song_id: songId, played_at: new Date().toISOString() };
        set(s => ({ history: [record, ...s.history].slice(0, 500) }));
      },
    }),
    {
      name: "resonance-player",
      // Only persist settings, not playback state
      partialize: (s) => ({ volume: s.volume, shuffle: s.shuffle, repeat: s.repeat }),
    }
  )
);

// ── Library Store ─────────────────────────────────────────────────────────────
interface LibraryState {
  songs: Song[];
  playlists: { id: number; name: string; count: number; created_at: string }[];
  isLoading: boolean;
  scanProgress: { total: number; current: number; currentFile: string; currentFolder?: string; done: boolean } | null;

  setSongs: (songs: Song[] | ((prev: Song[]) => Song[])) => void;
  updateSongRating: (songId: number, stars: number) => void;
  setPlaylists: (p: LibraryState["playlists"]) => void;
  setLoading: (v: boolean) => void;
  setScanProgress: (p: LibraryState["scanProgress"]) => void;
  addSongs: (songs: Song[]) => void;
}

export const useLibraryStore = create<LibraryState>()((set, get) => ({
  songs: [],
  playlists: [],
  isLoading: false,
  scanProgress: null,

  setSongs: (songs) => set(s => ({
    songs: typeof songs === "function"
      ? (() => {
          const r = (songs as (p: Song[]) => Song[])(s.songs);
          return Array.isArray(r) ? r : s.songs;
        })()
      : (Array.isArray(songs) ? songs : s.songs),
  })),

  updateSongRating: (songId, stars) => set(s => ({
    songs: s.songs.map(song => song.id === songId ? { ...song, stars } : song),
  })),

  setPlaylists: (p)  => set({ playlists: Array.isArray(p) ? p : [] }),
  setLoading:   (v)  => set({ isLoading: v }),
  setScanProgress: (p) => set({ scanProgress: p }),

  addSongs: (newSongs) => set(s => {
    const map = new Map(s.songs.map(s => [s.path, s]));
    newSongs.forEach(ns => map.set(ns.path, { ...map.get(ns.path), ...ns }));
    return { songs: Array.from(map.values()) };
  }),
}));

// ── Settings Store ────────────────────────────────────────────────────────────
interface SettingsState {
  theme: "dark" | "darker" | "amoled";
  accentColor: string;
  eqGains: number[];
  eqPreset: string;
  visualizerType: "bar" | "wave" | "circle";
  showLyrics: boolean;
  sleepTimer: number | null;
  watchFolders: string[];

  setTheme: (t: SettingsState["theme"]) => void;
  setAccentColor: (c: string) => void;
  setEqGains: (g: number[]) => void;
  setEqPreset: (p: string) => void;
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

      setTheme:          (t) => set({ theme: t }),
      setAccentColor:    (c) => set({ accentColor: c }),
      setEqGains:        (g) => set({ eqGains: g }),
      setEqPreset:       (p) => set({ eqPreset: p }),
      setVisualizerType: (t) => set({ visualizerType: t }),
      toggleLyrics:      ()  => set(s => ({ showLyrics: !s.showLyrics })),
      setSleepTimer:     (m) => set({ sleepTimer: m }),
      addWatchFolder:    (path) => set(s => ({
        watchFolders: s.watchFolders.includes(path) ? s.watchFolders : [...s.watchFolders, path],
      })),
      removeWatchFolder: (path) => set(s => ({
        watchFolders: s.watchFolders.filter(f => f !== path),
      })),
    }),
    { name: "resonance-settings" }
  )
);