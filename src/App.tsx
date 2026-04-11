/**
 * App.tsx — v6
 *
 * FIX vs v5:
 *   [1] Sleep timer state di-lift ke App.tsx → SleepTimerButton menerima props
 *       sehingga timer benar-benar berfungsi (tidak terisolasi di komponen)
 *   [2] PlaylistsView mendapat prop onPlayAll → play playlist set queue benar
 *   [3] Tab nav: label disembunyikan saat window kecil via min-width check
 *   [4] Home Dashboard: onPlay(songs, index) berfungsi benar
 *   [5] shouldPauseAfterSong dicek di handleNext
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
import { initShufflePool } from "./lib/shuffleEngine";
import { useMiniPlayer, useMiniPlayerCommands } from "./components/Player/useMiniPlayer";
import { useKeyboardShortcuts } from "./components/Player/useKeyboardShortcuts";
import { useTrackNotification, requestNotificationPermission } from "./components/Notification/useTrackNotification";
import { peekUpNextShuffled } from "./lib/shuffleEngine";
import type { Song } from "./lib/db";

import Onboarding        from "./components/Onboarding/Onboarding";
import Sidebar           from "./components/Sidebar";
import LibraryView       from "./components/Library/LibraryView";
import QueueView         from "./components/Playlist/QueueView";
import EqualizerView     from "./components/Equalizer/EqualizerView";
import PlaylistsView     from "./components/Playlist/PlaylistsView";
import SmartPlaylistView from "./components/Smart/SmartPlaylistView";
import { AlbumView, ArtistView } from "./components/Album/AlbumView";
import Dashboard         from "./components/Dashboard/Dashboard";
import PlayerBarV2       from "./components/Player/PlayerBarV2";
import ScanProgress, { EmptyLibraryState } from "./components/Library/ScanProgress";
import SettingsPanel     from "./components/Settings/SettingsPanel";
// FIX: import SleepTimerButton sebagai UI + useSleepTimer sebagai hook
import SleepTimerButton, { useSleepTimer } from "./components/Player/SleepTimer";
import KeyboardCheatsheet from "./components/KeyboardCheatsheet";

import ToastContainer, { toastSuccess, toastError, toastInfo } from "./components/Notification/ToastSystem";

export type ActiveTab =
  | "home" | "library" | "albums" | "artists"
  | "smart" | "queue" | "equalizer" | "playlists";

const TABS: { id: ActiveTab; label: string; icon: string }[] = [
  { id: "home",      label: "Home",     icon: "🏠" },
  { id: "library",   label: "Library",  icon: "🎵" },
  { id: "albums",    label: "Albums",   icon: "💿" },
  { id: "artists",   label: "Artists",  icon: "🎤" },
  { id: "smart",     label: "Smart",    icon: "✨" },
  { id: "queue",     label: "Queue",    icon: "📋" },
  { id: "equalizer", label: "EQ",       icon: "🎚️" },
  { id: "playlists", label: "Playlist", icon: "📂" },
];

export default function App() {
  const [activeTab, setActiveTab]           = useState<ActiveTab>("home");
  const [showSettings, setShowSettings]     = useState(false);
  const [showCheatsheet, setShowCheatsheet] = useState(false);
  const [onboarding, setOnboarding]         = useState<boolean | null>(null);
  const [preloadState, setPreloadState]     = useState<PreloadState>(null);
  const [playbackSpeed, setPlaybackSpeed]   = useState(1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isInitialized  = useRef(false);

  // FIX: lift sleep timer state ke App level
  const { timer: sleepTimer, start: startSleep, clear: clearSleep, startPauseAfterSong, shouldPauseAfterSong } = useSleepTimer();

  const {
    currentSong, isPlaying, volume,
    setCurrentSong, setIsPlaying, setProgress, setCurrentTime,
    setDuration, nextTrack, prevTrack, addToHistory, setQueue,
    toggleShuffle, cycleRepeat, shuffle, queue, queueIndex,
  } = usePlayerStore();

  const { songs, setSongs, setPlaylists, setLoading, setScanProgress } = useLibraryStore();
  const { eqGains, accentColor, toggleLyrics, crossfadeSec = 0, replayGainEnabled } = useSettingsStore() as any;
  const { openMini, closeMini, isMiniOpen } = useMiniPlayer();

  useTrackNotification();

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
      if (!document.hidden) {
        (audioEngine as any).ctx?.resume().catch(() => {});
      }
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
        const [allSongs, allPlaylists] = await Promise.all([
          getAllSongs(db), getPlaylists(db),
        ]);
        const safeSongs = Array.isArray(allSongs) ? allSongs : [];
        setSongs(safeSongs);
        setPlaylists(Array.isArray(allPlaylists) ? allPlaylists : []);

        if ("requestIdleCallback" in window) {
          (window as any).requestIdleCallback(() => {
            const flacSongs = safeSongs
              .filter(s => ["flac","ape","wma","alac"].includes((s.format ?? "").toLowerCase()))
              .sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0))
              .slice(0, 5);
            flacSongs.forEach(s => enqueueBgDecode(s.path));
          }, { timeout: 5000 });
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [onboarding]);

  useEffect(() => { audioEngine.setVolume(volume); }, [volume]);
  useEffect(() => { if (eqGains) audioEngine.setEqPreset(eqGains); }, [eqGains]);
  useEffect(() => { audioEngine.setCrossfade(crossfadeSec); }, [crossfadeSec]);
  useEffect(() => { audioEngine.setReplayGainEnabled(replayGainEnabled !== false); }, [replayGainEnabled]);

  const handleNextRef = useRef<() => void>(() => {});

  useEffect(() => {
    audioEngine.onTimeUpdate(t => {
      setCurrentTime(t);
      if (audioEngine.duration > 0) setProgress((t / audioEngine.duration) * 100);
    });
    audioEngine.onLoadedMetadata(d => setDuration(d));
    audioEngine.onEnded(() => handleNextRef.current());
    audioEngine.onPreloadStateChange(s => setPreloadState(s));
    audioEngine.onError((path, message) => {
      const fileName = path.replace(/\\/g, "/").split("/").pop() ?? path;
      toastError(`Gagal memutar: ${fileName}`);
      console.error("[App] Audio error:", path, message);
      setTimeout(() => { handleNextRef.current(); }, 1500);
    });
  }, []);

  useEffect(() => {
    audioEngine.setNextPathProvider(() => {
      const { queue, queueIndex, shuffle, repeat } = usePlayerStore.getState();
      const safeQueue = Array.isArray(queue) ? queue : [];
      if (safeQueue.length === 0) return null;
      if (repeat === "one") return safeQueue[queueIndex]?.path ?? null;
      if (shuffle) {
        const next = peekUpNextShuffled(1)[0];
        return next?.path ?? null;
      }
      const nextIdx = queueIndex + 1;
      if (nextIdx >= safeQueue.length) return repeat === "all" ? (safeQueue[0]?.path ?? null) : null;
      return safeQueue[nextIdx]?.path ?? null;
    });
  }, []);

  // ── Core: play satu lagu ───────────────────────────────────────────────────
  const playSong = useCallback(async (song: Song) => {
    setCurrentSong(song);
    setIsPlaying(true);
    try {
      await audioEngine.play(song.path);
      const el = (audioEngine as any).elA as HTMLAudioElement | null;
      if (el) el.playbackRate = playbackSpeed;
      addToHistory(song.id);
      const db = await getDb();
      await recordPlay(db, song.id);
      setSongs((prev: any) =>
        Array.isArray(prev)
          ? prev.map((s: Song) => s.id === song.id ? { ...s, play_count: (s.play_count || 0) + 1 } : s)
          : prev
      );
    } catch (err) {
      console.error("[App] playSong error:", err);
      setIsPlaying(false);
      toastError("Gagal memutar lagu");
    }
  }, [playbackSpeed]);

  // ── playList: set queue dari konteks (library/album/playlist) ──────────────
  const playList = useCallback((list: Song[], index = 0) => {
    if (!Array.isArray(list) || list.length === 0) return;
    const safeIndex = Math.max(0, Math.min(index, list.length - 1));
    setQueue(list, safeIndex);
    playSong(list[safeIndex]);

    const nextSong = list[safeIndex + 1];
    if (nextSong?.path) {
      audioEngine.preloadNext(nextSong.path).catch(() => {});
    }

    if ("requestIdleCallback" in window) {
      (window as any).requestIdleCallback(() => {
        list.slice(safeIndex + 2, safeIndex + 5).forEach(s => enqueueBgDecode(s.path));
      }, { timeout: 3000 });
    }
  }, [playSong]);

  // ── handleNext: cek sleep timer ───────────────────────────────────────────
  const handleNext = useCallback(() => {
    // FIX: cek shouldPauseAfterSong dari lifted state
    if (shouldPauseAfterSong()) {
      audioEngine.pause();
      setIsPlaying(false);
      toastInfo("Sleep: musik di-pause setelah lagu selesai 🌙");
      return;
    }

    const next = nextTrack();
    if (next) playSong(next);
    else {
      setIsPlaying(false);
      audioEngine.stop();
    }
  }, [nextTrack, playSong, shouldPauseAfterSong]);

  handleNextRef.current = handleNext;

  const handlePrev = useCallback(() => {
    if (audioEngine.currentTime > 3) {
      audioEngine.seek(0);
    } else {
      const prev = prevTrack();
      if (prev) playSong(prev);
    }
  }, [prevTrack, playSong]);

  const handlePlayPause = useCallback(async () => {
    if (!currentSong) return;
    if (isPlaying) {
      audioEngine.pause();
      setIsPlaying(false);
    } else {
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
    toastSuccess(`Rating ${stars === 0 ? "dihapus" : `${stars} ⭐ disimpan`}`);
  }, [setSongs]);

  const handleScanFolder = useCallback(async () => {
    toastInfo("Memulai scan folder...");
    try {
      await scanFolder(p => {
        setScanProgress({ ...p, phase: p.done ? "completed" : "scanning" });
      });
      const db      = await getDb();
      const updated = await getAllSongs(db);
      setSongs(Array.isArray(updated) ? updated : []);
      setScanProgress(null);
      toastSuccess(`✅ ${Array.isArray(updated) ? updated.length : 0} lagu berhasil di-scan`);
    } catch {
      toastError("Gagal scan folder");
      setScanProgress(null);
    }
  }, []);

  const handleAddFiles = useCallback(async () => {
    try {
      const added = await addFiles();
      const db    = await getDb();
      const updated = await getAllSongs(db);
      setSongs(Array.isArray(updated) ? updated : []);
      if (added.length > 0) toastSuccess(`${added.length} file berhasil ditambahkan`);
    } catch {
      toastError("Gagal menambahkan file");
    }
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
      uns.push(await listen("media:next",      handleNext));
      uns.push(await listen("media:prev",      handlePrev));
    })();
    return () => uns.forEach(f => f());
  }, [handlePlayPause, handleNext, handlePrev]);

  useKeyboardShortcuts({
    onPlayPause:        handlePlayPause,
    onNext:             handleNext,
    onPrev:             handlePrev,
    onToggleShuffle:    () => {
      toggleShuffle();
      const { shuffle: ns } = usePlayerStore.getState();
      toastInfo(ns ? "Shuffle aktif" : "Shuffle nonaktif");
    },
    onCycleRepeat:      cycleRepeat,
    onToggleMini:       () => isMiniOpen() ? closeMini() : openMini(),
    onToggleLyrics:     toggleLyrics,
    onOpenSettings:     () => setShowSettings(s => !s),
    onFocusSearch:      () => {
      setActiveTab("library");
      setTimeout(() => searchInputRef.current?.focus(), 50);
    },
    onToggleCheatsheet: () => setShowCheatsheet(s => !s),
  });

  // ── Loading screen ─────────────────────────────────────────────────────────
  if (onboarding === null) return (
    <div style={{ height: "100vh", background: "#070710", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{
        width: 32, height: 32, borderRadius: "50%",
        border: "3px solid #7C3AED", borderTopColor: "transparent",
        animation: "spin 0.8s linear infinite",
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );

  if (onboarding) return <Onboarding onComplete={handleOnboardingComplete} />;

  // ── Main app ───────────────────────────────────────────────────────────────
  return (
    <div className="app-root">
      <ScanProgress />
      <ToastContainer />
      <KeyboardCheatsheet open={showCheatsheet} onClose={() => setShowCheatsheet(false)} />
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}

      <div className="layout">
        <Sidebar onPlayPause={handlePlayPause} onRating={handleRating} />

        <div className="content">
          {/* ── Tab Nav ── */}
          <nav className="tab-nav">
            <div className="logo">
              <span className="logo-icon">♪</span>
              <span className="logo-text">Resonance</span>
            </div>

            <div className="tabs">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  className={`tab-btn ${activeTab === tab.id ? "active" : ""}`}
                  onClick={() => setActiveTab(tab.id)}
                  title={tab.label}
                >
                  <span>{tab.icon}</span>
                  <span className="tab-label">{tab.label}</span>
                </button>
              ))}
            </div>

            <div className="toolbar">
              {/* FIX: SleepTimerButton menerima lifted state */}
              <SleepTimerButton
                timer={sleepTimer}
                onStart={startSleep}
                onClear={clearSleep}
                onPauseAfterSong={startPauseAfterSong}
              />
              <button
                className="icon-btn"
                onClick={() => setShowCheatsheet(s => !s)}
                title="Keyboard Shortcuts (?)"
                style={{ fontFamily: "Space Mono, monospace", fontSize: 12 }}
              >?</button>
              <button
                className="icon-btn"
                onClick={() => isMiniOpen() ? closeMini() : openMini()}
                title="Mini Player (Ctrl+M)"
              >⬛</button>
              <button className="icon-btn" onClick={handleScanFolder} title="Scan Folder">📁</button>
              <button className="icon-btn" onClick={handleAddFiles}   title="Tambah File">➕</button>
              <button className="icon-btn" onClick={() => setShowSettings(true)} title="Pengaturan (Ctrl+,)">⚙</button>
            </div>
          </nav>

          {/* ── Tab Content ── */}
          <div className="tab-content">
            {activeTab === "home" && (
              // FIX: onPlay(songs, index) langsung ke playList
              <Dashboard onPlay={playList} onRating={handleRating} />
            )}

            {activeTab === "library" && (
              songs.length === 0 ? (
                <EmptyLibraryState onScanFolder={handleScanFolder} onAddFiles={handleAddFiles} />
              ) : (
                <LibraryView
                  onPlay={(song, contextList) => {
                    if (contextList && contextList.length > 0) {
                      const idx = contextList.findIndex(s => s.id === song.id);
                      playList(contextList, idx >= 0 ? idx : 0);
                    } else {
                      playList([song], 0);
                    }
                  }}
                  onRating={handleRating}
                  searchRef={searchInputRef}
                />
              )
            )}

            {activeTab === "albums"  && <AlbumView onPlay={playList} />}
            {activeTab === "artists" && <ArtistView onPlay={playList} />}
            {activeTab === "smart"   && <SmartPlaylistView onPlay={playList} />}
            {activeTab === "queue"   && <QueueView onPlay={song => playSong(song)} />}
            {activeTab === "equalizer" && <EqualizerView />}

            {activeTab === "playlists" && (
              // FIX: tambah onPlayAll untuk play seluruh playlist
              <PlaylistsView
                onPlay={song => playSong(song)}
                onPlayAll={songs => playList(songs, 0)}
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