/**
 * ToastSystem.tsx — v3 (Design Refresh)
 *
 * PERUBAHAN vs v2:
 *   [DESIGN] Semua warna pakai CSS variable
 *   [DESIGN] Border radius konsisten dengan sistem
 *   [DESIGN] Shadow lebih subtle
 *   [DESIGN] Action button lebih clean
 */

import { useState, useEffect, useRef } from "react";
import { create } from "zustand";

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
  action?: ToastAction;
}

// ── Store ──────────────────────────────────────────────────────────────────────
interface ToastStore {
  toasts: Toast[];
  add: (toast: Omit<Toast, "id">) => string;
  remove: (id: string) => void;
}

const MAX_TOASTS = 4;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  add: (toast) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }].slice(-MAX_TOASTS) }));
    return id;
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

// ── Helpers ────────────────────────────────────────────────────────────────────
export function toast(message: string, type: ToastType = "info", duration?: number, action?: ToastAction) {
  const d = action ? 6000 : type === "error" ? 5000 : 3500;
  useToastStore.getState().add({ message, type, duration: duration ?? d, action });
}

export const toastSuccess = (msg: string, action?: ToastAction) => toast(msg, "success", undefined, action);
export const toastError   = (msg: string, action?: ToastAction) => toast(msg, "error",   undefined, action);
export const toastWarning = (msg: string, action?: ToastAction) => toast(msg, "warning", undefined, action);
export const toastInfo    = (msg: string, action?: ToastAction) => toast(msg, "info",    undefined, action);

// ── Type config ───────────────────────────────────────────────────────────────
const TYPE_CONFIG = {
  success: {
    bg:     "rgba(16,185,129,0.1)",
    border: "rgba(16,185,129,0.3)",
    bar:    "#10B981",
    icon:   "✓",
    iconBg: "#10B981",
    color:  "#34D399",
  },
  error: {
    bg:     "rgba(239,68,68,0.1)",
    border: "rgba(239,68,68,0.3)",
    bar:    "#EF4444",
    icon:   "✕",
    iconBg: "#EF4444",
    color:  "#f87171",
  },
  warning: {
    bg:     "rgba(245,158,11,0.1)",
    border: "rgba(245,158,11,0.3)",
    bar:    "#F59E0B",
    icon:   "!",
    iconBg: "#F59E0B",
    color:  "#FBBF24",
  },
  info: {
    bg:     "rgba(124,58,237,0.1)",
    border: "rgba(124,58,237,0.3)",
    bar:    "var(--accent, #7C3AED)",
    icon:   "i",
    iconBg: "var(--accent, #7C3AED)",
    color:  "var(--accent-light, #a78bfa)",
  },
};

// ── Toast item ─────────────────────────────────────────────────────────────────
function ToastItem({ toast: t, onRemove }: { toast: Toast; onRemove: () => void }) {
  const [visible, setVisible]   = useState(false);
  const [exiting, setExiting]   = useState(false);
  const [progress, setProgress] = useState(100);
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef    = useRef<number>(0);
  const startRef  = useRef<number>(0);
  const duration  = t.duration ?? 3500;
  const cfg = TYPE_CONFIG[t.type];

  const dismiss = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    cancelAnimationFrame(rafRef.current);
    setExiting(true);
    setTimeout(onRemove, 250);
  };

  useEffect(() => {
    const enter = setTimeout(() => setVisible(true), 10);
    startRef.current = Date.now();
    const tick = () => {
      const pct = Math.max(0, 100 - ((Date.now() - startRef.current) / duration) * 100);
      setProgress(pct);
      if (pct > 0) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    timerRef.current = setTimeout(dismiss, duration);
    return () => {
      clearTimeout(enter);
      if (timerRef.current) clearTimeout(timerRef.current);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      background: cfg.bg,
      border: `1px solid ${cfg.border}`,
      borderRadius: "var(--radius-lg, 12px)",
      backdropFilter: "blur(16px)",
      maxWidth: 330, minWidth: 240,
      boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
      overflow: "hidden",
      transform: visible && !exiting ? "translateX(0) scale(1)" : "translateX(20px) scale(0.96)",
      opacity: visible && !exiting ? 1 : 0,
      transition: "transform 0.25s cubic-bezier(0.34,1.56,0.64,1), opacity 0.25s ease",
    }}>
      {/* Main row */}
      <div
        onClick={t.action ? undefined : dismiss}
        style={{
          display: "flex", alignItems: "center", gap: 9,
          padding: t.action ? "10px 13px 7px" : "10px 13px",
          cursor: t.action ? "default" : "pointer",
        }}
      >
        {/* Icon */}
        <div style={{
          width: 20, height: 20, borderRadius: "50%",
          background: cfg.iconBg,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontWeight: 700, color: "white", flexShrink: 0,
        }}>
          {cfg.icon}
        </div>

        {/* Message */}
        <span style={{
          fontSize: 12, color: "var(--text-primary)", lineHeight: 1.4, flex: 1,
        }}>
          {t.message}
        </span>

        {/* Close */}
        <button onClick={dismiss} style={{
          background: "none", border: "none", cursor: "pointer",
          color: "var(--text-faint)", fontSize: 14, padding: "0 0 0 4px", lineHeight: 1,
          flexShrink: 0, transition: "color 0.15s",
        }}
          onMouseEnter={e => e.currentTarget.style.color = "var(--text-secondary)"}
          onMouseLeave={e => e.currentTarget.style.color = "var(--text-faint)"}
        >×</button>
      </div>

      {/* Action row */}
      {t.action && (
        <div style={{ padding: "0 13px 9px", display: "flex", gap: 5 }}>
          <button
            onClick={() => { t.action!.onClick(); dismiss(); }}
            style={{
              padding: "4px 11px", borderRadius: "var(--radius-sm, 6px)", fontSize: 11,
              background: `${cfg.iconBg}22`,
              border: `1px solid ${cfg.border}`,
              color: cfg.color, cursor: "pointer",
              fontFamily: "inherit", fontWeight: 600,
              transition: "opacity 0.15s",
            }}
          >
            {t.action.label}
          </button>
          <button onClick={dismiss} style={{
            padding: "4px 9px", borderRadius: "var(--radius-sm, 6px)", fontSize: 11,
            background: "transparent", border: "1px solid var(--border-medium)",
            color: "var(--text-muted)", cursor: "pointer", fontFamily: "inherit",
          }}>
            Dismiss
          </button>
        </div>
      )}

      {/* Progress bar */}
      <div style={{ height: 2, background: "rgba(255,255,255,0.05)" }}>
        <div style={{
          height: "100%", width: `${progress}%`,
          background: cfg.bar, opacity: 0.55,
          transition: "width 0.1s linear",
        }} />
      </div>
    </div>
  );
}

// ── Container ──────────────────────────────────────────────────────────────────
export default function ToastContainer() {
  const { toasts, remove } = useToastStore();

  return (
    <div style={{
      position: "fixed",
      bottom: 140, right: 18,
      zIndex: 9999,
      display: "flex", flexDirection: "column", gap: 7,
      pointerEvents: "none",
    }}>
      {toasts.map((t) => (
        <div key={t.id} style={{ pointerEvents: "auto" }}>
          <ToastItem toast={t} onRemove={() => remove(t.id)} />
        </div>
      ))}
    </div>
  );
}