/**
 * store/index.ts — v5
 *
 * PERBAIKAN vs v4:
 *   [#8/#9] Semua setting baru ditambahkan dan persistent:
 *           - animationSpeed, doubleClickAction
 *           - autoFetchLyrics, lyricsSource
 *           - theme (sudah ada tapi belum dipakai)
 *           - compactMode, autoScanOnStart (sudah ada)
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Song, PlayRecord } from "../lib/db";
import {
  initShufflePool,
  getNextShuffled,
  resetShufflePool,
  getUpNextPreview,
  getPrevQueueIndex,
  getNextQueueIndex,
} from "../lib/shuffleEngine";

// ── Player Store ──────────────────────────────────────────────────────────────
interface PlayerState {
  currentSong:  Song | null;
  isPlaying:    boolean;
  progress:     number;
  currentTime:  number;
  duration:     number;
  volume:       number;
  shuffle:      boolean;
  repeat:       "off" | "one" | "all";
  queue:        Song[];
  queueIndex:   number;
  history:      PlayRecord[];

  setCurrentSong:  (song: Song | null) => void;
  setIsPlaying:    (v: boolean) => void;
  setProgress:     (v: number) => void;
  setCurrentTime:  (v: number) => void;
  setDuration:     (v: number) => void;
  setVolume:       (v: number) => void;
  toggleShuffle:   () => void;
  cycleRepeat:     () => void;
  setQueue:        (songs: Song[], startIndex?: number) => void;
  addToQueue:      (song: Song) => void;
  removeFromQueue: (songId: number) => void;
  clearQueue:      () => void;

  nextTrack: () => Song | null;
  prevTrack: () => Song | null;

  getUpNext: (count?: number) => Song[];

  addToHistory: (songId: number) => void;
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      currentSong: null,
      isPlaying:   false,
      progress:    0,
      currentTime: 0,
      duration:    0,
      volume:      80,
      shuffle:     false,
      repeat:      "off",
      queue:       [],
      queueIndex:  0,
      history:     [],

      setCurrentSong: (song) => set({ currentSong: song }),
      setIsPlaying:   (v)    => set({ isPlaying: v }),
      setProgress:    (v)    => set({ progress: v }),
      setCurrentTime: (v)    => set({ currentTime: v }),
      setDuration:    (v)    => set({ duration: v }),
      setVolume:      (v)    => set({ volume: v }),

      toggleShuffle: () => {
        const { shuffle, queue, currentSong, queueIndex } = get();
        const newShuffle = !shuffle;
        if (newShuffle) {
          initShufflePool(queue, currentSong?.id);
        } else {
          resetShufflePool();
        }
        set({ shuffle: newShuffle });
      },

      cycleRepeat: () => set((s) => ({
        repeat: s.repeat === "off" ? "all" : s.repeat === "all" ? "one" : "off",
      })),

      setQueue: (songs, startIndex = 0) => {
        const list = Array.isArray(songs) ? songs : [];
        const idx  = Math.max(0, Math.min(startIndex, list.length - 1));
        const currentSong = list[idx] ?? null;

        const { shuffle } = get();
        if (shuffle && currentSong) {
          initShufflePool(list, currentSong.id);
        }

        set({ queue: list, queueIndex: idx, currentSong });
      },

      addToQueue: (song) => set((s) => {
        if (s.queue.some((q) => q.id === song.id)) return s;
        return { queue: [...s.queue, song] };
      }),

      removeFromQueue: (songId) => set((s) => {
        const removedIdx = s.queue.findIndex((q) => q.id === songId);
        if (removedIdx < 0) return s;
        const newQueue = s.queue.filter((q) => q.id !== songId);
        let newIdx = s.queueIndex;
        if (removedIdx < s.queueIndex)      newIdx = Math.max(0, s.queueIndex - 1);
        else if (removedIdx === s.queueIndex) newIdx = Math.min(newIdx, newQueue.length - 1);
        return { queue: newQueue, queueIndex: Math.max(0, newIdx) };
      }),

      clearQueue: () => set((s) => {
        resetShufflePool();
        if (s.currentSong) return { queue: [s.currentSong], queueIndex: 0 };
        return { queue: [], queueIndex: 0 };
      }),

      nextTrack: () => {
        const { queue, queueIndex, repeat, shuffle, currentSong } = get();
        if (queue.length === 0) return null;

        if (repeat === "one") return currentSong;

        if (shuffle) {
          const next = getNextShuffled(currentSong?.id, repeat === "all");
          if (!next) return null;
          const idx = queue.findIndex((s) => s.id === next.id);
          set({ currentSong: next, queueIndex: idx >= 0 ? idx : queueIndex });
          return next;
        }

        const nextIdx = getNextQueueIndex(queue, queueIndex, repeat);
        if (nextIdx === null) return null;
        set({ queueIndex: nextIdx, currentSong: queue[nextIdx] });
        return queue[nextIdx];
      },

      prevTrack: () => {
        const { queue, queueIndex } = get();
        if (queue.length === 0) return null;
        const prevIdx = getPrevQueueIndex(queue, queueIndex);
        set({ queueIndex: prevIdx, currentSong: queue[prevIdx] });
        return queue[prevIdx];
      },

      getUpNext: (count = 5) => {
        const { queue, queueIndex, shuffle, repeat } = get();
        return getUpNextPreview(queue, queueIndex, shuffle, repeat, count);
      },

      addToHistory: (songId) => {
        const record: PlayRecord = {
          song_id:   songId,
          played_at: new Date().toISOString(),
        };
        set((s) => ({ history: [record, ...s.history].slice(0, 500) }));
      },
    }),
    {
      name: "resonance-player",
      partialize: (s) => ({
        volume:  s.volume,
        shuffle: s.shuffle,
        repeat:  s.repeat,
      }),
    }
  )
);

// ── Library Store ─────────────────────────────────────────────────────────────
interface LibraryState {
  songs:        Song[];
  playlists:    { id: number; name: string; count: number; created_at: string }[];
  isLoading:    boolean;
  scanProgress: {
    total:         number;
    current:       number;
    currentFile:   string;
    currentFolder?: string;
    done:          boolean;
    phase?:        "scanning" | "indexing" | "completed";
  } | null;

  setSongs:          (songs: Song[] | ((prev: Song[]) => Song[])) => void;
  updateSongRating:  (songId: number, stars: number) => void;
  setPlaylists:      (p: LibraryState["playlists"]) => void;
  setLoading:        (v: boolean) => void;
  setScanProgress:   (p: LibraryState["scanProgress"]) => void;
  addSongs:          (songs: Song[]) => void;
}

export const useLibraryStore = create<LibraryState>()((set) => ({
  songs:        [],
  playlists:    [],
  isLoading:    false,
  scanProgress: null,

  setSongs: (songs) => set((s) => ({
    songs: typeof songs === "function"
      ? (() => {
          const r = (songs as (p: Song[]) => Song[])(s.songs);
          return Array.isArray(r) ? r : s.songs;
        })()
      : (Array.isArray(songs) ? songs : s.songs),
  })),

  updateSongRating: (songId, stars) => set((s) => ({
    songs: s.songs.map((song) => song.id === songId ? { ...song, stars } : song),
  })),

  setPlaylists:    (p) => set({ playlists: Array.isArray(p) ? p : [] }),
  setLoading:      (v) => set({ isLoading: v }),
  setScanProgress: (p) => set({ scanProgress: p }),

  addSongs: (newSongs) => set((s) => {
    const map = new Map(s.songs.map((s) => [s.path, s]));
    newSongs.forEach((ns) => map.set(ns.path, { ...map.get(ns.path), ...ns }));
    return { songs: Array.from(map.values()) };
  }),
}));

// ── Settings Store ────────────────────────────────────────────────────────────
interface SettingsState {
  theme:              "dark" | "darker" | "amoled";
  accentColor:        string;
  eqGains:            number[];
  eqPreset:           string;
  visualizerType:     "bar" | "wave" | "circle";
  showLyrics:         boolean;
  sleepTimer:         number | null;
  watchFolders:       string[];
  crossfadeSec:       number;
  replayGainEnabled:  boolean;

  // [#8] Settings yang benar-benar ngaruh
  defaultVolume:      number;
  gaplessEnabled:     boolean;
  autoScanOnStart:    boolean;
  compactMode:        boolean;

  // [#8] New settings
  animationSpeed:     "normal" | "slow" | "off";
  doubleClickAction:  "play" | "queue";

  // [#13] Lyrics settings
  autoFetchLyrics:    boolean;
  lyricsSource:       "lrclib" | "lyrics_ovh";

  setTheme:             (t: SettingsState["theme"]) => void;
  setAccentColor:       (c: string) => void;
  setEqGains:           (g: number[]) => void;
  setEqPreset:          (p: string) => void;
  setVisualizerType:    (t: SettingsState["visualizerType"]) => void;
  toggleLyrics:         () => void;
  setSleepTimer:        (min: number | null) => void;
  addWatchFolder:       (path: string) => void;
  removeWatchFolder:    (path: string) => void;
  setCrossfadeSec:      (sec: number) => void;
  setReplayGainEnabled: (v: boolean) => void;
  setDefaultVolume:     (v: number) => void;
  setGaplessEnabled:    (v: boolean) => void;
  setAutoScanOnStart:   (v: boolean) => void;
  setCompactMode:       (v: boolean) => void;
  setAnimationSpeed:    (v: SettingsState["animationSpeed"]) => void;
  setDoubleClickAction: (v: SettingsState["doubleClickAction"]) => void;
  setAutoFetchLyrics:   (v: boolean) => void;
  setLyricsSource:      (v: SettingsState["lyricsSource"]) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme:             "dark",
      accentColor:       "#7C3AED",
      eqGains:           new Array(10).fill(0),
      eqPreset:          "Flat",
      visualizerType:    "bar",
      showLyrics:        true,
      sleepTimer:        null,
      watchFolders:      [],
      crossfadeSec:      0,
      replayGainEnabled: true,
      defaultVolume:     80,
      gaplessEnabled:    true,
      autoScanOnStart:   false,
      compactMode:       false,
      animationSpeed:    "normal",
      doubleClickAction: "play",
      autoFetchLyrics:   true,
      lyricsSource:      "lrclib",

      setTheme:             (t) => set({ theme: t }),
      setAccentColor:       (c) => set({ accentColor: c }),
      setEqGains:           (g) => set({ eqGains: g }),
      setEqPreset:          (p) => set({ eqPreset: p }),
      setVisualizerType:    (t) => set({ visualizerType: t }),
      toggleLyrics:         ()  => set((s) => ({ showLyrics: !s.showLyrics })),
      setSleepTimer:        (m) => set({ sleepTimer: m }),
      setCrossfadeSec:      (s) => set({ crossfadeSec: Math.max(0, Math.min(10, s)) }),
      setReplayGainEnabled: (v) => set({ replayGainEnabled: v }),
      setDefaultVolume:     (v) => set({ defaultVolume: Math.max(0, Math.min(100, v)) }),
      setGaplessEnabled:    (v) => set({ gaplessEnabled: v }),
      setAutoScanOnStart:   (v) => set({ autoScanOnStart: v }),
      setCompactMode:       (v) => set({ compactMode: v }),
      setAnimationSpeed:    (v) => set({ animationSpeed: v }),
      setDoubleClickAction: (v) => set({ doubleClickAction: v }),
      setAutoFetchLyrics:   (v) => set({ autoFetchLyrics: v }),
      setLyricsSource:      (v) => set({ lyricsSource: v }),

      addWatchFolder: (path) => set((s) => ({
        watchFolders: s.watchFolders.includes(path)
          ? s.watchFolders
          : [...s.watchFolders, path],
      })),

      removeWatchFolder: (path) => set((s) => ({
        watchFolders: s.watchFolders.filter((f) => f !== path),
      })),
    }),
    { name: "resonance-settings" }
  )
);