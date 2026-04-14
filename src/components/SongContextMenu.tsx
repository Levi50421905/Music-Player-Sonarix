/**
 * SongContextMenu.tsx — Shared context menu for songs
 * Used in LibraryView, AlbumView, ArtistView, FolderView, Dashboard
 */

import React, { useEffect, useRef } from "react";
import type { Song } from "../../lib/db";

export interface Playlist {
  id: number;
  name: string;
  count: number;
  created_at: string;
}

interface Props {
  x: number;
  y: number;
  songs: Song[];           // selected songs (1 or many)
  playlists: Playlist[];
  onClose: () => void;
  onPlayNow: (songs: Song[]) => void;
  onPlayNext: (songs: Song[]) => void;
  onAddToQueue: (songs: Song[]) => void;
  onAddToPlaylist: (playlistId: number, songs: Song[]) => void;
  onToggleLoved?: (song: Song) => void;   // only shown for single song
  onShowInFolder?: (song: Song) => void;  // only shown for single song
  onDelete: (songs: Song[]) => void;
}

function clamp(x: number, y: number, w = 230, h = 380) {
  return {
    x: Math.min(x, window.innerWidth  - w - 8),
    y: Math.min(y, window.innerHeight - h - 8),
  };
}

export default function SongContextMenu({
  x, y, songs, playlists,
  onClose, onPlayNow, onPlayNext, onAddToQueue,
  onAddToPlaylist, onToggleLoved, onShowInFolder, onDelete,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [showPlaylistSub, setShowPlaylistSub] = React.useState(false);
  const pos = clamp(x, y);
  const single = songs.length === 1 ? songs[0] : null;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const keyHandler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        zIndex: 9000,
        background: "var(--bg-overlay)",
        border: "1px solid var(--border-medium)",
        borderRadius: "var(--radius-lg, 12px)",
        padding: 5,
        minWidth: 220,
        boxShadow: "0 12px 40px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.03)",
        backdropFilter: "blur(12px)",
      }}
    >
      {/* Header */}
      <div style={{ padding: "6px 10px 8px", borderBottom: "1px solid var(--border-subtle)", marginBottom: 4 }}>
        {single ? (
          <>
            <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {single.title}
            </p>
            <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>{single.artist}</p>
          </>
        ) : (
          <p style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-light, #a78bfa)" }}>
            {songs.length} tracks selected
          </p>
        )}
      </div>

      <Item icon={<PlayIcon />}  label="Putar sekarang"    onClick={() => { onPlayNow(songs);   onClose(); }} />
      <Item icon={<NextIcon />}  label="Putar berikutnya"  onClick={() => { onPlayNext(songs);  onClose(); }} />
      <Item icon={<QueueIcon />} label="Tambah ke antrian" onClick={() => { onAddToQueue(songs); onClose(); }} />

      {/* Add to playlist */}
      <div style={{ position: "relative" }}>
        <Item
          icon={<PlaylistIcon />}
          label="Tambah ke playlist ›"
          onClick={e => { e.stopPropagation(); setShowPlaylistSub(v => !v); }}
        />
        {showPlaylistSub && (
          <div style={{
            position: "absolute",
            left: "100%",
            top: 0,
            background: "var(--bg-overlay)",
            border: "1px solid var(--border-medium)",
            borderRadius: "var(--radius-lg, 12px)",
            padding: 5,
            minWidth: 180,
            boxShadow: "0 12px 40px rgba(0,0,0,0.8)",
            zIndex: 1,
          }}>
            {playlists.length === 0 ? (
              <p style={{ fontSize: 11, color: "var(--text-faint)", padding: "6px 12px" }}>Belum ada playlist</p>
            ) : (
              playlists.map(pl => (
                <Item
                  key={pl.id}
                  icon={<span style={{ fontSize: 11 }}>♫</span>}
                  label={pl.name}
                  onClick={() => { onAddToPlaylist(pl.id, songs); onClose(); }}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* Single-song extras */}
      {single && (
        <>
          <div style={{ height: 1, background: "var(--border-subtle)", margin: "4px 0" }} />
          {onShowInFolder && (
            <Item icon={<FolderIcon />} label="Tampilkan di folder" onClick={() => { onShowInFolder(single); onClose(); }} />
          )}
          {onToggleLoved && (
            <Item
              icon={<span style={{ fontSize: 12 }}>{single.loved ? "💔" : "❤"}</span>}
              label={single.loved ? "Hapus dari favorit" : "Tambah ke favorit"}
              onClick={() => { onToggleLoved(single); onClose(); }}
            />
          )}
        </>
      )}

      <div style={{ height: 1, background: "var(--border-subtle)", margin: "4px 0" }} />
      <Item
        icon={<TrashIcon />}
        label={`Hapus dari library${songs.length > 1 ? ` (${songs.length})` : ""}`}
        danger
        onClick={() => { onDelete(songs); onClose(); }}
      />
    </div>
  );
}

// ── Confirm Delete Modal ──────────────────────────────────────────────────────

interface ConfirmDeleteProps {
  songs: Song[];
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDeleteModal({ songs, onConfirm, onCancel }: ConfirmDeleteProps) {
  const [step, setStep] = React.useState(1);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9100,
        background: step === 2 ? "rgba(0,0,0,0.85)" : "rgba(0,0,0,0.7)",
        backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: "var(--bg-overlay)",
          border: step === 2 ? "2px solid rgba(239,68,68,0.5)" : "1px solid var(--border-medium)",
          borderRadius: "var(--radius-xl, 16px)",
          padding: "26px 30px",
          maxWidth: 360,
          textAlign: "center",
          boxShadow: "0 24px 60px rgba(0,0,0,0.7)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {step === 1 ? (
          <>
            <div style={{
              width: 48, height: 48, borderRadius: 14, margin: "0 auto 14px",
              background: "var(--danger-dim, rgba(239,68,68,0.12))",
              border: "1px solid rgba(239,68,68,0.3)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
            }}>
              <TrashIcon />
            </div>
            <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 8, color: "var(--text-primary)" }}>
              Hapus dari library?
            </h3>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 5, lineHeight: 1.6 }}>
              <strong style={{ color: "var(--text-primary)" }}>{songs.length} lagu</strong> akan dihapus dari library.
            </p>
            <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 20 }}>
              File audio di disk tidak terpengaruh. Kamu bisa undo.
            </p>
            <div style={{ display: "flex", gap: 9, justifyContent: "center" }}>
              <button onClick={onCancel} style={{
                padding: "7px 20px", borderRadius: "var(--radius-md, 8px)", fontSize: 13,
                background: "transparent", border: "1px solid var(--border-medium)",
                color: "var(--text-secondary)", cursor: "pointer", fontFamily: "inherit",
              }}>Batal</button>
              <button onClick={() => setStep(2)} style={{
                padding: "7px 20px", borderRadius: "var(--radius-md, 8px)", fontSize: 13,
                background: "var(--danger-dim, rgba(239,68,68,0.2))", border: "1px solid rgba(239,68,68,0.5)",
                color: "#f87171", cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
              }}>Lanjutkan →</button>
            </div>
          </>
        ) : (
          <>
            <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 8, color: "#f87171" }}>
              Konfirmasi penghapusan
            </h3>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 5 }}>
              <strong style={{ color: "#f87171" }}>{songs.length} lagu</strong> akan dihapus permanen dari library.
            </p>
            <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 22 }}>Tindakan ini tidak bisa diurungkan.</p>
            <div style={{ display: "flex", gap: 9, justifyContent: "center" }}>
              <button onClick={onCancel} style={{
                padding: "7px 20px", borderRadius: "var(--radius-md, 8px)", fontSize: 13,
                background: "transparent", border: "1px solid var(--border-medium)",
                color: "var(--text-secondary)", cursor: "pointer", fontFamily: "inherit",
              }}>Batal</button>
              <button onClick={onConfirm} style={{
                padding: "7px 20px", borderRadius: "var(--radius-md, 8px)", fontSize: 13,
                background: "#EF4444", border: "1px solid #EF4444",
                color: "white", cursor: "pointer", fontFamily: "inherit", fontWeight: 700,
              }}>Hapus sekarang</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Bulk Action Bar ───────────────────────────────────────────────────────────

interface BulkActionBarProps {
  count: number;
  playlists: Playlist[];
  onPlayNow: () => void;
  onPlayNext: () => void;
  onAddToQueue: () => void;
  onAddToPlaylist: (playlistId: number) => void;
  onDelete: () => void;
  onClear: () => void;
}

export function BulkActionBar({
  count, playlists,
  onPlayNow, onPlayNext, onAddToQueue, onAddToPlaylist, onDelete, onClear,
}: BulkActionBarProps) {
  const [showPlaylists, setShowPlaylists] = React.useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showPlaylists) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setShowPlaylists(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showPlaylists]);

  return (
    <div ref={ref} style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "6px 10px",
      background: "var(--accent-dim, rgba(124,58,237,0.15))",
      border: "1px solid var(--accent-border, rgba(124,58,237,0.3))",
      borderRadius: "var(--radius-md, 8px)",
      flexWrap: "wrap",
    }}>
      <span style={{ fontSize: 12, color: "var(--accent-light, #a78bfa)", fontWeight: 700, marginRight: 4 }}>
        {count} dipilih
      </span>

      <BulkBtn label="▶ Putar"      onClick={onPlayNow} />
      <BulkBtn label="⏭ Berikutnya" onClick={onPlayNext} />
      <BulkBtn label="+ Antrian"    onClick={onAddToQueue} />

      {/* Playlist dropdown */}
      <div style={{ position: "relative" }}>
        <BulkBtn label="♫ Playlist ▾" onClick={() => setShowPlaylists(v => !v)} />
        {showPlaylists && (
          <div style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0,
            background: "var(--bg-overlay)", border: "1px solid var(--border-medium)",
            borderRadius: "var(--radius-lg, 12px)", padding: 5, zIndex: 200,
            minWidth: 160, boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
          }}>
            {playlists.length === 0 ? (
              <p style={{ fontSize: 11, color: "var(--text-faint)", padding: "6px 12px" }}>Belum ada playlist</p>
            ) : (
              playlists.map(pl => (
                <button key={pl.id} onClick={() => { onAddToPlaylist(pl.id); setShowPlaylists(false); }} style={{
                  display: "block", width: "100%", padding: "6px 12px",
                  background: "transparent", border: "none",
                  color: "var(--text-secondary)", fontSize: 12,
                  cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                  borderRadius: "var(--radius-sm, 6px)",
                }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(124,58,237,0.1)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  {pl.name}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <BulkBtn label="🗑 Hapus" danger onClick={onDelete} />

      <button onClick={onClear} style={{
        marginLeft: "auto", background: "none", border: "none",
        cursor: "pointer", color: "var(--text-faint)", fontSize: 14, padding: "2px 4px",
      }}
        onMouseEnter={e => e.currentTarget.style.color = "var(--text-primary)"}
        onMouseLeave={e => e.currentTarget.style.color = "var(--text-faint)"}
        title="Batalkan pilihan"
      >✕</button>
    </div>
  );
}

function BulkBtn({ label, onClick, danger = false }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} style={{
      padding: "4px 10px", borderRadius: "var(--radius-sm, 6px)", fontSize: 11,
      background: danger ? "rgba(239,68,68,0.1)" : "transparent",
      border: `1px solid ${danger ? "rgba(239,68,68,0.35)" : "var(--border-medium)"}`,
      color: danger ? "#f87171" : "var(--text-secondary)",
      cursor: "pointer", fontFamily: "inherit",
    }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = danger ? "rgba(239,68,68,0.6)" : "var(--accent-border, rgba(124,58,237,0.4))";
        e.currentTarget.style.color = danger ? "#f87171" : "var(--accent-light, #a78bfa)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = danger ? "rgba(239,68,68,0.35)" : "var(--border-medium)";
        e.currentTarget.style.color = danger ? "#f87171" : "var(--text-secondary)";
      }}
    >
      {label}
    </button>
  );
}

// ── Helper: shared item component ─────────────────────────────────────────────
function Item({ icon, label, onClick, danger = false }: {
  icon: React.ReactNode; label: string;
  onClick: (e: React.MouseEvent) => void; danger?: boolean;
}) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 8,
      width: "100%", padding: "7px 10px", textAlign: "left",
      background: "none", border: "none",
      color: danger ? "#f87171" : "var(--text-secondary)",
      fontSize: 12, cursor: "pointer", borderRadius: "var(--radius-sm, 6px)",
      fontFamily: "inherit",
    }}
      onMouseEnter={e => {
        e.currentTarget.style.background = danger ? "rgba(239,68,68,0.1)" : "rgba(255,255,255,0.05)";
        e.currentTarget.style.color = danger ? "#f87171" : "var(--text-primary)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = danger ? "#f87171" : "var(--text-secondary)";
      }}
    >
      <span style={{ width: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: 0.75 }}>{icon}</span>
      {label}
    </button>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────
const PlayIcon     = () => <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><polygon points="3 2 13 8 3 14"/></svg>;
const NextIcon     = () => <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="2 3 10 8 2 13"/><line x1="13" y1="3" x2="13" y2="13"/></svg>;
const QueueIcon    = () => <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M1 4h14M1 8h9M1 12h11"/></svg>;
const PlaylistIcon = () => <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M1 4h14M1 8h8M1 12h8"/><polygon points="11 10 15 12 11 14"/></svg>;
const FolderIcon   = () => <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M1 4a1 1 0 011-1h3l2 2h7a1 1 0 011 1v6a1 1 0 01-1 1H2a1 1 0 01-1-1V4z"/></svg>;
const TrashIcon    = () => <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><polyline points="2 4 14 4"/><path d="M5 4V2h6v2M6 7v5M10 7v5"/><path d="M3 4l1 10h8l1-10"/></svg>;