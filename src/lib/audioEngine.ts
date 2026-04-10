/**
 * audioEngine.ts — Web Audio API Wrapper (v2 — Race-condition-safe)
 *
 * FIXES vs v1:
 *  1. Decode lock map  → same file is never decoded twice simultaneously
 *  2. Play token       → stale play() calls are discarded (no more AbortError spam)
 *  3. LRU blob-URL cache (max 30 entries) → prevents memory leak
 *  4. Preload cancel   → switching tracks cancels the old preload immediately
 *  5. Decode cancel    → switching tracks aborts in-flight Rust decode
 *  6. Silent error handling → no more EncodingError / AbortError noise in console
 */

import { convertFileSrc } from "@tauri-apps/api/core";
import { invoke }         from "@tauri-apps/api/core";

export type RepeatMode = "off" | "one" | "all";
export const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

// ─── Formats that need Rust-side decode ──────────────────────────────────────
const NEEDS_DECODE = new Set(["flac", "ape", "wma", "alac"]);

function getExt(p: string): string {
  return p.replace(/\\/g, "/").split(".").pop()?.toLowerCase() ?? "";
}

// ─── LRU blob-URL cache ───────────────────────────────────────────────────────
// Keeps the last N decoded tracks in memory as blob URLs.
// When evicted the blob URL is revoked to free memory.
const LRU_MAX = 30;

class LRUCache {
  private map = new Map<string, string>(); // filepath → blob URL

  get(key: string): string | undefined {
    if (!this.map.has(key)) return undefined;
    // Refresh recency: delete + re-insert
    const val = this.map.get(key)!;
    this.map.delete(key);
    this.map.set(key, val);
    return val;
  }

  set(key: string, value: string): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > LRU_MAX) {
      // Evict the oldest entry (first key in insertion order)
      const oldest = this.map.keys().next().value;
      if (oldest) {
        URL.revokeObjectURL(this.map.get(oldest)!);
        this.map.delete(oldest);
      }
    }
  }

  has(key: string): boolean { return this.map.has(key); }
}

const blobUrlCache = new LRUCache();

// ─── Decode lock ──────────────────────────────────────────────────────────────
// filepath → Promise<string>  (shared by concurrent callers)
const decodeInFlight = new Map<string, Promise<string>>();

// ─── Active decode token ──────────────────────────────────────────────────────
// Used to cancel a Rust decode that is no longer needed.
// We cannot truly cancel the Rust invoke, but we can discard its result.
let decodeToken = 0; // monotonically increasing

function base64ToBlob(base64: string, type: string): Blob {
  const chunkSize = 65_536;
  const binary    = atob(base64);
  const len       = binary.length;
  const buf       = new Uint8Array(len);
  for (let i = 0; i < len; i += chunkSize) {
    const end = Math.min(i + chunkSize, len);
    for (let j = i; j < end; j++) buf[j] = binary.charCodeAt(j);
  }
  return new Blob([buf], { type });
}

/**
 * Return a playable URL for the given file path.
 *
 * For native formats (mp3, ogg, …) this is instant (convertFileSrc).
 * For NEEDS_DECODE formats the Rust backend decodes to WAV once,
 * the result is cached in the LRU, and concurrent callers share a
 * single in-flight Promise so the decode only runs once.
 */
async function getPlayableUrl(filePath: string): Promise<string> {
  const ext = getExt(filePath);

  if (!NEEDS_DECODE.has(ext)) return convertFileSrc(filePath);

  // Cache hit — fast path
  const cached = blobUrlCache.get(filePath);
  if (cached) return cached;

  // If another caller is already decoding this file, piggy-back on it
  const existing = decodeInFlight.get(filePath);
  if (existing) return existing;

  // Start a new decode
  const myToken = ++decodeToken;

  const promise = (async (): Promise<string> => {
    try {
      const base64wav = await invoke<string>("decode_audio_to_wav", { path: filePath });

      // Discard if a newer request has taken over
      if (decodeToken !== myToken) throw new Error("stale-decode");

      const url = URL.createObjectURL(base64ToBlob(base64wav, "audio/wav"));
      blobUrlCache.set(filePath, url);
      return url;
    } finally {
      decodeInFlight.delete(filePath);
    }
  })();

  decodeInFlight.set(filePath, promise);
  return promise;
}

// ─── Background pre-decode ────────────────────────────────────────────────────
// Silently pre-decode the NEXT track so it is in cache before it is needed.
export async function preDecodeFile(filePath: string): Promise<void> {
  const ext = getExt(filePath);
  if (!NEEDS_DECODE.has(ext)) return;
  if (blobUrlCache.has(filePath)) return;
  if (decodeInFlight.has(filePath)) return;
  try {
    await getPlayableUrl(filePath);
  } catch {
    // Background decode failures are silently ignored
  }
}

// ─── AudioEngine ─────────────────────────────────────────────────────────────
export class AudioEngine {
  private ctx:       AudioContext | null = null;
  private gainNode:  GainNode    | null = null;
  private analyser:  AnalyserNode| null = null;
  private eqFilters: BiquadFilterNode[] = [];
  private source:    MediaElementAudioSourceNode | null = null;
  private audioEl:   HTMLAudioElement | null = null;

  // Secondary element used only for buffering (silent)
  private preloadEl:   HTMLAudioElement | null = null;
  private preloadPath: string | null = null;

  private _volume  = 0.8;
  private _eqGains = new Array<number>(10).fill(0);

  // Play-token: incremented on every play() call.
  // The async continuation checks it to detect stale plays.
  private _playToken = 0;

  private _onEnded:         (() => void)           | null = null;
  private _onTimeUpdate:    ((t: number) => void)  | null = null;
  private _onLoadedMetadata:((d: number) => void)  | null = null;

  // ── Init ──────────────────────────────────────────────────────────────────
  async init(): Promise<void> {
    if (this.audioEl) return;

    this.audioEl          = new Audio();
    this.audioEl.crossOrigin = "anonymous";
    this.audioEl.preload  = "auto";

    this.preloadEl        = new Audio();
    this.preloadEl.preload = "auto";
    this.preloadEl.volume  = 0;

    this.audioEl.addEventListener("ended",
      () => this._onEnded?.());
    this.audioEl.addEventListener("timeupdate",
      () => this.audioEl && this._onTimeUpdate?.(this.audioEl.currentTime));
    this.audioEl.addEventListener("loadedmetadata",
      () => this.audioEl && this._onLoadedMetadata?.(this.audioEl.duration));
    // Suppress noisy error events — we handle errors in play()
    this.audioEl.addEventListener("error", () => {});

    try {
      this.ctx      = new AudioContext();
      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.value = this._volume;

      this.eqFilters = EQ_FREQUENCIES.map(freq => {
        const f = this.ctx!.createBiquadFilter();
        f.type            = "peaking";
        f.frequency.value = freq;
        f.Q.value         = 1.0;
        f.gain.value      = 0;
        return f;
      });

      this.analyser                    = this.ctx.createAnalyser();
      this.analyser.fftSize            = 256;
      this.analyser.smoothingTimeConstant = 0.8;

      this.source = this.ctx.createMediaElementSource(this.audioEl);
      this.source.connect(this.gainNode);

      let prev: AudioNode = this.gainNode;
      for (const f of this.eqFilters) { prev.connect(f); prev = f; }
      prev.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
      if (this.audioEl) this.audioEl.volume = this._volume;
    }
  }

  // ── play() ────────────────────────────────────────────────────────────────
  /**
   * Play a file. Cancels any in-progress play for a different file.
   * Safe to call rapidly (only the last call "wins").
   */
  async play(filePath: string): Promise<void> {
    await this.ensureInit();

    // Grab a token — if a newer play() is called before we finish decoding,
    // our token will be stale and we bail out early.
    const myToken = ++this._playToken;

    // Invalidate preload for a different path
    if (this.preloadPath && this.preloadPath !== filePath) {
      this.preloadPath = null;
      if (this.preloadEl) {
        this.preloadEl.src = "";
        this.preloadEl.load();
      }
    }

    // Bump the global decode token so stale Rust decodes are discarded
    decodeToken++;

    let url: string;
    try {
      // If preload element already has this file buffered, steal its URL
      if (
        this.preloadPath === filePath &&
        this.preloadEl?.src &&
        !this.preloadEl.error
      ) {
        url = this.preloadEl.src;
      } else {
        url = await getPlayableUrl(filePath);
      }
    } catch (err: unknown) {
      // stale-decode means a newer play() already took over — not an error
      const msg = err instanceof Error ? err.message : String(err);
      if (msg !== "stale-decode" && myToken === this._playToken) {
        console.warn("[AudioEngine] getPlayableUrl failed:", err);
      }
      return;
    }

    // Stale check after await
    if (myToken !== this._playToken) return;

    const needsLoad = this.audioEl!.src !== url;
    if (needsLoad) {
      this.audioEl!.src = url;
      this.audioEl!.load();
    } else {
      this.audioEl!.currentTime = 0;
    }

    if (this.ctx?.state === "suspended") {
      await this.ctx.resume().catch(() => {});
    }

    // One final stale check before play()
    if (myToken !== this._playToken) return;

    try {
      await this.audioEl!.play();
    } catch (err: unknown) {
      // AbortError is expected when play() is interrupted by a load — ignore.
      const name = err instanceof Error ? err.name : "";
      if (name !== "AbortError" && myToken === this._playToken) {
        console.warn("[AudioEngine] play() failed:", err);
      }
    }

    this.preloadPath = null;
  }

  // ── preloadNext() ─────────────────────────────────────────────────────────
  /**
   * Background-decode + buffer the next track into the silent preload element.
   * Automatically cancels if play() is called for a different track first.
   */
  async preloadNext(filePath: string): Promise<void> {
    if (!this.preloadEl) return;
    if (this.preloadPath === filePath) return;

    this.preloadPath = filePath;

    try {
      await preDecodeFile(filePath); // no-op for native formats / already cached
      if (this.preloadPath !== filePath) return; // cancelled

      const url = await getPlayableUrl(filePath);
      if (this.preloadPath !== filePath) return; // cancelled

      this.preloadEl.src = url;
      this.preloadEl.load();
    } catch {
      // Preload failures are always silent
    }
  }

  // ── Transport ─────────────────────────────────────────────────────────────
  pause(): void  { this.audioEl?.pause(); }
  resume(): void { this.ctx?.resume().catch(() => {}); this.audioEl?.play().catch(() => {}); }
  stop(): void   { if (this.audioEl) { this.audioEl.pause(); this.audioEl.currentTime = 0; } }

  seek(s: number): void {
    if (!this.audioEl) return;
    const d = this.audioEl.duration;
    if (!isFinite(d) || d === 0 || !isFinite(s)) return;
    this.audioEl.currentTime = Math.max(0, Math.min(s, d));
  }

  seekPercent(pct: number): void {
    if (!isFinite(pct)) return;
    this.seek((pct / 100) * this.duration);
  }

  // ── Getters ───────────────────────────────────────────────────────────────
  get currentTime(): number { return this.audioEl?.currentTime ?? 0; }
  get duration(): number    { const d = this.audioEl?.duration ?? 0; return isFinite(d) ? d : 0; }
  get progress(): number    { return this.duration ? (this.currentTime / this.duration) * 100 : 0; }
  get isPlaying(): boolean  { return !!(this.audioEl && !this.audioEl.paused && !this.audioEl.ended); }

  // ── Volume & EQ ───────────────────────────────────────────────────────────
  setVolume(v: number): void {
    this._volume = v / 100;
    if (this.gainNode && this.ctx)
      this.gainNode.gain.setTargetAtTime(this._volume, this.ctx.currentTime, 0.01);
    if (this.audioEl) this.audioEl.volume = this._volume;
  }

  setEqBand(i: number, db: number): void {
    this._eqGains[i] = db;
    if (this.eqFilters[i] && this.ctx)
      this.eqFilters[i].gain.setTargetAtTime(db, this.ctx.currentTime, 0.01);
  }

  setEqPreset(gains: number[]): void { gains.forEach((g, i) => this.setEqBand(i, g)); }
  getEqGains(): number[] { return [...this._eqGains]; }

  // ── Analyser data ─────────────────────────────────────────────────────────
  getFrequencyData(): Uint8Array {
    if (!this.analyser) return new Uint8Array(128);
    const d = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(d);
    return d;
  }

  getWaveformData(): Uint8Array {
    if (!this.analyser) return new Uint8Array(128);
    const d = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteTimeDomainData(d);
    return d;
  }

  // ── Callbacks ─────────────────────────────────────────────────────────────
  onEnded(cb: () => void): void                  { this._onEnded = cb; }
  onTimeUpdate(cb: (t: number) => void): void    { this._onTimeUpdate = cb; }
  onLoadedMetadata(cb: (d: number) => void): void { this._onLoadedMetadata = cb; }

  // ── Misc ──────────────────────────────────────────────────────────────────
  private async ensureInit(): Promise<void> { if (!this.audioEl) await this.init(); }

  /** Returns a usable URL for the given path (cached blob or asset URL). */
  getAssetUrl(filePath: string): string {
    return blobUrlCache.get(filePath) ?? convertFileSrc(filePath);
  }

  destroy(): void {
    this.audioEl?.pause();
    this.ctx?.close().catch(() => {});
    this._onEnded         = null;
    this._onTimeUpdate    = null;
    this._onLoadedMetadata = null;
  }
}

export const audioEngine = new AudioEngine();