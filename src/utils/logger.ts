/**
 * logger.ts — Structured Logger & Crash Reporter
 *
 * WHY logger yang proper:
 *   console.log tersebar di mana-mana = susah debug.
 *   Logger terpusat bisa: filter level, format konsisten,
 *   simpan ke file untuk bug report, dan mati otomatis di production.
 *
 * LEVELS: debug < info < warn < error
 * Di production, hanya warn dan error yang tampil.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const COLORS: Record<LogLevel, string> = {
  debug: "#6b7280",
  info:  "#3B82F6",
  warn:  "#F59E0B",
  error: "#EF4444",
};

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0, info: 1, warn: 2, error: 3,
};

class Logger {
  private minLevel: LogLevel = import.meta.env.DEV ? "debug" : "warn";
  private history: { level: LogLevel; module: string; message: string; data?: unknown; ts: number }[] = [];

  private log(level: LogLevel, module: string, message: string, data?: unknown) {
    if (LEVEL_RANK[level] < LEVEL_RANK[this.minLevel]) return;

    const entry = { level, module, message, data, ts: Date.now() };
    this.history.push(entry);
    if (this.history.length > 500) this.history.shift(); // keep last 500

    const color = COLORS[level];
    const time  = new Date().toISOString().slice(11, 23);
    const prefix = `%c[${level.toUpperCase()}]%c [${module}] ${time}`;

    if (data !== undefined) {
      console[level === "debug" ? "log" : level](prefix, `color:${color};font-weight:bold`, "color:inherit", message, data);
    } else {
      console[level === "debug" ? "log" : level](prefix, `color:${color};font-weight:bold`, "color:inherit", message);
    }
  }

  debug(module: string, message: string, data?: unknown) { this.log("debug", module, message, data); }
  info (module: string, message: string, data?: unknown) { this.log("info",  module, message, data); }
  warn (module: string, message: string, data?: unknown) { this.log("warn",  module, message, data); }
  error(module: string, message: string, data?: unknown) { this.log("error", module, message, data); }

  /** Export log history sebagai text untuk bug report */
  export(): string {
    return this.history
      .map(e => `[${new Date(e.ts).toISOString()}] [${e.level.toUpperCase()}] [${e.module}] ${e.message}${e.data ? " | " + JSON.stringify(e.data) : ""}`)
      .join("\n");
  }

  /** Clear history */
  clear() { this.history = []; }
}

export const logger = new Logger();

// ── Global error handler ──────────────────────────────────────────────────────
// Tangkap error yang tidak ter-handle agar masuk ke log

if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (e) => {
    logger.error("Global", "Unhandled Promise rejection", {
      reason: e.reason?.message ?? String(e.reason),
      stack: e.reason?.stack,
    });
  });

  window.addEventListener("error", (e) => {
    logger.error("Global", "Uncaught error", {
      message: e.message,
      filename: e.filename,
      line: e.lineno,
    });
  });
}

// ── Convenience module loggers ────────────────────────────────────────────────
// Buat logger per-module agar lebih mudah filter

export const dbLogger       = { ...logger, debug: (m: string, d?: unknown) => logger.debug("DB", m, d),       warn: (m: string, d?: unknown) => logger.warn("DB", m, d),       error: (m: string, d?: unknown) => logger.error("DB", m, d)       };
export const audioLogger    = { ...logger, debug: (m: string, d?: unknown) => logger.debug("Audio", m, d),    info: (m: string, d?: unknown) => logger.info("Audio", m, d),     error: (m: string, d?: unknown) => logger.error("Audio", m, d)    };
export const scannerLogger  = { ...logger, info:  (m: string, d?: unknown) => logger.info("Scanner", m, d),   warn: (m: string, d?: unknown) => logger.warn("Scanner", m, d),   error: (m: string, d?: unknown) => logger.error("Scanner", m, d)  };