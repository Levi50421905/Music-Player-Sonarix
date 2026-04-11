/**
 * ToastSystem.tsx — Global Toast Notification System
 * #19: User feedback untuk semua action penting
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { create } from "zustand";

export type ToastType = "success" | "error" | "info" | "warning";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

// ── Toast Store ───────────────────────────────────────────────────────────────
interface ToastStore {
  toasts: Toast[];
  add: (toast: Omit<Toast, "id">) => void;
  remove: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  add: (toast) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
    return id;
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

// ── Helper functions ──────────────────────────────────────────────────────────
export function toast(message: string, type: ToastType = "info", duration = 3500) {
  useToastStore.getState().add({ message, type, duration });
}

export const toastSuccess = (msg: string) => toast(msg, "success");
export const toastError   = (msg: string) => toast(msg, "error", 5000);
export const toastWarning = (msg: string) => toast(msg, "warning");
export const toastInfo    = (msg: string) => toast(msg, "info");

// ── Single Toast Item ─────────────────────────────────────────────────────────
function ToastItem({ toast: t, onRemove }: { toast: Toast; onRemove: () => void }) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Entrance
    const enterTimer = setTimeout(() => setVisible(true), 10);

    // Auto-dismiss
    timerRef.current = setTimeout(() => {
      setExiting(true);
      setTimeout(onRemove, 320);
    }, t.duration ?? 3500);

    return () => {
      clearTimeout(enterTimer);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleClick = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setExiting(true);
    setTimeout(onRemove, 320);
  };

  const cfg = {
    success: {
      icon: "✓",
      bg: "rgba(16,185,129,0.12)",
      border: "rgba(16,185,129,0.35)",
      iconBg: "#10B981",
      color: "#34D399",
    },
    error: {
      icon: "✕",
      bg: "rgba(239,68,68,0.12)",
      border: "rgba(239,68,68,0.35)",
      iconBg: "#EF4444",
      color: "#f87171",
    },
    warning: {
      icon: "⚠",
      bg: "rgba(245,158,11,0.12)",
      border: "rgba(245,158,11,0.35)",
      iconBg: "#F59E0B",
      color: "#FBBF24",
    },
    info: {
      icon: "i",
      bg: "rgba(124,58,237,0.12)",
      border: "rgba(124,58,237,0.35)",
      iconBg: "#7C3AED",
      color: "#a78bfa",
    },
  }[t.type];

  return (
    <div
      onClick={handleClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        borderRadius: 10,
        backdropFilter: "blur(16px)",
        cursor: "pointer",
        maxWidth: 340,
        minWidth: 220,
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        transform: visible && !exiting
          ? "translateX(0) scale(1)"
          : exiting
          ? "translateX(16px) scale(0.95)"
          : "translateX(16px) scale(0.95)",
        opacity: visible && !exiting ? 1 : 0,
        transition: "transform 0.28s cubic-bezier(0.34,1.56,0.64,1), opacity 0.28s ease",
      }}
    >
      <div style={{
        width: 22,
        height: 22,
        borderRadius: "50%",
        background: cfg.iconBg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 11,
        fontWeight: 700,
        color: "white",
        flexShrink: 0,
      }}>
        {cfg.icon}
      </div>
      <span style={{
        fontSize: 12,
        color: "#e2e8f0",
        lineHeight: 1.4,
        flex: 1,
      }}>
        {t.message}
      </span>
    </div>
  );
}

// ── Toast Container ───────────────────────────────────────────────────────────
export default function ToastContainer() {
  const { toasts, remove } = useToastStore();

  return (
    <div style={{
      position: "fixed",
      bottom: 100,
      right: 20,
      zIndex: 9999,
      display: "flex",
      flexDirection: "column",
      gap: 8,
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