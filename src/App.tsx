/**
 * App.tsx — Root Component
 *
 * Key behaviors:
 *   - Queue only set when user explicitly plays something (not on init)
 *   - repeat=all: loops back to start of queue
 *   - repeat=one: replays same song
 *   - repeat=off: stops at end
 *   - Playing from Library sets queue to current filtered list
 *   - Playing from Album/Playlist sets queue to that list
 *   - preloadNext: pre-decodes next FLAC in background for smooth transitions
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { audioEngine } from "./lib/audioEngine";
import { getDb, getAllSongs, setRating, recordPlay, getPlaylists, getSetting } from "./lib/db";
import { scanFolder, addFiles } from "./lib/scanner";
import { usePlayerStore, useLibraryStore, useSettingsStore } from "./store";
import { useMiniPlayer, useMiniPlayerCommands } from "./components/Player/useMiniPlayer";
import { useKeyboardShortcuts } from "./components/Player/useKeyboardShortcuts";
import { useTrackNotification, requestNotificationPermission } from "./components/Notification/useTrackNotification";
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
import ScanProgress      from "./components/Library/ScanProgress";
import SettingsPanel     from "./components/Settings/SettingsPanel";
import SleepTimerButton  from "./components/Player/SleepTimer";

export type ActiveTab =
  | "home" | "library" | "albums" | "artists"
  | "smart" | "queue" | "equalizer" | "playlists";

const TABS: { id: ActiveTab; label: string; icon: string }[] = [
  { id: "home",      label: "Home",      icon: "🏠" },
  { id: "library",   label: "Library",   icon: "🎵" },
  { id: "albums",    label: "Albums",    icon: "💿" },
  { id: "artists",   label: "Artists",   icon: "🎤" },
  { id: "smart",     label: "Smart",     icon: "✨" },
  { id: "queue",     label: "Queue",     icon: "📋" },
  { id: "equalizer", label: "EQ",        icon: "🎚️" },
  { id: "playlists", label: "Playlists", icon: "📂" },
];

export default function App() {
  const [activeTab, setActiveTab]       = useState<ActiveTab>("home");
  const [showSettings, setShowSettings] = useState(false);
  const [onboarding, setOnboarding]     = useState<boolean | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isInitialized  = useRef(false);

  const {
    currentSong, isPlaying, volume,
    setCurrentSong, setIsPlaying, setProgress, setCurrentTime,
    setDuration, nextTrack, prevTrack, addToHistory, setQueue,
    toggleShuffle, cycleRepeat, queue, queueIndex,
  } = usePlayerStore();

  const { songs, setSongs, setPlaylists, setLoading, setScanProgress } = useLibraryStore();
  const { eqGains, accentColor, toggleLyrics } = useSettingsStore() as any;
  const { openMini, closeMini, isMiniOpen } = useMiniPlayer();

  useTrackNotification();

  // Apply accent color CSS variable
  useEffect(() => {
    if (accentColor) document.documentElement.style.setProperty("--accent", accentColor);
  }, [accentColor]);

  // Check onboarding
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

  // Init: load library BUT do NOT setQueue
  useEffect(() => {
    if (isInitialized.current || onboarding === null || onboarding === true) return;
    isInitialized.current = true;

    (async () => {
      setLoading(true);
      try {
        const db = await getDb();
        const [allSongs, allPlaylists] = await Promise.all([
          getAllSongs(db),
          getPlaylists(db),
        ]);
        setSongs(Array.isArray(allSongs) ? allSongs : []);
        setPlaylists(Array.isArray(allPlaylists) ? allPlaylists : []);
      } finally {
        setLoading(false);
      }
    })();
  }, [onboarding]);

  useEffect(() => { audioEngine.setVolume(volume); }, [volume]);
  useEffect(() => { if (eqGains) audioEngine.setEqPreset(eqGains); }, [eqGains]);

  useEffect(() => {
    audioEngine.onTimeUpdate(t => {
      setCurrentTime(t);
      if (audioEngine.duration > 0) setProgress((t / audioEngine.duration) * 100);
    });
    audioEngine.onLoadedMetadata(d => setDuration(d));
  }, []);

  // Stable ref to avoid stale closure in onEnded
  const handleNextRef = useRef<() => void>(() => {});
  useEffect(() => {
    audioEngine.onEnded(() => handleNextRef.current());
  }, []);

  // Pre-load next track in background when queue changes or song changes
  useEffect(() => {
    const safeQueue = Array.isArray(queue) ? queue : [];
    const safeIndex = typeof queueIndex === "number" ? queueIndex : 0;
    const nextSong = safeQueue[safeIndex + 1];
    if (nextSong?.path) {
      // Fire and forget — background pre-decode + preload
      audioEngine.preloadNext(nextSong.path).catch(() => {});
    }
  }, [currentSong?.id, queue, queueIndex]);

  // Core: play a single song
  const playSong = useCallback(async (song: Song) => {
    setCurrentSong(song);
    setIsPlaying(true);
    try {
      await audioEngine.play(song.path);
      addToHistory(song.id);
      const db = await getDb();
      await recordPlay(db, song.id);
      setSongs(prev => Array.isArray(prev)
        ? prev.map(s => s.id === song.id ? { ...s, play_count: (s.play_count || 0) + 1 } : s)
        : prev
      );
    } catch (err) {
      console.error("playSong error:", err);
      setIsPlaying(false);
    }
  }, []);

  // Play a list starting at index — sets queue to that list
  const playList = useCallback((list: Song[], index = 0) => {
    if (!Array.isArray(list) || list.length === 0) return;
    const safeIndex = Math.max(0, Math.min(index, list.length - 1));
    setQueue(list, safeIndex);
    playSong(list[safeIndex]);

    // Immediately pre-load the next track
    const nextSong = list[safeIndex + 1];
    if (nextSong?.path) {
      audioEngine.preloadNext(nextSong.path).catch(() => {});
    }
  }, [playSong]);

  // Next: from queue — loops if repeat=all
  const handleNext = useCallback(() => {
    const next = nextTrack();
    if (next) {
      playSong(next);
    } else {
      setIsPlaying(false);
      audioEngine.stop();
    }
  }, [nextTrack, playSong]);

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
    setSongs(prev => Array.isArray(prev)
      ? prev.map(s => s.id === songId ? { ...s, stars } : s)
      : prev
    );
    // Also update currentSong in player store if it's the same song
    const { currentSong: cs, setCurrentSong: scs } = usePlayerStore.getState();
    if (cs && cs.id === songId) {
      scs({ ...cs, stars });
    }
    const db = await getDb();
    await setRating(db, songId, stars);
  }, [setSongs]);

  const handleScanFolder = useCallback(async () => {
    await scanFolder(p => setScanProgress(p));
    const db      = await getDb();
    const updated = await getAllSongs(db);
    setSongs(Array.isArray(updated) ? updated : []);
    setScanProgress(null);
  }, []);

  const handleAddFiles = useCallback(async () => {
    await addFiles();
    const db      = await getDb();
    const updated = await getAllSongs(db);
    setSongs(Array.isArray(updated) ? updated : []);
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
    onPlayPause:     handlePlayPause,
    onNext:          handleNext,
    onPrev:          handlePrev,
    onToggleShuffle: toggleShuffle,
    onCycleRepeat:   cycleRepeat,
    onToggleMini:    () => isMiniOpen() ? closeMini() : openMini(),
    onToggleLyrics:  toggleLyrics,
    onOpenSettings:  () => setShowSettings(s => !s),
    onFocusSearch:   () => {
      setActiveTab("library");
      setTimeout(() => searchInputRef.current?.focus(), 50);
    },
  });

  // ── Loading screen ────────────────────────────────────────────────────────
  if (onboarding === null) return (
    <div style={{
      height: "100vh", background: "#070710",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: "50%",
        border: "3px solid #7C3AED", borderTopColor: "transparent",
        animation: "spin 0.8s linear infinite",
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );

  if (onboarding) return <Onboarding onComplete={handleOnboardingComplete} />;

  // ── Main app ──────────────────────────────────────────────────────────────
  return (
    <div className="app-root">
      <ScanProgress />
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}

      <div className="layout">
        <Sidebar onPlayPause={handlePlayPause} onRating={handleRating} />

        <div className="content">
          <nav className="tab-nav">
            <div className="logo">
              <span className="logo-icon">♪</span>
              <span className="logo-text">Resonance</span>
            </div>

            <div className="tabs" style={{ gap: 2 }}>
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  className={`tab-btn ${activeTab === tab.id ? "active" : ""}`}
                  onClick={() => setActiveTab(tab.id)}
                  title={tab.label}
                >
                  <span style={{ marginRight: 4 }}>{tab.icon}</span>
                  <span style={{ fontSize: 11 }}>{tab.label}</span>
                </button>
              ))}
            </div>

            <div className="toolbar">
              <SleepTimerButton />
              <button className="icon-btn" onClick={() => isMiniOpen() ? closeMini() : openMini()} title="Mini Player (Ctrl+M)">⬛</button>
              <button className="icon-btn" onClick={handleScanFolder} title="Scan Folder">📁</button>
              <button className="icon-btn" onClick={handleAddFiles}   title="Add Files">➕</button>
              <button className="icon-btn" onClick={() => setShowSettings(true)} title="Settings (Ctrl+,)">⚙</button>
            </div>
          </nav>

          <div className="tab-content">
            {activeTab === "home" && (
              <Dashboard onPlay={playList} onRating={handleRating} />
            )}

            {activeTab === "library" && (
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
            )}

            {activeTab === "albums"    && <AlbumView onPlay={playList} />}
            {activeTab === "artists"   && <ArtistView onPlay={playList} />}
            {activeTab === "smart"     && <SmartPlaylistView onPlay={playList} />}
            {activeTab === "queue"     && <QueueView onPlay={song => playSong(song)} />}
            {activeTab === "equalizer" && <EqualizerView />}

            {activeTab === "playlists" && (
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
      />
    </div>
  );
}