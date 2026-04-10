/**
 * App.tsx (M5 — Final) — Root Component
 *
 * Tambahan dari M4:
 *   - Onboarding check (first launch)
 *   - Dashboard tab
 *   - Smart Playlists tab
 *   - Album & Artist view tab
 *   - WaveformSeekbar di PlayerBar
 *   - OS Notifications
 *
 * Fix: handleNext TDZ (Cannot access before initialization)
 *      — ref assignment dipindah ke setelah deklarasi handleNext
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

// Components
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
  const [onboarding, setOnboarding]     = useState<boolean | null>(null); // null = loading
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isInitialized  = useRef(false);

  const {
    currentSong, isPlaying, volume,
    setCurrentSong, setIsPlaying, setProgress, setCurrentTime,
    setDuration, nextTrack, prevTrack, addToHistory, setQueue,
    toggleShuffle, cycleRepeat,
  } = usePlayerStore();

  const {
    songs, setSongs, setPlaylists, setLoading, setScanProgress,
  } = useLibraryStore();

  const { eqGains, accentColor, toggleLyrics } = useSettingsStore() as any;
  const { openMini, closeMini, isMiniOpen } = useMiniPlayer();

  // OS notifications
  useTrackNotification();

  // ── Apply accent color ──────────────────────────────────────────────────
  useEffect(() => {
    if (accentColor) document.documentElement.style.setProperty("--accent", accentColor);
  }, [accentColor]);

  // ── Check onboarding ────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const db   = await getDb();
        const done = await getSetting(db, "onboarded");
        setOnboarding(done !== "true");
      } catch {
        setOnboarding(false); // error = skip onboarding
      }
    })();

    requestNotificationPermission();
  }, []);

  // ── Init library ────────────────────────────────────────────────────────
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
        setSongs(allSongs);
        setPlaylists(allPlaylists);
        setQueue(allSongs);
      } finally {
        setLoading(false);
      }
    })();
  }, [onboarding]);

  // ── Audio engine: volume & EQ ───────────────────────────────────────────
  useEffect(() => { audioEngine.setVolume(volume); }, [volume]);
  useEffect(() => { if (eqGains) audioEngine.setEqPreset(eqGains); }, [eqGains]);

  // ── Audio engine: time / metadata callbacks (stable, registered once) ───
  useEffect(() => {
    audioEngine.onTimeUpdate(t => {
      setCurrentTime(t);
      if (audioEngine.duration > 0) setProgress((t / audioEngine.duration) * 100);
    });
    audioEngine.onLoadedMetadata(d => setDuration(d));
  }, []);

  // ── Stable ref for handleNext (avoids stale closure in onEnded) ─────────
  // Deklarasi ref SEBELUM dipakai di useEffect onEnded,
  // tapi assignment .current dilakukan SETELAH handleNext didefinisikan di bawah.
  const handleNextRef = useRef<() => void>(() => {});

  useEffect(() => {
    // onEnded dipasang sekali; selalu memanggil versi terbaru via ref
    audioEngine.onEnded(() => handleNextRef.current());
  }, []);

  // ── Playback ────────────────────────────────────────────────────────────
  const playSong = useCallback(async (song: Song) => {
    setCurrentSong(song);
    setIsPlaying(true);
    try {
      await audioEngine.play(song.path);
      addToHistory(song.id);
      const db = await getDb();
      await recordPlay(db, song.id);
      // Update play count di store secara optimistik
      setSongs(songs.map(s =>
        s.id === song.id ? { ...s, play_count: (s.play_count || 0) + 1 } : s
      ));
    } catch {
      setIsPlaying(false);
    }
  }, [songs]);

  const playList = useCallback((list: Song[], index = 0) => {
    setQueue(list, index);
    playSong(list[index]);
  }, [playSong]);

  // ✅ handleNext didefinisikan SEBELUM handleNextRef.current di-assign
  const handleNext = useCallback(() => {
    const next = nextTrack();
    if (next) playSong(next);
    else setIsPlaying(false);
  }, [nextTrack, playSong]);

  // ✅ Assignment aman — handleNext sudah ada di scope ini
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
    setSongs(songs.map(s => s.id === songId ? { ...s, stars } : s));
    const db = await getDb();
    await setRating(db, songId, stars);
  }, [songs]);

  // ── Scan ────────────────────────────────────────────────────────────────
  const handleScanFolder = useCallback(async () => {
    await scanFolder(p => setScanProgress(p));
    const db      = await getDb();
    const updated = await getAllSongs(db);
    setSongs(updated);
    setQueue(updated);
    setScanProgress(null);
  }, []);

  const handleAddFiles = useCallback(async () => {
    await addFiles();
    const db      = await getDb();
    const updated = await getAllSongs(db);
    setSongs(updated);
    setQueue(updated);
  }, []);

  // ── Onboarding complete ─────────────────────────────────────────────────
  const handleOnboardingComplete = useCallback((newSongs: Song[]) => {
    setSongs(newSongs);
    setQueue(newSongs);
    setOnboarding(false);
    isInitialized.current = true;
  }, []);

  // ── Mini player commands ────────────────────────────────────────────────
  useMiniPlayerCommands({
    onPlayPause: handlePlayPause,
    onNext: handleNext,
    onPrev: handlePrev,
  });

  // ── Tauri media-key events ──────────────────────────────────────────────
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

  // ── Keyboard shortcuts ──────────────────────────────────────────────────
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

  // ── Render: loading ─────────────────────────────────────────────────────
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

  // ── Render: onboarding ──────────────────────────────────────────────────
  if (onboarding) return <Onboarding onComplete={handleOnboardingComplete} />;

  // ── Render: main app ────────────────────────────────────────────────────
  return (
    <div className="app-root">
      <ScanProgress />
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}

      <div className="layout">
        <Sidebar onPlayPause={handlePlayPause} onRating={handleRating} />

        <div className="content">
          {/* Tab navigation */}
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
              <button
                className="icon-btn"
                onClick={() => isMiniOpen() ? closeMini() : openMini()}
                title="Mini Player"
              >⬛</button>
              <button className="icon-btn" onClick={handleScanFolder} title="Scan Folder">📁</button>
              <button className="icon-btn" onClick={handleAddFiles}   title="Add Files">➕</button>
              <button className="icon-btn" onClick={() => setShowSettings(true)} title="Settings">⚙</button>
            </div>
          </nav>

          {/* Tab content */}
          <div className="tab-content">
            {activeTab === "home"      && <Dashboard onPlay={playList} onRating={handleRating} />}
            {activeTab === "library"   && (
              <LibraryView
                onPlay={song => { setQueue([song]); playSong(song); }}
                onRating={handleRating}
                searchRef={searchInputRef}
              />
            )}
            {activeTab === "albums"    && <AlbumView onPlay={playList} />}
            {activeTab === "artists"   && <ArtistView onPlay={playList} />}
            {activeTab === "smart"     && <SmartPlaylistView onPlay={playList} />}
            {activeTab === "queue"     && <QueueView onPlay={song => playSong(song)} />}
            {activeTab === "equalizer" && <EqualizerView />}
            {activeTab === "playlists" && <PlaylistsView onPlay={song => playSong(song)} />}
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