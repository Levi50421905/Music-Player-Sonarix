/**
 * App.tsx — v10 (Settings Init + Global i18n + FolderWatch)
 * ==========================================================
 * LETAKKAN FILE INI DI: src/App.tsx (GANTIKAN App.tsx yang ada)
 *
 * PERUBAHAN vs v9:
 *   [NEW] useSettingsInit() — apply semua settings ke DOM saat startup
 *         (tema, warna aksen, font size, dll langsung aktif tanpa buka Settings)
 *   [NEW] useFolderWatch()  — auto-watch folder yang tersimpan di settings
 *   [FIX] useLang() dipanggil di App sehingga label tab nav berubah sesuai bahasa
 *   [FIX] Tab labels sekarang mengikuti bahasa aktif (Indonesia/English)
 *
 * TIDAK ADA PERUBAHAN LAIN — semua logic yang sudah ada tetap sama persis.
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { audioEngine, enqueueBgDecode } from "./lib/audioEngine";
import type { PreloadState } from "./lib/audioEngine";
import {
  getDb, getAllSongs, setRating, recordPlay, getPlaylists, getSetting,
} from "./lib/db";
import { scanFolder, addFiles } from "./lib/scanner";
import { usePlayerStore, useLibraryStore, useSettingsStore } from "./store";
import { useMiniPlayer, useMiniPlayerCommands } from "./components/Player/useMiniPlayer";
import { useKeyboardShortcuts } from "./components/Player/useKeyboardShortcuts";
import { useTrackNotification, requestNotificationPermission } from "./components/Notification/useTrackNotification";
import type { Song } from "./lib/db";

// ── [NEW] Import 3 hal baru ──────────────────────────────────────────────────
import { useSettingsInit } from "./hooks/useSettingsInit";   // ← [NEW]
import { useFolderWatch } from "./lib/useFolderWatch";        // ← [NEW] sudah ada, tinggal import
import { useLang } from "./lib/i18n";                         // ← [NEW] untuk label tab

import Onboarding from "./components/Onboarding/Onboarding";
import Sidebar from "./components/Sidebar";
import LibraryView from "./components/Library/LibraryView";
import QueueView from "./components/Playlist/QueueView";
import EqualizerView from "./components/Equalizer/EqualizerView";
import PlaylistsView from "./components/Playlist/PlaylistsView";
import SmartPlaylistView from "./components/Smart/SmartPlaylistView";
import { AlbumView, ArtistView } from "./components/Album/AlbumView";
import Dashboard from "./components/Dashboard/Dashboard";
import PlayerBarV2 from "./components/Player/PlayerBarV2";
import ScanProgress, { EmptyLibraryState } from "./components/Library/ScanProgress";
import SettingsPanel from "./components/Settings/SettingsPanel";
import FolderView from "./components/Library/FolderView";
import SleepTimerButton, { useSleepTimer } from "./components/Player/SleepTimer";
import KeyboardCheatsheet from "./components/KeyboardCheatsheet";
import ToastContainer, { toastSuccess, toastError, toastInfo } from "./components/Notification/ToastSystem";

export type ActiveTab =
  | "home" | "library" | "albums" | "artists"
  | "smart" | "queue" | "equalizer" | "playlists" | "folders";

// ── SVG Icons (tidak berubah dari v9) ────────────────────────────────────────

const Icons = {
  home: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 6.5L8 2l6 4.5V14a1 1 0 01-1 1H3a1 1 0 01-1-1V6.5z"/>
      <path d="M6 15V9h4v6"/>
    </svg>
  ),
  library: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 14A6 6 0 108 2a6 6 0 000 12z"/>
      <circle cx="8" cy="8" r="2"/>
      <path d="M8 2v2M8 12v2M2 8h2M12 8h2"/>
    </svg>
  ),
  albums: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="10" height="10" rx="1.5"/>
      <rect x="4" y="1" width="10" height="10" rx="1.5"/>
      <circle cx="6" cy="8" r="1.5"/>
    </svg>
  ),
  artists: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="5" r="3"/>
      <path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6"/>
    </svg>
  ),
  folders: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 4.5A1.5 1.5 0 012.5 3h3l2 2h6A1.5 1.5 0 0115 6.5v6a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12V4.5z"/>
    </svg>
  ),
  smart: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 1l1.8 3.6 4 .6-2.9 2.8.7 4L8 10 4.4 12l.7-4L2.2 5.2l4-.6L8 1z"/>
    </svg>
  ),
  queue: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4h12M2 8h8M2 12h10"/>
      <circle cx="12" cy="11" r="3"/>
      <path d="M11 9.5l2 1.5-2 1.5"/>
    </svg>
  ),
  equalizer: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 2v12M4 6h-2M4 6h2M8 2v12M8 10h-2M8 10h2M12 2v12M12 4h-2M12 4h2"/>
    </svg>
  ),
  playlists: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4h12M2 8h8M2 12h8"/>
      <path d="M11 10.5l4-2v5l-4-2v-1z"/>
    </svg>
  ),
  scan: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 4V2.5A1 1 0 012.5 1.5H4M12 1.5h1.5a1 1 0 011 1V4M14.5 12v1.5a1 1 0 01-1 1H12M4 14.5H2.5a1 1 0 01-1-1V12"/>
      <circle cx="8" cy="8" r="3"/>
    </svg>
  ),
  plus: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M8 3v10M3 8h10"/>
    </svg>
  ),
  mini: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="12" height="8" rx="1.5"/>
      <path d="M5 9h6M7 7l2 2-2 2"/>
    </svg>
  ),
  keyboard: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3.5" width="14" height="9" rx="1.5"/>
      <path d="M4 7h1M7 7h1M10 7h1M4 10h8M13 7h.01"/>
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="2.5"/>
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41"/>
    </svg>
  ),
  moon: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 10A6 6 0 016 2a7 7 0 100 12 6 6 0 008-4z"/>
    </svg>
  ),
};

export default function App() {
  // ═══════════════════════════════════════════════════════════════════════════
  // [KEY #1] SETTINGS INIT — Apply settings ke DOM saat app pertama dibuka
  // Ini yang fix masalah: tema/warna/font tidak ter-apply sampai buka Settings
  // ═══════════════════════════════════════════════════════════════════════════
  useSettingsInit();
// Resume AudioContext saat user interaction pertama (wajib untuk autoplay policy)
useEffect(() => {
  const resume = () => {
    const ctx = (audioEngine as any).ctx as AudioContext | null;
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
  };
  window.addEventListener("click", resume, { once: true });
  window.addEventListener("keydown", resume, { once: true });
  window.addEventListener("touchstart", resume, { once: true });
  return () => {
    window.removeEventListener("click", resume);
    window.removeEventListener("keydown", resume);
    window.removeEventListener("touchstart", resume);
  };
}, []);
  // ═══════════════════════════════════════════════════════════════════════════
  // [KEY #2] FOLDER WATCH — Auto-watch folder yang tersimpan di settings
  // ═══════════════════════════════════════════════════════════════════════════
  useFolderWatch();

  // ═══════════════════════════════════════════════════════════════════════════
  // [KEY #3] i18n — Baca bahasa aktif agar tab nav bisa diterjemahkan
  // ═══════════════════════════════════════════════════════════════════════════
  const { lang } = useLang();

  // ── Tab definitions — label reaktif terhadap bahasa ──────────────────────
  const PRIMARY_TABS = [
    { id: "home"    as ActiveTab, label: lang === "id" ? "Beranda"  : "Home",    icon: Icons.home },
    { id: "library" as ActiveTab, label: lang === "id" ? "Pustaka"  : "Library", icon: Icons.library },
    { id: "albums"  as ActiveTab, label: lang === "id" ? "Album"    : "Albums",  icon: Icons.albums },
    { id: "artists" as ActiveTab, label: lang === "id" ? "Artis"    : "Artists", icon: Icons.artists },
    { id: "folders" as ActiveTab, label: lang === "id" ? "Folder"   : "Folders", icon: Icons.folders },
    { id: "smart"   as ActiveTab, label: lang === "id" ? "Cerdas"   : "Smart",   icon: Icons.smart },
  ];

  const SECONDARY_TABS = [
    { id: "queue"     as ActiveTab, label: lang === "id" ? "Antrian"  : "Queue",     icon: Icons.queue },
    { id: "equalizer" as ActiveTab, label: "EQ",                                       icon: Icons.equalizer },
    { id: "playlists" as ActiveTab, label: lang === "id" ? "Playlist" : "Playlists",  icon: Icons.playlists },
  ];

  // ── State (tidak berubah dari v9) ─────────────────────────────────────────
  const [activeTab, setActiveTab]           = useState<ActiveTab>("home");
  const [tabTransition, setTabTransition]   = useState(false);
  const [showSettings, setShowSettings]     = useState(false);
  const [showCheatsheet, setShowCheatsheet] = useState(false);
  const [onboarding, setOnboarding]         = useState<boolean | null>(null);
  const [preloadState, setPreloadState]     = useState<PreloadState>(null);
  const [playbackSpeed, setPlaybackSpeed]   = useState(1);
  const [isDragOver, setIsDragOver]         = useState(false);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem("Sonarix-sidebar-collapsed") === "true"; } catch { return false; }
  });

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(v => {
      const next = !v;
      try { localStorage.setItem("Sonarix-sidebar-collapsed", String(next)); } catch {}
      return next;
    });
  }, []);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const isInitialized  = useRef(false);

  const { timer: sleepTimer, start: startSleep, clear: clearSleep, startPauseAfterSong, shouldPauseAfterSong } = useSleepTimer();

  const {
    currentSong, isPlaying, volume,
    setCurrentSong, setIsPlaying, setProgress, setCurrentTime,
    setDuration, nextTrack, prevTrack, addToHistory, setPlayContext,
    cycleShuffleMode, cycleRepeatMode,
    playNextTrack,
  } = usePlayerStore();

  const { songs, setSongs, setPlaylists, setLoading, setScanProgress } = useLibraryStore();
  const { eqGains, accentColor, toggleLyrics, crossfadeSec = 0, replayGainEnabled } = useSettingsStore() as any;
  const { openMini, closeMini, isMiniOpen } = useMiniPlayer();

  useTrackNotification();

  // Sync accent color ke CSS variable saat berubah
  useEffect(() => {
    if (accentColor) document.documentElement.style.setProperty("--accent", accentColor);
  }, [accentColor]);

  useEffect(() => {
    const el  = (audioEngine as any).elA as HTMLAudioElement | null;
    const elB = (audioEngine as any).elB as HTMLAudioElement | null;
    if (el) el.playbackRate = playbackSpeed;
    if (elB) elB.playbackRate = playbackSpeed;
  }, [playbackSpeed]);

  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden) (audioEngine as any).ctx?.resume().catch(() => {});
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const db   = await getDb();
        const done = await getSetting(db, "onboarded");
        setOnboarding(done !== "true");
      } catch {
        setOnboarding(false);
      }
    })();
    requestNotificationPermission();
  }, []);

  useEffect(() => {
    if (isInitialized.current || onboarding === null || onboarding === true) return;
    isInitialized.current = true;

    (async () => {
      setLoading(true);
      try {
        const db = await getDb();
        const [allSongs, allPlaylists] = await Promise.all([getAllSongs(db), getPlaylists(db)]);
        const safeSongs = Array.isArray(allSongs) ? allSongs : [];
        setSongs(safeSongs);
        setPlaylists(Array.isArray(allPlaylists) ? allPlaylists : []);
        if ("requestIdleCallback" in window) {
          (window as any).requestIdleCallback(() => {
            safeSongs
              .filter(s => ["flac","ape","wma","alac"].includes((s.format ?? "").toLowerCase()))
              .sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0))
              .slice(0, 5)
              .forEach(s => enqueueBgDecode(s.path));
          }, { timeout: 5000 });
        }
      } finally {
        usePlayerStore.getState()._rebuildUnified();
        setLoading(false);
      }
    })();
  }, [onboarding]);

  useEffect(() => { audioEngine.setVolume(volume); }, [volume]);
  useEffect(() => { if (eqGains) audioEngine.setEqPreset(eqGains); }, [eqGains]);
  useEffect(() => { audioEngine.setCrossfade(crossfadeSec); }, [crossfadeSec]);
  useEffect(() => { audioEngine.setReplayGainEnabled(replayGainEnabled !== false); }, [replayGainEnabled]);

  const handleNextRef = useRef<() => void>(() => {});
  const playStartTimeRef = useRef<number>(0);
  const playDurationRef = useRef<number>(0);
  const playCountedRef = useRef<boolean>(false);
  // [FIX] Debounce error handling — cegah handleNext() dipanggil berkali-kali
  const lastErrorTimeRef = useRef<number>(0);
  const errorSkipCountRef = useRef<number>(0);

  useEffect(() => {
    audioEngine.onTimeUpdate(t => {
      setCurrentTime(t);
      if (audioEngine.duration > 0) {
        setProgress((t / audioEngine.duration) * 100);
        if (!playCountedRef.current && audioEngine.duration > 0) {
          const { playCountThreshold } = useSettingsStore.getState() as any;
          const threshold = (playCountThreshold ?? 70) / 100;
          if (t / audioEngine.duration >= threshold) {
            const { currentSong: cs } = usePlayerStore.getState();
            if (cs) maybeRecordPlay(cs);
          }
        }
      }
    });
    audioEngine.onLoadedMetadata(d => setDuration(d));
    audioEngine.onEnded(() => handleNextRef.current());
    audioEngine.onPreloadStateChange(s => setPreloadState(s));
    audioEngine.onError((path, message) => {
      // [FIX] Debounce: abaikan error yang terjadi dalam 3 detik dari error sebelumnya
      const now = Date.now();
      if (now - lastErrorTimeRef.current < 3000) {
        console.warn("[App] onError diabaikan (debounce):", path);
        return;
      }
      lastErrorTimeRef.current = now;

      const fileName = path.replace(/\\/g, "/").split("/").pop() ?? path;
      toastError(`Gagal memutar: ${fileName}`);

      // [FIX] Hanya auto-skip jika error berturut-turut tidak terlalu banyak
      // (cegah infinite skip loop jika semua lagu gagal)
      errorSkipCountRef.current += 1;
      if (errorSkipCountRef.current > 5) {
        console.error("[App] Terlalu banyak error berturut-turut, hentikan auto-skip");
        errorSkipCountRef.current = 0;
        return;
      }

      // Auto-skip ke lagu berikutnya setelah delay
      setTimeout(() => { handleNextRef.current(); }, 2000);
    });
  }, []);

  useEffect(() => {
    audioEngine.setNextPathProvider(() => {
      const state = usePlayerStore.getState();
      const { playContext, contextIndex, shuffleMode, repeatMode, _shufflePool, manualQueue } = state;
      if (manualQueue.length > 0) return manualQueue[0]?.path ?? null;
      if (repeatMode === "repeat_one") return playContext[contextIndex]?.path ?? null;
      if (shuffleMode !== "off") {
        const pool = _shufflePool as number[];
        return pool.length > 0 ? (playContext[pool[0]]?.path ?? null) : null;
      }
      const nextIdx = contextIndex + 1;
      if (nextIdx < playContext.length) return playContext[nextIdx]?.path ?? null;
      if (repeatMode === "repeat_all" || repeatMode === "repeat_category") return playContext[0]?.path ?? null;
      return null;
    });
  }, []);

  const switchTab = useCallback((tab: ActiveTab) => {
    if (tab === activeTab) return;
    setTabTransition(true);
    setTimeout(() => {
      setActiveTab(tab);
      setTabTransition(false);
    }, 80);
  }, [activeTab]);

  const playSong = useCallback(async (song: Song) => {
    setCurrentSong(song);
    setIsPlaying(true);
    playStartTimeRef.current = Date.now();
    playDurationRef.current = 0;
    playCountedRef.current = false;
    try {
      await audioEngine.play(song.path);
      const el = (audioEngine as any).elA as HTMLAudioElement | null;
      if (el) el.playbackRate = playbackSpeed;
      addToHistory(song.id);
      setTimeout(() => { playDurationRef.current = audioEngine.duration; }, 500);
    } catch {
      setIsPlaying(false);
      toastError("Failed to play track");
    }
  }, [playbackSpeed]);

  const maybeRecordPlay = useCallback(async (song: Song) => {
    if (playCountedRef.current) return;
    const { playCountThreshold } = useSettingsStore.getState() as any;
    const threshold = (playCountThreshold ?? 70) / 100;
    const elapsed = (Date.now() - playStartTimeRef.current) / 1000;
    const duration = playDurationRef.current > 0 ? playDurationRef.current : audioEngine.duration;
    if (duration <= 0) return;
    const progress = elapsed / duration;
    if (progress >= threshold) {
      playCountedRef.current = true;
      try {
        const db = await getDb();
        await recordPlay(db, song.id);
        setSongs((prev: any) =>
          Array.isArray(prev)
            ? prev.map((s: Song) => s.id === song.id ? { ...s, play_count: (s.play_count || 0) + 1 } : s)
            : prev
        );
        const { currentSong: cs, setCurrentSong: scs } = usePlayerStore.getState();
        if (cs && cs.id === song.id) {
          const { songs: latestSongs } = useLibraryStore.getState();
          const updated = latestSongs.find((s: Song) => s.id === song.id);
          scs({ ...cs, play_count: updated?.play_count ?? (cs.play_count || 0) + 1 });
        }
      } catch {}
    }
  }, [setSongs]);

  const playList = useCallback((list: Song[], index = 0, contextName = "") => {
    if (!Array.isArray(list) || list.length === 0) return;
    const safeIndex = Math.max(0, Math.min(index, list.length - 1));
    setPlayContext(list, safeIndex, contextName);
    playSong(list[safeIndex]);
    const nextSong = list[safeIndex + 1];
    if (nextSong?.path) audioEngine.preloadNext(nextSong.path).catch(() => {});
    if ("requestIdleCallback" in window) {
      (window as any).requestIdleCallback(() => {
        list.slice(safeIndex + 2, safeIndex + 5).forEach(s => enqueueBgDecode(s.path));
      }, { timeout: 3000 });
    }
  }, [playSong]);

  const handleNext = useCallback(() => {
    if (currentSong) maybeRecordPlay(currentSong);
    if (shouldPauseAfterSong()) {
      audioEngine.pause();
      setIsPlaying(false);
      toastInfo("Sleep timer: music paused after song");
      return;
    }
    const result = nextTrack();
    if (result) playSong(result.song);
    else { setIsPlaying(false); audioEngine.stop(); }
  }, [nextTrack, playSong, shouldPauseAfterSong, currentSong, maybeRecordPlay]);

  handleNextRef.current = handleNext;

  const handlePrev = useCallback(() => {
    if (audioEngine.currentTime > 3) audioEngine.seek(0);
    else {
      const prev = prevTrack();
      if (prev) playSong(prev);
    }
  }, [prevTrack, playSong]);

  const handlePlayPause = useCallback(async () => {
    if (!currentSong) return;
    if (isPlaying) { audioEngine.pause(); setIsPlaying(false); }
    else {
      if (!audioEngine.duration) await playSong(currentSong);
      else { audioEngine.resume(); setIsPlaying(true); }
    }
  }, [isPlaying, currentSong, playSong]);

  const handleRating = useCallback(async (songId: number, stars: number) => {
    setSongs((prev: any) =>
      Array.isArray(prev) ? prev.map((s: Song) => s.id === songId ? { ...s, stars } : s) : prev
    );
    const { currentSong: cs, setCurrentSong: scs } = usePlayerStore.getState();
    if (cs && cs.id === songId) scs({ ...cs, stars });
    const db = await getDb();
    await setRating(db, songId, stars);
    toastSuccess(stars === 0 ? "Rating cleared" : `${stars} star rating saved`);
  }, [setSongs]);

  const handleScanFolder = useCallback(async () => {
    toastInfo("Starting folder scan…");
    try {
      const result = await scanFolder(p => {
        setScanProgress({ ...p, phase: p.done ? "completed" : "scanning" });
      });
      const db = await getDb();
      const updated = await getAllSongs(db);
      setSongs(Array.isArray(updated) ? updated : []);
      setScanProgress(null);
      const parts = [`${result.songs.length} tracks added/updated`];
      if (result.skippedCount > 0) parts.push(`${result.skippedCount} unchanged`);
      if (result.failedFiles.length > 0) parts.push(`${result.failedFiles.length} failed`);
      toastSuccess(parts.join(" · "));
    } catch {
      toastError("Scan failed");
      setScanProgress(null);
    }
  }, []);

  const handleAddFiles = useCallback(async () => {
    try {
      const added = await addFiles(p => {
        setScanProgress({ ...p, phase: p.done ? "completed" : "indexing" });
      });
      const db = await getDb();
      const updated = await getAllSongs(db);
      setSongs(Array.isArray(updated) ? updated : []);
      setScanProgress(null);
      if (added.length > 0) toastSuccess(`${added.length} file(s) added`);
      else toastInfo("No new files added");
    } catch {
      toastError("Failed to add files");
      setScanProgress(null);
    }
  }, []);

  useEffect(() => {
    if (!(window as any).__TAURI_INTERNALS__) return;
    let unlisten: (() => void) | null = null;
    (async () => {
      try {
        const { listen: tauriListen } = await import("@tauri-apps/api/event");
        unlisten = await tauriListen("tauri://file-drop", async (event: any) => {
          setIsDragOver(false);
          const paths: string[] = event.payload?.paths ?? event.payload ?? [];
          if (!paths.length) return;
          toastInfo(`Adding ${paths.length} file(s)…`);
          try {
            const db = await getDb();
            const updated2 = await getAllSongs(db);
            setSongs(Array.isArray(updated2) ? updated2 : []);
            toastInfo("Library refreshed");
          } catch {
            toastError("Failed to add dropped files");
          }
        });
        await tauriListen("tauri://file-drop-hover", () => setIsDragOver(true));
        await tauriListen("tauri://file-drop-cancelled", () => setIsDragOver(false));
      } catch {}
    })();
    return () => { unlisten?.(); };
  }, []);

  const handleOnboardingComplete = useCallback((newSongs: Song[]) => {
    setSongs(Array.isArray(newSongs) ? newSongs : []);
    setOnboarding(false);
    isInitialized.current = true;
  }, []);

  useMiniPlayerCommands({ onPlayPause: handlePlayPause, onNext: handleNext, onPrev: handlePrev });

  useEffect(() => {
    const uns: (() => void)[] = [];
    if (!(window as any).__TAURI_INTERNALS__) return;
    (async () => {
      uns.push(await listen("media:playpause", handlePlayPause));
      uns.push(await listen("media:next", handleNext));
      uns.push(await listen("media:prev", handlePrev));
    })();
    return () => uns.forEach(f => f());
  }, [handlePlayPause, handleNext, handlePrev]);

  useKeyboardShortcuts({
    onPlayPause: handlePlayPause,
    onNext: handleNext,
    onPrev: handlePrev,
    onToggleShuffle: () => {
      cycleShuffleMode();
      const { shuffleMode: ns } = usePlayerStore.getState();
      const labels: Record<string, string> = {
        off: "Shuffle off", all: "Shuffle on",
        songs: "Shuffle songs", songs_and_categories: "Shuffle all",
      };
      toastInfo(labels[ns] ?? "Shuffle");
    },
    onCycleRepeat: cycleRepeatMode,
    onToggleMini: () => isMiniOpen() ? closeMini() : openMini(),
    onToggleLyrics: toggleLyrics,
    onOpenSettings: () => setShowSettings(s => !s),
    onFocusSearch: () => {
      switchTab("library");
      setTimeout(() => searchInputRef.current?.focus(), 50);
    },
    onToggleCheatsheet: () => setShowCheatsheet(s => !s),
  });

  // ── Loading screen ──────────────────────────────────────────────────────────
  if (onboarding === null) return (
    <div style={{
      height: "100vh", background: "#070718",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 16,
    }}>
      <div style={{
        width: 44, height: 44,
        background: "linear-gradient(135deg, #7C3AED, #EC4899)",
        borderRadius: 12, display: "flex", alignItems: "center",
        justifyContent: "center", fontSize: 22,
      }}>♪</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 18, height: 18, borderRadius: "50%",
          border: "2px solid #7C3AED", borderTopColor: "transparent",
          animation: "spin 0.8s linear infinite",
        }} />
        <span style={{ fontSize: 13, color: "#7a7a96" }}>Loading Sonarix…</span>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );

  if (onboarding) return <Onboarding onComplete={handleOnboardingComplete} />;

  return (
    <div className="app-root">
      {/* Drag & drop overlay */}
      {isDragOver && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9998,
          background: "rgba(124,58,237,0.12)",
          border: "2px dashed rgba(124,58,237,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexDirection: "column", gap: 12, pointerEvents: "none",
        }}>
          <div style={{ fontSize: 40, opacity: 0.7 }}>♫</div>
          <p style={{ fontSize: 15, fontWeight: 600, color: "#a78bfa" }}>Drop to add to library</p>
          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>MP3, FLAC, WAV, OGG and more</p>
        </div>
      )}

      <ScanProgress />
      <ToastContainer />
      <KeyboardCheatsheet open={showCheatsheet} onClose={() => setShowCheatsheet(false)} />
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}

      <div className="layout">
        <Sidebar
          onPlayPause={handlePlayPause}
          onRating={handleRating}
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebar}
        />

        <div className="content">
          {/* ── Tab Navigation ── */}
          <nav className="tab-nav">
            {/* Logo */}
            <div className="logo">
              <div className="logo-icon">♪</div>
              <span className="logo-text">Sonarix</span>
            </div>

            {/* Primary tabs */}
            <div className="tabs">
              {PRIMARY_TABS.map(tab => (
                <button
                  key={tab.id}
                  className={`tab-btn ${activeTab === tab.id ? "active" : ""}`}
                  onClick={() => switchTab(tab.id)}
                  title={tab.label}
                >
                  {tab.icon}
                  <span className="tab-label">{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Toolbar right */}
            <div className="toolbar">
              {/* Secondary tabs */}
              <div className="secondary-tabs">
                {SECONDARY_TABS.map(tab => (
                  <button
                    key={tab.id}
                    className={`secondary-tab-btn ${activeTab === tab.id ? "active" : ""}`}
                    onClick={() => switchTab(tab.id)}
                    title={tab.label}
                  >
                    {tab.icon}
                    <span className="secondary-tab-label">{tab.label}</span>
                  </button>
                ))}
              </div>

              <div className="nav-divider" />

              <SleepTimerButton
                timer={sleepTimer}
                onStart={startSleep}
                onClear={clearSleep}
                onPauseAfterSong={startPauseAfterSong}
              />

              <button className="icon-btn" onClick={handleScanFolder} title="Scan folder">
                {Icons.scan}
              </button>
              <button className="icon-btn" onClick={handleAddFiles} title="Add files">
                {Icons.plus}
              </button>
              <button className="icon-btn" onClick={() => isMiniOpen() ? closeMini() : openMini()} title="Mini player (Ctrl+M)">
                {Icons.mini}
              </button>
              <button className="icon-btn" onClick={() => setShowCheatsheet(s => !s)} title="Keyboard shortcuts">
                {Icons.keyboard}
              </button>
              <button className="icon-btn" onClick={() => setShowSettings(true)} title="Settings (Ctrl+,)">
                {Icons.settings}
              </button>
            </div>
          </nav>

          {/* Tab content */}
          <div
            className="tab-content"
            style={{ opacity: tabTransition ? 0 : 1, transition: "opacity 0.08s ease" }}
          >
            {activeTab === "home" && (
              <Dashboard onPlay={playList} onRating={handleRating} onScanFolder={handleScanFolder} />
            )}

            {activeTab === "library" && (
              songs.length === 0 ? (
                <EmptyLibraryState onScanFolder={handleScanFolder} onAddFiles={handleAddFiles} />
              ) : (
                <LibraryView
                  onPlay={(song, contextList) => {
                    if (contextList && contextList.length > 0) {
                      const idx = contextList.findIndex(s => s.id === song.id);
                      playList(contextList, idx >= 0 ? idx : 0, "Library");
                    } else {
                      playList([song], 0);
                    }
                  }}
                  onRating={handleRating}
                  searchRef={searchInputRef}
                  onPlayNext={(song) => {
                    playNextTrack(song);
                    toastInfo(`"${song.title}" will play next`);
                  }}
                />
              )
            )}

            {activeTab === "albums"  && <AlbumView onPlay={(list, idx) => playList(list, idx ?? 0, "Album")} />}
            {activeTab === "artists" && <ArtistView onPlay={(list, idx) => playList(list, idx ?? 0, "Artist")} />}
            {activeTab === "folders" && <FolderView onPlay={(list, idx, folderName) => playList(list, idx ?? 0, folderName ?? "Folder")} />}
            {activeTab === "smart"   && <SmartPlaylistView onPlay={(list, idx) => playList(list, idx ?? 0, "Smart")} />}
            {activeTab === "queue"   && <QueueView onPlay={song => playSong(song)} onPlayFromQueue={(list, idx, name) => playList(list, idx, name)} />}
            {activeTab === "equalizer" && <EqualizerView />}
            {activeTab === "playlists" && (
              <PlaylistsView
                onPlay={song => playSong(song)}
                onPlayAll={songs => playList(songs, 0, "Playlist")}
              />
            )}
          </div>
        </div>
      </div>

      <PlayerBarV2
        onPlayPause={handlePlayPause}
        onNext={handleNext}
        onPrev={handlePrev}
        onRating={handleRating}
        preloadState={preloadState}
        playbackSpeed={playbackSpeed}
        onSpeedChange={setPlaybackSpeed}
      />
    </div>
  );
}