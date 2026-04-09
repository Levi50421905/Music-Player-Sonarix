/**
 * performance.ts — Utilities untuk optimasi performa
 *
 * WHY file ini penting:
 *   - Search diketik cepat → debounce agar tidak filter tiap keypress
 *   - Scroll handler dipanggil ratusan kali/detik → throttle
 *   - Album grouping dari 10.000 lagu → memoize agar tidak dihitung ulang
 *   - Format badges → cache agar tidak buat object baru tiap render
 */

// ── Debounce ──────────────────────────────────────────────────────────────────
// Delay eksekusi fn sampai X ms setelah panggilan terakhir.
// KAPAN PAKAI: search input, window resize, form auto-save

export function debounce<T extends (...args: unknown[]) => unknown>(fn: T, delay: number): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// ── Throttle ──────────────────────────────────────────────────────────────────
// Batasi fn dipanggil maksimal sekali per X ms.
// KAPAN PAKAI: scroll handler, mousemove, progress bar update

export function throttle<T extends (...args: unknown[]) => unknown>(fn: T, limit: number): (...args: Parameters<T>) => void {
  let lastCall = 0;
  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCall >= limit) {
      lastCall = now;
      fn(...args);
    }
  };
}

// ── Memoize ───────────────────────────────────────────────────────────────────
// Cache hasil fn berdasarkan args. Hitung ulang hanya jika args berubah.
// KAPAN PAKAI: grouping lagu per album/artist, sorting, statistik library

export function memoize<T extends (...args: unknown[]) => unknown>(fn: T): T {
  const cache = new Map<string, ReturnType<T>>();
  return ((...args: Parameters<T>) => {
    const key = JSON.stringify(args);
    if (cache.has(key)) return cache.get(key) as ReturnType<T>;
    const result = fn(...args) as ReturnType<T>;
    cache.set(key, result);
    return result;
  }) as T;
}

// ── Format helpers (cached) ───────────────────────────────────────────────────

const durationCache = new Map<number, string>();
export function formatDuration(seconds: number): string {
  const key = Math.floor(seconds);
  if (durationCache.has(key)) return durationCache.get(key)!;
  const m = Math.floor(key / 60);
  const s = key % 60;
  const result = `${m}:${String(s).padStart(2, "0")}`;
  durationCache.set(key, result);
  return result;
}

export function formatBitrate(bitrate: number): string {
  return bitrate >= 1000
    ? `${(bitrate / 1000).toFixed(0)}k`
    : `${bitrate}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

// ── Virtual list helper ───────────────────────────────────────────────────────
// Untuk library dengan 10.000+ lagu, hanya render baris yang terlihat.
// WHY: tanpa ini, DOM punya 10.000 <tr> → sangat lambat

interface VirtualListOptions {
  itemCount: number;
  itemHeight: number;
  containerHeight: number;
  scrollTop: number;
  overscan?: number; // render ekstra di atas/bawah viewport (default: 3)
}

interface VirtualListResult {
  startIndex: number;
  endIndex: number;
  offsetY: number;       // padding-top untuk spacer
  totalHeight: number;   // total tinggi semua item
}

export function getVirtualListRange({
  itemCount,
  itemHeight,
  containerHeight,
  scrollTop,
  overscan = 3,
}: VirtualListOptions): VirtualListResult {
  const totalHeight = itemCount * itemHeight;
  const startIndex  = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const visibleCount = Math.ceil(containerHeight / itemHeight);
  const endIndex    = Math.min(itemCount - 1, startIndex + visibleCount + overscan * 2);
  const offsetY     = startIndex * itemHeight;

  return { startIndex, endIndex, offsetY, totalHeight };
}