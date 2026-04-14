/**
 * QueueView.tsx — v14 (Queue Jump Fix)
 *
 * PERUBAHAN vs v13:
 *   [FIX] Klik lagu di queue → langsung play lagu itu, queue di-reset dari posisi itu
 *         (bukan hanya highlight/jump scroll)
 *   [REMOVE] Hapus checkbox/select dari queue — tidak relevan di queue view
 */

import { useState, useRef, useCallback, useEffect } from "react";
import React from "react";
import { usePlayerStore, useLibraryStore } from "../../store";
import type { QueueItem } from "../../store";
import type { Song } from "../../lib/db";
import { getDb, createPlaylist, addToPlaylist, getPlaylists } from "../../lib/db";
import CoverArt from "../CoverArt";
import { toastSuccess, toastInfo, toastError } from "../Notification/ToastSystem";

const fmt = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

interface Props {
  onPlay: (song: Song) => void;
  onPlayFromQueue?: (songs: Song[], startIndex: number, contextName: string) => void;
}

export default function QueueView({ onPlay, onPlayFromQueue }: Props) {
  const {
    currentSong, shuffleMode,
    unifiedQueue, reorderUnified, removeFromUnified,
    clearManualQueue, playContext, contextIndex, contextName,
    undoQueueAction, shuffleQueueOnly, isQueueShuffled,
    _queueHistory, addToManualQueue,
    setPlayContext,
  } = usePlayerStore() as any;

  const { setPlaylists } = useLibraryStore();

  const safeQueue: QueueItem[] = Array.isArray(unifiedQueue) ? unifiedQueue : [];
  const safeContext: Song[]    = Array.isArray(playContext) ? playContext : [];
  const safeCtxIdx: number     = typeof contextIndex === "number" ? contextIndex : 0;

  const [searchQuery, setSearchQuery]       = useState("");
  const [highlightedUid, setHighlightedUid] = useState<string | null>(null);
  const rowRefsMap = useRef<Map<string, HTMLDivElement>>(new Map());

  const searchResults = searchQuery.trim()
    ? safeQueue.filter((item: QueueItem) => {
        const q = searchQuery.toLowerCase();
        return (
          item.song.title?.toLowerCase().includes(q) ||
          item.song.artist?.toLowerCase().includes(q) ||
          item.song.album?.toLowerCase().includes(q)
        );
      })
    : [];

  // [FIX] Klik lagu di queue → langsung play dari posisi itu
  // Jika lagu ada di playContext (bukan manual queue), set context baru dari sana
  // Jika manual queue, langsung play dan hapus dari queue
  const handleQueueItemPlay = useCallback((item: QueueItem, queueIndex: number) => {
    if (item.fromManual) {
      // Manual queue: langsung play, hapus dari queue
      onPlay(item.song);
      removeFromUnified?.(item.uid);
    } else {
      // Context song: cari posisi di playContext lalu set context dari sana
      const songIndexInContext = safeContext.findIndex(s => s.id === item.song.id);
      if (songIndexInContext >= 0) {
        // Set context mulai dari lagu yang diklik → queue otomatis di-reset dari posisi itu
        if (onPlayFromQueue) {
          onPlayFromQueue(safeContext, songIndexInContext, contextName || "Queue");
        } else {
          // Fallback: langsung play via setPlayContext + onPlay
          setPlayContext(safeContext, songIndexInContext, contextName || "Queue");
          onPlay(item.song);
        }
      } else {
        // Tidak ditemukan di context, play langsung
        onPlay(item.song);
      }
    }
  }, [safeContext, contextName, onPlay, removeFromUnified, onPlayFromQueue, setPlayContext]);

  const handleJumpToSong = useCallback((uid: string) => {
    setHighlightedUid(uid);
    setSearchQuery("");
    setTimeout(() => {
      const el = rowRefsMap.current.get(uid);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => setHighlightedUid(null), 2000);
      }
    }, 50);
  }, []);

  const manualSongIds = new Set(
    safeQueue.filter((x: QueueItem) => x.fromManual).map((x: QueueItem) => x.song.id)
  );
  const contextSongsAfterCurrent = safeContext.slice(safeCtxIdx + 1);
  const addableFromContext = contextSongsAfterCurrent.filter(s => !manualSongIds.has(s.id));
  const canAddContextToQueue = !!contextName && addableFromContext.length > 0;

  const handleAddContextToQueue = useCallback(() => {
    addableFromContext.forEach((song: Song) => addToManualQueue(song));
    toastSuccess(`Added ${addableFromContext.length} tracks from "${contextName}"`);
  }, [addableFromContext, addToManualQueue, contextName]);

  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName]             = useState("");
  const [isSaving, setIsSaving]             = useState(false);
  const saveInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showSaveDialog) {
      const defaultName = contextName
        ? `${contextName} — ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
        : `Queue ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`;
      setSaveName(defaultName);
      setTimeout(() => saveInputRef.current?.select(), 50);
    }
  }, [showSaveDialog, contextName]);

  const handleSaveAsPlaylist = useCallback(async () => {
    if (!saveName.trim() || safeQueue.length === 0) return;
    setIsSaving(true);
    try {
      const db = await getDb();
      const playlistId = await createPlaylist(db, saveName.trim());
      for (const item of safeQueue) await addToPlaylist(db, playlistId, item.song.id);
      const updated = await getPlaylists(db);
      setPlaylists(updated);
      toastSuccess(`Playlist "${saveName.trim()}" saved (${safeQueue.length} tracks)`);
      setShowSaveDialog(false);
      setSaveName("");
    } catch { toastError("Failed to save playlist"); } finally { setIsSaving(false); }
  }, [saveName, safeQueue, setPlaylists]);

  // Drag & drop
  const [dragIdx, setDragIdx]         = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [ghostPos, setGhostPos]       = useState<{ x: number; y: number } | null>(null);
  const dragItemRef = useRef<number | null>(null);
  const rowRefs     = useRef<(HTMLDivElement | null)[]>([]);

  const totalMin    = Math.round(safeQueue.reduce((a: number, x: QueueItem) => a + (x.song.duration || 0), 0) / 60);
  const manualCount = safeQueue.filter((x: QueueItem) => x.fromManual).length;
  const undoCount   = Array.isArray(_queueHistory) ? _queueHistory.length : 0;
  const lastUndoDesc = undoCount > 0 ? (_queueHistory[0]?.description ?? "last action") : "";

  const handleDragHandlePointerDown = useCallback((e: React.PointerEvent, idx: number) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragItemRef.current = idx;
    setDragIdx(idx);
    setGhostPos({ x: e.clientX, y: e.clientY });
    e.preventDefault();
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (dragItemRef.current === null) return;
    setGhostPos({ x: e.clientX, y: e.clientY });
    let found: number | null = null;
    rowRefs.current.forEach((el, i) => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (e.clientY >= rect.top && e.clientY <= rect.bottom) found = i;
    });
    setDragOverIdx(found);
  }, []);

  const handlePointerUp = useCallback(() => {
    const fromIdx = dragItemRef.current;
    if (fromIdx !== null && dragOverIdx !== null && fromIdx !== dragOverIdx) {
      reorderUnified?.(fromIdx, dragOverIdx);
    }
    dragItemRef.current = null;
    setDragIdx(null); setDragOverIdx(null); setGhostPos(null);
  }, [dragOverIdx, reorderUnified]);

  useEffect(() => {
    const cancel = () => {
      if (dragItemRef.current === null) return;
      dragItemRef.current = null;
      setDragIdx(null); setDragOverIdx(null); setGhostPos(null);
    };
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("pointerup", cancel);
    return () => { window.removeEventListener("pointercancel", cancel); window.removeEventListener("pointerup", cancel); };
  }, []);

  const ghostItem = dragIdx !== null ? safeQueue[dragIdx] : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>

      {/* Ghost drag preview */}
      {ghostPos && ghostItem && (
        <div style={{
          position: "fixed", left: ghostPos.x - 16, top: ghostPos.y - 18,
          pointerEvents: "none", zIndex: 9999,
          background: "var(--bg-overlay)",
          border: `1px solid ${ghostItem.fromManual ? "rgba(236,72,153,0.5)" : "rgba(124,58,237,0.5)"}`,
          borderRadius: "var(--radius-md, 8px)", padding: "5px 12px",
          fontSize: 12, color: ghostItem.fromManual ? "#f9a8d4" : "var(--accent-light, #c4b5fd)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
          maxWidth: 240, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          opacity: 0.95,
        }}>
          ⠿ {ghostItem.song.title}
        </div>
      )}

      {/* ── Header ── */}
      <div style={{ flexShrink: 0, marginBottom: 10 }}>

        {/* Title + stats + clear */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div>
            <h3 style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)" }}>Queue</h3>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
              {manualCount > 0 && (
                <span style={{ color: "#EC4899", fontWeight: 600 }}>{manualCount} manual · </span>
              )}
              {safeQueue.length} upcoming
              {totalMin > 0 && ` · ~${totalMin} min`}
              {shuffleMode !== "off" && (
                <span style={{
                  marginLeft: 8, fontSize: 10,
                  color: "var(--accent-light, #a78bfa)",
                  background: "rgba(124,58,237,0.15)",
                  padding: "1px 7px", borderRadius: 10,
                  border: "1px solid rgba(124,58,237,0.3)",
                }}>
                  ⇄ {shuffleMode}
                </span>
              )}
            </p>
          </div>
          {safeQueue.length > 0 && (
            <button
              onClick={() => clearManualQueue?.()}
              style={{
                padding: "5px 12px", borderRadius: "var(--radius-md, 8px)", fontSize: 12,
                background: "transparent", border: "1px solid var(--border-medium)",
                color: "var(--text-muted)", cursor: "pointer", fontFamily: "inherit",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(239,68,68,0.4)"; e.currentTarget.style.color = "#f87171"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border-medium)"; e.currentTarget.style.color = "var(--text-muted)"; }}
            >
              Clear all
            </button>
          )}
        </div>

        {/* Context banner */}
        {contextName && (
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "8px 11px", borderRadius: "var(--radius-md, 8px)", marginBottom: 8,
            background: "rgba(124,58,237,0.07)", border: "1px solid rgba(124,58,237,0.15)",
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: 7,
              background: "rgba(124,58,237,0.2)", border: "1px solid rgba(124,58,237,0.3)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0,
            }}>♫</div>
            <div style={{ flex: 1, overflow: "hidden" }}>
              <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>Playing from</p>
              <p style={{ fontSize: 12, color: "var(--accent-light, #a78bfa)", fontWeight: 600, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {contextName}
                <span style={{ color: "var(--text-muted)", fontWeight: 400 }}> · {safeContext.length} tracks</span>
              </p>
            </div>
            {canAddContextToQueue && (
              <button
                onClick={handleAddContextToQueue}
                title={`Add ${addableFromContext.length} remaining tracks`}
                style={{
                  padding: "4px 9px", borderRadius: "var(--radius-sm, 6px)", fontSize: 11, flexShrink: 0,
                  background: "rgba(124,58,237,0.18)", border: "1px solid rgba(124,58,237,0.4)",
                  color: "var(--accent-light, #a78bfa)", cursor: "pointer", fontFamily: "inherit",
                  display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap",
                }}
              >
                +{addableFromContext.length} to queue
              </button>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
          <QueueActionBtn
            label="Undo"
            icon={<UndoIcon />}
            badge={undoCount > 0 ? String(undoCount) : undefined}
            disabled={undoCount === 0}
            color="var(--accent-light, #a78bfa)"
            colorDim="rgba(124,58,237,0.15)"
            colorBorder="rgba(124,58,237,0.3)"
            title={undoCount > 0 ? `Undo: ${lastUndoDesc}` : "Nothing to undo"}
            onClick={() => { const ok = undoQueueAction?.(); if (ok) toastInfo(`Undone: ${lastUndoDesc}`); }}
          />
          {manualCount > 0 && (
            <QueueActionBtn
              label={isQueueShuffled ? "Shuffled" : "Shuffle queue"}
              icon={<ShuffleIcon />}
              active={isQueueShuffled}
              color="#f9a8d4"
              colorDim="rgba(236,72,153,0.12)"
              colorBorder="rgba(236,72,153,0.3)"
              title={isQueueShuffled ? "Undo to restore order" : "Shuffle manual queue only"}
              onClick={() => { shuffleQueueOnly?.(); toastInfo("Manual queue shuffled"); }}
            />
          )}
          <QueueActionBtn
            label="Save as playlist"
            icon={<SaveIcon />}
            disabled={safeQueue.length === 0}
            color="#34D399"
            colorDim="rgba(16,185,129,0.1)"
            colorBorder="rgba(16,185,129,0.3)"
            title="Save current queue as a playlist"
            onClick={() => setShowSaveDialog(true)}
          />
        </div>

        {/* Search */}
        {safeQueue.length > 3 && (
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--text-faint)", fontSize: 12, pointerEvents: "none" }}>
              <SearchIcon />
            </span>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={`Search ${safeQueue.length} tracks…`}
              style={{
                width: "100%", padding: "7px 28px",
                background: "var(--bg-overlay)", border: "1px solid var(--border)",
                borderRadius: "var(--radius-md, 8px)", color: "var(--text-primary)", fontSize: 12,
                fontFamily: "inherit", outline: "none",
              }}
              onFocus={e => e.currentTarget.style.borderColor = "rgba(124,58,237,0.4)"}
              onBlur={e => e.currentTarget.style.borderColor = "var(--border)"}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} style={{
                position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 13,
              }}>✕</button>
            )}

            {/* Search results dropdown */}
            {searchQuery.trim() && (
              <div style={{
                position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
                background: "var(--bg-overlay)", border: "1px solid var(--border-medium)",
                borderRadius: "var(--radius-lg, 12px)",
                boxShadow: "0 8px 24px rgba(0,0,0,0.6)", zIndex: 50, maxHeight: 220, overflowY: "auto",
              }}>
                {searchResults.length > 0 ? (
                  <>
                    <p style={{ fontSize: 10, color: "var(--text-faint)", padding: "6px 12px 4px", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
                      {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} — klik untuk jump & play
                    </p>
                    {searchResults.map((item: QueueItem) => {
                      const idx = safeQueue.findIndex((x: QueueItem) => x.uid === item.uid);
                      return (
                        <div key={item.uid} onClick={() => {
                          handleJumpToSong(item.uid);
                        }}
                          style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", cursor: "pointer" }}
                          onMouseEnter={e => (e.currentTarget.style.background = "rgba(124,58,237,0.08)")}
                          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                        >
                          <span style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "monospace", width: 24, textAlign: "right", flexShrink: 0 }}>#{idx + 1}</span>
                          <CoverArt id={item.song.id} coverArt={item.song.cover_art} size={28} />
                          <div style={{ flex: 1, overflow: "hidden" }}>
                            <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--text-primary)" }}>
                              {item.song.title}
                            </div>
                            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{item.song.artist}</div>
                          </div>
                          {item.fromManual && (
                            <span style={{
                              fontSize: 9, padding: "1px 5px", borderRadius: 4,
                              background: "rgba(236,72,153,0.15)", color: "#EC4899",
                              border: "1px solid rgba(236,72,153,0.3)", flexShrink: 0, fontWeight: 700,
                            }}>manual</span>
                          )}
                        </div>
                      );
                    })}
                  </>
                ) : (
                  <p style={{ fontSize: 12, color: "var(--text-faint)", padding: "10px 12px" }}>
                    No tracks matching "{searchQuery}"
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Save Playlist Dialog ── */}
      {showSaveDialog && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 300,
          background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
          onClick={() => !isSaving && setShowSaveDialog(false)}
        >
          <div style={{
            background: "var(--bg-overlay)", border: "1px solid rgba(16,185,129,0.3)",
            borderRadius: "var(--radius-xl, 16px)", padding: "22px 24px", width: 360,
            boxShadow: "0 16px 48px rgba(0,0,0,0.8)",
          }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ fontWeight: 700, fontSize: 14, marginBottom: 5, color: "var(--text-primary)" }}>Save as playlist</h3>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14, lineHeight: 1.5 }}>
              {safeQueue.length} tracks will be saved in current order.
            </p>
            <input
              ref={saveInputRef} value={saveName}
              onChange={e => setSaveName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleSaveAsPlaylist(); if (e.key === "Escape") setShowSaveDialog(false); }}
              placeholder="Playlist name…"
              style={{
                width: "100%", padding: "9px 12px",
                background: "var(--bg-muted)", border: "1px solid rgba(16,185,129,0.4)",
                borderRadius: "var(--radius-md, 8px)", color: "var(--text-primary)",
                fontSize: 13, fontFamily: "inherit", outline: "none", marginBottom: 14,
                boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowSaveDialog(false)} disabled={isSaving} style={{
                flex: 1, padding: "8px", borderRadius: "var(--radius-md, 8px)", fontSize: 12,
                background: "transparent", border: "1px solid var(--border-medium)",
                color: "var(--text-secondary)", cursor: "pointer", fontFamily: "inherit",
              }}>Cancel</button>
              <button onClick={handleSaveAsPlaylist} disabled={isSaving || !saveName.trim()} style={{
                flex: 2, padding: "8px", borderRadius: "var(--radius-md, 8px)", fontSize: 12,
                background: saveName.trim() ? "linear-gradient(135deg, #10B981, #06B6D4)" : "var(--bg-muted)",
                border: "none", color: "white", cursor: saveName.trim() && !isSaving ? "pointer" : "not-allowed",
                fontFamily: "inherit", fontWeight: 600, opacity: saveName.trim() && !isSaving ? 1 : 0.5,
              }}>
                {isSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Queue list ── */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {/* Now Playing */}
        {currentSong && (
          <div style={{ marginBottom: 14 }}>
            <SectionLabel color="var(--accent-light, #a78bfa)" icon="▶">Now playing</SectionLabel>
            <QueueRow
              song={currentSong} index={0}
              isActive isNowPlaying
              onPlay={onPlay} onRemove={null}
              isDragging={false} isDragOver={false} isHighlighted={false}
              onDragHandlePointerDown={null}
            />
          </div>
        )}

        {safeQueue.length > 0 ? (
          <div>
            <SectionLabel color="var(--text-muted)" icon="⠿">Up next · klik untuk play · drag untuk reorder</SectionLabel>
            {safeQueue.map((item: QueueItem, i: number) => (
              <div
                key={item.uid}
                ref={el => {
                  rowRefs.current[i] = el;
                  if (el) rowRefsMap.current.set(item.uid, el);
                  else rowRefsMap.current.delete(item.uid);
                }}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                style={{
                  touchAction: dragItemRef.current !== null ? "none" : "auto",
                  opacity: dragIdx === i ? 0.25 : 1,
                  transition: dragIdx === null ? "opacity 0.15s" : "none",
                  borderTop: dragOverIdx === i && dragIdx !== i
                    ? "2px solid rgba(124,58,237,0.6)" : "2px solid transparent",
                }}
              >
                <QueueRow
                  song={item.song} index={i + 1}
                  isManual={item.fromManual}
                  isDragging={dragIdx === i}
                  isDragOver={dragOverIdx === i && dragIdx !== i}
                  isHighlighted={highlightedUid === item.uid}
                  onPlay={() => handleQueueItemPlay(item, i)}
                  onRemove={() => removeFromUnified?.(item.uid)}
                  onDragHandlePointerDown={(e) => handleDragHandlePointerDown(e, i)}
                />
              </div>
            ))}
            <div
              ref={el => { rowRefs.current[safeQueue.length] = el; }}
              style={{ height: 10, borderTop: dragOverIdx === safeQueue.length ? "2px solid rgba(124,58,237,0.6)" : "2px solid transparent" }}
            />
          </div>
        ) : (
          <div style={{
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: "36px 20px", textAlign: "center", gap: 14,
          }}>
            <div style={{
              width: 60, height: 60, borderRadius: 16,
              background: "var(--bg-overlay)",
              border: "1px solid var(--border)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24,
              color: "var(--text-faint)",
            }}>
              ≡
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-muted)", marginBottom: 5 }}>Queue is empty</p>
              <p style={{ fontSize: 12, color: "var(--text-faint)", lineHeight: 1.7, maxWidth: 280 }}>
                Right-click a track in the library to add it here,
                or use "Play Next" to queue a track immediately.
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5, width: "100%", maxWidth: 240 }}>
              {[
                { key: "Right-click", desc: "Add to Queue" },
                { key: "Ctrl+click",  desc: "Play Next" },
              ].map(tip => (
                <div key={tip.key} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "6px 11px", borderRadius: "var(--radius-md, 8px)",
                  background: "var(--bg-overlay)", border: "1px solid var(--border)",
                }}>
                  <kbd style={{
                    fontSize: 10, padding: "2px 7px", borderRadius: 4,
                    background: "var(--bg-muted)", border: "1px solid var(--border-medium)",
                    color: "var(--accent-light, #a78bfa)", fontFamily: "'Space Mono', monospace",
                  }}>{tip.key}</kbd>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{tip.desc}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Legend */}
        {safeQueue.length > 0 && manualCount > 0 && (
          <div style={{ display: "flex", gap: 14, padding: "10px 4px", borderTop: "1px solid var(--border-subtle)", marginTop: 8 }}>
            <LegendDot color="#EC4899" label="Manual queue" />
            <LegendDot color="var(--accent-light, #a78bfa)" label="From context" />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionLabel({ children, color, icon }: { children: React.ReactNode; color: string; icon?: string }) {
  return (
    <p style={{
      fontSize: 10, color, textTransform: "uppercase",
      letterSpacing: "0.1em", fontWeight: 700, marginBottom: 6,
      padding: "0 4px", display: "flex", alignItems: "center", gap: 5,
    }}>
      {icon && <span style={{ fontSize: 11 }}>{icon}</span>}
      {children}
    </p>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--text-muted)" }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
      {label}
    </div>
  );
}

function QueueActionBtn({ label, icon, badge, disabled, active, color, colorDim, colorBorder, title, onClick }: {
  label: string; icon: React.ReactNode; badge?: string;
  disabled?: boolean; active?: boolean;
  color: string; colorDim: string; colorBorder: string;
  title?: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: "flex", alignItems: "center", gap: 5,
        padding: "5px 10px", borderRadius: "var(--radius-md, 8px)", fontSize: 11,
        border: `1px solid ${disabled ? "var(--border)" : colorBorder}`,
        background: (active || badge) && !disabled ? colorDim : "transparent",
        color: disabled ? "var(--text-faint)" : color,
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "inherit", opacity: disabled ? 0.45 : 1,
      }}
    >
      {icon}
      <span>{label}</span>
      {badge && (
        <span style={{
          background: colorDim, borderRadius: 10, padding: "0px 5px",
          fontSize: 9, fontFamily: "monospace",
          border: `1px solid ${colorBorder}`,
        }}>
          {badge}
        </span>
      )}
    </button>
  );
}

function QueueRow({ song, index, isActive, isNowPlaying, isManual, isDragging, isDragOver, isHighlighted, onPlay, onRemove, onDragHandlePointerDown }: {
  song: Song; index: number;
  isActive?: boolean; isNowPlaying?: boolean; isManual?: boolean;
  isDragging?: boolean; isDragOver?: boolean; isHighlighted?: boolean;
  onPlay: (s: Song) => void;
  onRemove: (() => void) | null;
  onDragHandlePointerDown: ((e: React.PointerEvent) => void) | null;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "6px 8px", borderRadius: "var(--radius-md, 8px)", marginBottom: 2,
        background: isHighlighted ? "rgba(124,58,237,0.2)"
          : isActive ? "rgba(124,58,237,0.12)"
          : hovered ? "rgba(255,255,255,0.04)" : "transparent",
        border: isHighlighted ? "1px solid rgba(124,58,237,0.5)"
          : isActive ? "1px solid rgba(124,58,237,0.2)"
          : isDragOver ? "1px solid rgba(124,58,237,0.4)"
          : isManual ? "1px solid rgba(236,72,153,0.1)"
          : "1px solid transparent",
        userSelect: "none",
        // [FIX] cursor pointer untuk menunjukkan bisa diklik
        cursor: isNowPlaying ? "default" : "pointer",
        transition: "background 0.1s, border-color 0.1s",
      }}
    >
      {/* Drag handle — hanya muncul saat hover, HANYA ini yang trigger drag */}
      {!isNowPlaying && onDragHandlePointerDown && (
        <span
          onPointerDown={e => {
            e.stopPropagation(); // jangan propagate ke row click
            onDragHandlePointerDown(e);
          }}
          title="Drag to reorder"
          style={{
            color: hovered || isDragging ? (isManual ? "#EC4899" : "var(--accent-light, #a78bfa)") : "transparent",
            fontSize: 14, flexShrink: 0, padding: "4px 2px",
            cursor: "grab", userSelect: "none", touchAction: "none",
            transition: "color 0.15s",
          }}
        >⠿</span>
      )}
      {isNowPlaying && <span style={{ width: 18, flexShrink: 0 }} />}

      {/* Index / playing indicator */}
      <span style={{
        width: 24, textAlign: "center", fontSize: 11,
        color: isActive ? "var(--accent-light, #a78bfa)" : isManual ? "#EC4899" : "var(--text-faint)",
        fontFamily: "monospace", flexShrink: 0, fontWeight: isActive ? 700 : 400,
      }}>
        {isActive ? "▶" : index}
      </span>

      {/* Song info — klik row = play */}
      <div
        onClick={() => !isNowPlaying && onPlay(song)}
        style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, overflow: "hidden" }}
      >
        <CoverArt id={song.id} coverArt={song.cover_art} size={34} />
        <div style={{ flex: 1, overflow: "hidden" }}>
          <div style={{
            fontWeight: 500, fontSize: 13, color: isActive ? "#c4b5fd" : hovered && !isNowPlaying ? "var(--accent-light)" : "var(--text-primary)",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            transition: "color 0.1s",
          }}>
            {song.title}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{song.artist}</div>
        </div>
      </div>

      {/* Manual badge */}
      {isManual && !isNowPlaying && (
        <span style={{
          fontSize: 10, padding: "1px 7px", borderRadius: 10, flexShrink: 0,
          background: "rgba(236,72,153,0.15)", color: "#EC4899",
          border: "1px solid rgba(236,72,153,0.3)", fontWeight: 600,
        }}>
          manual
        </span>
      )}

      {/* Duration */}
      <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace", flexShrink: 0 }}>
        {fmt(song.duration)}
      </span>

      {/* Remove */}
      {onRemove && !isNowPlaying && (
        <button
          onClick={e => { e.stopPropagation(); onRemove(); }}
          style={{
            width: 22, height: 22, borderRadius: "var(--radius-sm, 6px)", fontSize: 12,
            background: "transparent", border: "1px solid transparent",
            color: "var(--text-faint)", cursor: "pointer",
            opacity: hovered ? 1 : 0, transition: "opacity 0.15s, color 0.15s",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.color = "#f87171"; e.currentTarget.style.borderColor = "rgba(239,68,68,0.3)"; }}
          onMouseLeave={e => { e.currentTarget.style.color = "var(--text-faint)"; e.currentTarget.style.borderColor = "transparent"; }}
          title="Remove from queue"
        >✕</button>
      )}
    </div>
  );
}

// Tiny SVG icons
function UndoIcon() {
  return <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7L1 5l2-2"/><path d="M1 5h9a5 5 0 010 10H6"/></svg>;
}
function ShuffleIcon() {
  return <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 15 7 11 7"/><line x1="1" y1="13" x2="15" y2="3"/><polyline points="15 13 15 9 11 9"/><line x1="1" y1="3" x2="6" y2="8"/><line x1="9" y1="11" x2="15" y2="13"/></svg>;
}
function SaveIcon() {
  return <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H3a1 1 0 00-1 1v10a1 1 0 001 1h10a1 1 0 001-1V5l-3-3z"/><polyline points="13 5 10 5 10 2"/><path d="M4 14V9h8v5"/><path d="M6 9V7h4v2"/></svg>;
}
function SearchIcon() {
  return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="7" cy="7" r="5"/><line x1="10.5" y1="10.5" x2="14" y2="14"/></svg>;
}