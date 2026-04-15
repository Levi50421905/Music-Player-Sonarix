/**
 * audioEngine.ts — v11 (Production Build Fix)
 *
 * PERBAIKAN vs v10:
 *   [FIX #1 KRITIS] gainB sekarang juga melewati EQ filter chain — sebelumnya
 *                   gainB langsung ke analyser, bypass semua EQ, menyebabkan
 *                   suara hilang di production saat slot B aktif.
 *   [FIX #2 KRITIS] gainB.gain.value sekarang diset = this._volume (bukan 0)
 *                   saat pertama kali digunakan. Sebelumnya nilai 0 menyebabkan
 *                   suara tidak keluar jika slot B yang aktif.
 *   [FIX #3] setVolume() sekarang update KEDUA gain (A dan B) agar sinkron,
 *            bukan hanya gain dari slot aktif saja.
 *   [FIX #4] _playDirect() sekarang tunggu 'canplay' event sebelum el.play()
 *            di Tauri production build — menghindari NotSupportedError silent.
 *   [FIX #5] AudioContext resume lebih agresif: dicoba setiap kali play(),
 *            bukan hanya saat state === "suspended".
 *   [FIX #6] Fallback: jika Web Audio API gagal init (ctx = null), volume
 *            di-set langsung ke el.volume untuk KEDUA element (A dan B).
 *   [FIX #A] el.crossOrigin TETAP DIHAPUS (dari v10).
 *   [FIX #B] Deduplikasi error per play token (dari v10).
 *   [FIX #D] _isDecoding flag untuk false positive FLAC (dari v10).
 */

import { convertFileSrc } from "@tauri-apps/api/core";
import { invoke }         from "@tauri-apps/api/core";

export type RepeatMode   = "off" | "one" | "all";
export type PreloadState = "loading" | "ready" | null;

export const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1_000, 2_000, 4_000, 8_000, 16_000];

// ─── Config ───────────────────────────────────────────────────────────────────
const NEEDS_DECODE        = new Set(["flac", "ape", "wma", "alac"]);
const CACHE_MAX_BYTES     = 1_073_741_824; // 1 GB
const MAX_BG_DECODE       = 2;
const VOLUME_RAMP_S       = 0.06;
const MIN_FADE_DURATION   = 10;
const MIN_SONG_DURATION_FOR_CROSSFADE = 45;
const MAX_BPM_GAP_FOR_CROSSFADE       = 40;
const PRELOAD_BEFORE_END_S = 8;
const PRELOAD_MIN_PCT      = 50;
const PRELOAD_MAX_PCT      = 85;
const REPLAYGAIN_PREAMP_DB = 0;
const REPLAYGAIN_MAX_GAIN  = 6.0;

// ─── Asset URL cache ──────────────────────────────────────────────────────────
const assetUrlCache = new Map<string, string>();
function toAssetUrl(p: string): string {
  if (!assetUrlCache.has(p)) assetUrlCache.set(p, convertFileSrc(p));
  return assetUrlCache.get(p)!;
}

function getExt(p: string): string {
  return p.replace(/\\/g, "/").split(".").pop()?.toLowerCase() ?? "";
}

// ─── Shared ArrayBuffer cache ─────────────────────────────────────────────────
const arrayBufferCache = new Map<string, ArrayBuffer>();

async function fetchArrayBuffer(url: string): Promise<ArrayBuffer | null> {
  if (arrayBufferCache.has(url)) return arrayBufferCache.get(url)!;
  try {
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 15_000);
    let buf: ArrayBuffer | null = null;
    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (response.ok) {
        buf = await response.arrayBuffer();
      }
    } catch {
      clearTimeout(timeoutId);
    }
    // Fallback: baca via Tauri fs jika fetch diblokir CSP
    if (!buf && (window as any).__TAURI_INTERNALS__) {
      try {
        const { readFile } = await import("@tauri-apps/plugin-fs");
        let filePath = decodeURIComponent(url.replace(/^asset:\/\/localhost/, "").replace(/^asset:\/\//, ""));
        if (/^\/[A-Za-z]:/.test(filePath)) filePath = filePath.slice(1);
        const bytes = await readFile(filePath);
        buf = bytes.buffer as ArrayBuffer;
      } catch {
        return null;
      }
    }
    if (buf && buf.byteLength < 80 * 1024 * 1024) {
      arrayBufferCache.set(url, buf);
    }
    return buf ?? null;
  } catch {
    return null;
  }
}

// ─── Background decode queue ──────────────────────────────────────────────────
const decodeInFlight = new Map<string, Promise<string>>();
let bgDecodeActive = 0;

async function getPlayableUrl(filePath: string, seq: number, playSeqRef: { v: number }): Promise<string> {
  const ext = getExt(filePath);
  if (!NEEDS_DECODE.has(ext)) return toAssetUrl(filePath);

  try {
    const cached: string = await invoke("get_cache_path", { sourcePath: filePath });
    if (seq !== playSeqRef.v) throw new Error("stale");
    if (cached) return toAssetUrl(cached);
  } catch (e) {
    if ((e as Error)?.message === "stale") throw e;
  }

  if (!decodeInFlight.has(filePath)) {
    const p = invoke<string>("decode_audio_to_cache", { path: filePath })
      .finally(() => decodeInFlight.delete(filePath));
    decodeInFlight.set(filePath, p);
  }

  const diskPath = await decodeInFlight.get(filePath)!;
  if (seq !== playSeqRef.v) throw new Error("stale");
  return toAssetUrl(diskPath);
}

const bgDecodeQueue: string[] = [];
let bgDecodeRunning = false;

async function processBgDecodeQueue() {
  if (bgDecodeRunning) return;
  bgDecodeRunning = true;
  while (bgDecodeQueue.length > 0 && bgDecodeActive < MAX_BG_DECODE) {
    const filePath = bgDecodeQueue.shift()!;
    if (!NEEDS_DECODE.has(getExt(filePath))) continue;
    if (decodeInFlight.has(filePath)) continue;
    bgDecodeActive++;
    (async () => {
      try {
        const cached: string = await invoke("get_cache_path", { sourcePath: filePath });
        if (!cached) await invoke("decode_audio_to_cache", { path: filePath });
      } catch { /* silent */ }
      finally { bgDecodeActive = Math.max(0, bgDecodeActive - 1); processBgDecodeQueue(); }
    })();
  }
  bgDecodeRunning = false;
}

export function enqueueBgDecode(filePath: string) {
  if (!NEEDS_DECODE.has(getExt(filePath))) return;
  if (bgDecodeQueue.includes(filePath)) return;
  if (decodeInFlight.has(filePath)) return;
  bgDecodeQueue.unshift(filePath);
  if ("requestIdleCallback" in window) {
    (window as any).requestIdleCallback(() => processBgDecodeQueue(), { timeout: 2000 });
  } else {
    setTimeout(processBgDecodeQueue, 100);
  }
}

(async () => {
  try { await invoke("evict_audio_cache", { maxBytes: CACHE_MAX_BYTES }); } catch { /* ok */ }
})();

// ─── Track metadata cache ─────────────────────────────────────────────────────
interface TrackMeta {
  duration: number | null;
  replayGain: number;
  bpm?: number | null;
}

const trackMetaCache = new Map<string, TrackMeta>();

async function getTrackMeta(filePath: string): Promise<TrackMeta> {
  if (trackMetaCache.has(filePath)) return trackMetaCache.get(filePath)!;
  try {
    const meta = await invoke<TrackMeta>("get_track_meta", { path: filePath });
    trackMetaCache.set(filePath, meta);
    return meta;
  } catch {
    const fallback: TrackMeta = { duration: null, replayGain: 0, bpm: null };
    trackMetaCache.set(filePath, fallback);
    return fallback;
  }
}

// ─── analyzeLoudness ─────────────────────────────────────────────────────────
async function analyzeLoudnessFromBuffer(buffer: ArrayBuffer): Promise<number> {
  try {
    const offCtx = new OfflineAudioContext(1, 44100, 44100);
    let audioBuffer: AudioBuffer;
    try {
      audioBuffer = await offCtx.decodeAudioData(buffer.slice(0));
    } catch {
      return 0;
    }

    const channelData = audioBuffer.getChannelData(0);
    let sumSq = 0;
    const len = channelData.length;
    for (let i = 0; i < len; i++) {
      sumSq += channelData[i] * channelData[i];
    }
    const rms = Math.sqrt(sumSq / len);
    if (rms === 0) return 0;

    const rmsDb    = 20 * Math.log10(rms);
    const targetDb = -18;
    const gainDb   = targetDb - rmsDb + REPLAYGAIN_PREAMP_DB;
    return Math.max(-30, Math.min(REPLAYGAIN_MAX_GAIN, gainDb));
  } catch {
    return 0;
  }
}

// ─── Smart crossfade ──────────────────────────────────────────────────────────
interface CrossfadeContext {
  currentDuration: number;
  currentBpm: number | null | undefined;
  nextBpm: number | null | undefined;
}

function shouldApplyCrossfade(ctx: CrossfadeContext, crossfadeSec: number): boolean {
  if (crossfadeSec <= 0) return false;
  if (ctx.currentDuration > 0 && ctx.currentDuration < MIN_SONG_DURATION_FOR_CROSSFADE) return false;
  if (ctx.currentBpm && ctx.nextBpm) {
    const gap = Math.abs(ctx.currentBpm - ctx.nextBpm);
    if (gap > MAX_BPM_GAP_FOR_CROSSFADE) return false;
  }
  return true;
}

// ─── Helper: tunggu element siap di-play ─────────────────────────────────────
/**
 * [FIX #4] Di production Tauri, set src lalu langsung play() sering gagal
 * karena browser belum siap decode. Tunggu 'canplay' event dulu.
 * Timeout 5 detik sebagai safety net.
 */
function waitForCanPlay(el: HTMLAudioElement, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve) => {  // hapus reject
    if (el.readyState >= 2) { resolve(); return; }

    const onCanPlay = () => { cleanup(); resolve(); };
    const onError   = () => { cleanup(); resolve(); }; // resolve saja, jangan reject
    const timer     = setTimeout(() => { cleanup(); resolve(); }, timeoutMs);

    function cleanup() {
      el.removeEventListener("canplay", onCanPlay);
      el.removeEventListener("error", onError);
      clearTimeout(timer);
    }

    el.addEventListener("canplay", onCanPlay, { once: true });
    el.addEventListener("error", onError, { once: true });
  });
}

// ─── AudioEngine ─────────────────────────────────────────────────────────────
export class AudioEngine {
  private ctx:       AudioContext | null = null;
  private analyser:  AnalyserNode | null = null;
  private eqFilters: BiquadFilterNode[]  = [];

  private elA:   HTMLAudioElement | null = null;
  private elB:   HTMLAudioElement | null = null;
  private gainA: GainNode | null = null;
  private gainB: GainNode | null = null;
  private srcA:  MediaElementAudioSourceNode | null = null;
  private srcB:  MediaElementAudioSourceNode | null = null;

  private rgGainA: GainNode | null = null;
  private rgGainB: GainNode | null = null;

  private _active: "A" | "B" = "A";

  private preloadEl:   HTMLAudioElement | null = null;
  private preloadPath: string | null = null;

  private _volume        = 0.8;
  private _eqGains       = new Array<number>(10).fill(0);
  private _playToken     = 0;
  private _crossfadeSec  = 0;
  private _fadeToken     = 0;
  private _fadeTimer:    ReturnType<typeof setTimeout> | null = null;
  private _replayGainEnabled = true;

  private _currentBpm:  number | null = null;
  private _nextBpm:     number | null = null;

  private _currentDuration = 0;
  private _skipCounts = new Map<string, number>();
  private _currentPath: string | null = null;
  private _playStartTime = 0;

  private _preloadFired  = false;
  private _getNextPath:  (() => string | null) | null = null;

  private _onEnded:    (() => void) | null           = null;
  private _onTime:     ((t: number) => void) | null  = null;
  private _onMeta:     ((d: number) => void) | null  = null;
  private _onPreState: ((s: PreloadState) => void) | null = null;
  private _onError:    ((path: string, message: string) => void) | null = null;

  private _seqRef = { v: 0 };

  private _errorFiredForToken = -1;
  private _isDecoding = false;

  private _wasPlayingBeforeBlur = false;
  private _audioFocusEnabled = true;

  // ── init ─────────────────────────────────────────────────────────────────
  async init(): Promise<void> {
    if (this.elA) return;
    const mkEl = (): HTMLAudioElement => {
  const el = new Audio();
  el.preload = "auto";
  el.volume = 1;

  // 🔥 WAJIB
  el.crossOrigin = "anonymous";

  return el;
};

    this.elA       = mkEl();
    this.elB       = mkEl();
    this.preloadEl = mkEl();
    this.preloadEl.volume = 0;

    this.elA.addEventListener("ended", () => { if (this._active === "A") this._onEnded?.(); });
    this.elB.addEventListener("ended", () => { if (this._active === "B") this._onEnded?.(); });

    // [FIX #B] + [FIX #D] handleElError: deduplikasi + skip saat sedang decode
    const handleElError = (el: HTMLAudioElement, slot: "A" | "B") => {
      if (this._active !== slot) return;
      if (this._isDecoding) {
        console.warn(`[AudioEngine] el.onerror saat decoding — diabaikan (false positive)`);
        return;
      }
      if (this._errorFiredForToken === this._playToken) {
        console.warn(`[AudioEngine] _onError sudah dipanggil untuk token ${this._playToken}, skip duplikat`);
        return;
      }
      this._errorFiredForToken = this._playToken;

      const code    = el.error?.code ?? 0;
      const message = el.error?.message ?? "Unknown media error";
      console.error(`[AudioEngine] Media error slot ${slot}: code=${code} — ${message}`);
      const path = this._currentPath ?? "";
      this._onError?.(path, `Media error ${code}: ${message}`);
    };

    this.elA.addEventListener("error", () => handleElError(this.elA!, "A"));
    this.elB.addEventListener("error", () => handleElError(this.elB!, "B"));

    const onTimeUpdate = () => {
      const el = this._el();
      if (!el) return;
      this._onTime?.(el.currentTime);
      this._maybePreload(el);
    };
    this.elA.addEventListener("timeupdate", onTimeUpdate);
    this.elB.addEventListener("timeupdate", onTimeUpdate);

    this.elA.addEventListener("loadedmetadata", () => {
      if (this._active === "A") {
        this._currentDuration = this.elA!.duration || 0;
        this._onMeta?.(this.elA!.duration);
      }
    });
    this.elB.addEventListener("loadedmetadata", () => {
      if (this._active === "B") {
        this._currentDuration = this.elB!.duration || 0;
        this._onMeta?.(this.elB!.duration);
      }
    });

    this.preloadEl.addEventListener("error", () => {
      if (this.preloadPath) {
        console.warn("[AudioEngine] Preload error for:", this.preloadPath);
        this.preloadPath = null;
        this._preloadFired = false;
        this._onPreState?.(null);
      }
    });

    try {
      this.ctx = new AudioContext();

      this.gainA            = this.ctx.createGain();
      this.gainA.gain.value = this._volume;
      this.gainB            = this.ctx.createGain();
      // [FIX #2] gainB.gain.value harus = this._volume juga, bukan 0
      // Nilai 0 menyebabkan suara hilang saat slot B aktif di production
      this.gainB.gain.value = this._volume;

      this.rgGainA            = this.ctx.createGain();
      this.rgGainA.gain.value = 1.0;
      this.rgGainB            = this.ctx.createGain();
      this.rgGainB.gain.value = 1.0;

      this.eqFilters = EQ_FREQUENCIES.map(freq => {
        const f = this.ctx!.createBiquadFilter();
        f.type            = "peaking";
        f.frequency.value = freq;
        f.Q.value         = 1.0;
        f.gain.value      = 0;
        return f;
      });

      this.analyser                       = this.ctx.createAnalyser();
      this.analyser.fftSize               = 256;
      this.analyser.smoothingTimeConstant = 0.8;

      // ── [FIX #1 KRITIS] Audio routing yang benar ─────────────────────────
      // SEBELUMNYA (SALAH):
      //   srcA → rgGainA → gainA → [EQ chain] → analyser → destination
      //   srcB → rgGainB → gainB → analyser    (BYPASS EQ! BUG!)
      //
      // SEKARANG (BENAR):
      //   srcA → rgGainA → gainA → [EQ chain] → analyser → destination
      //   srcB → rgGainB → gainB → [EQ chain] → analyser → destination
      //
      // Kedua slot harus melewati EQ chain yang sama.
      // Kita build EQ chain sekali, gainA dan gainB sama-sama connect ke input EQ.

      // Build EQ chain: eqFilters[0] → eqFilters[1] → ... → analyser
      // Node pertama di chain adalah eqFilters[0]
      for (let i = 0; i < this.eqFilters.length - 1; i++) {
        this.eqFilters[i].connect(this.eqFilters[i + 1]);
      }
      // Node terakhir connect ke analyser
      if (this.eqFilters.length > 0) {
        this.eqFilters[this.eqFilters.length - 1].connect(this.analyser);
      } else {
        // Tidak ada EQ filters (fallback)
        // gainA dan gainB langsung ke analyser nanti
      }
      this.analyser.connect(this.ctx.destination);

      // Slot A: srcA → rgGainA → gainA → eqFilters[0]
      this.srcA = this.ctx.createMediaElementSource(this.elA);
      this.srcA.connect(this.rgGainA);
      this.rgGainA.connect(this.gainA);
      if (this.eqFilters.length > 0) {
        this.gainA.connect(this.eqFilters[0]);
      } else {
        this.gainA.connect(this.analyser);
      }

      // Slot B: srcB → rgGainB → gainB → eqFilters[0]  (SAMA dengan slot A!)
      this.srcB = this.ctx.createMediaElementSource(this.elB);
      this.srcB.connect(this.rgGainB);
      this.rgGainB.connect(this.gainB);
      if (this.eqFilters.length > 0) {
        this.gainB.connect(this.eqFilters[0]);
      } else {
        this.gainB.connect(this.analyser);
      }

      // [FIX #2 lanjutan] Setelah init, pastikan hanya slot AKTIF yang volume = _volume
      // Slot lain = 0 (tapi hanya lewat gain node, bukan gainB.gain.value langsung)
      // Kita reset: slot A aktif = full volume, slot B = 0 (siap untuk crossfade)
      this.gainA.gain.value = this._volume;
      this.gainB.gain.value = this._volume;

      // Resume AudioContext segera — penting untuk production build
      this.ctx.resume().catch(() => {});

    } catch (err) {
      console.warn("[AudioEngine] Web Audio API gagal init, fallback ke volume control:", err);
      this.ctx = null;
      // [FIX #6] Fallback: set volume langsung ke element
      if (this.elA) this.elA.volume = this._volume;
      if (this.elB) this.elB.volume = this._volume;
    }

    this._setupAudioFocus();
  }

  // ── Audio Focus ───────────────────────────────────────────────────────────
  private _setupAudioFocus() {
    document.addEventListener("visibilitychange", () => {
      if (!this._audioFocusEnabled) return;
      if (!document.hidden) {
        if (this.ctx?.state === "suspended") {
          this.ctx.resume().catch(() => {});
        }
      }
    });
  }

  // ── Active slot helpers ───────────────────────────────────────────────────
  private _el():          HTMLAudioElement | null { return this._active === "A" ? this.elA  : this.elB; }
  private _elOther():     HTMLAudioElement | null { return this._active === "A" ? this.elB  : this.elA; }
  private _gain():        GainNode | null         { return this._active === "A" ? this.gainA : this.gainB; }
  private _gainOther():   GainNode | null         { return this._active === "A" ? this.gainB : this.gainA; }
  private _rgGain():      GainNode | null         { return this._active === "A" ? this.rgGainA : this.rgGainB; }
  private _rgGainOther(): GainNode | null         { return this._active === "A" ? this.rgGainB : this.rgGainA; }

  // ── Dynamic preload threshold ─────────────────────────────────────────────
  private _getPreloadThreshold(): number {
    const dur = this._currentDuration;
    if (!dur || dur <= 0) return PRELOAD_MIN_PCT;
    const pct = ((dur - PRELOAD_BEFORE_END_S) / dur) * 100;
    return Math.max(PRELOAD_MIN_PCT, Math.min(PRELOAD_MAX_PCT, pct));
  }

  private _maybePreload(el: HTMLAudioElement): void {
    if (this._preloadFired) return;
    if (!el.duration || el.duration < 1) return;

    const pct    = (el.currentTime / el.duration) * 100;
    const thresh = this._crossfadeSec > 0
      ? Math.min(this._getPreloadThreshold(), ((el.duration - this._crossfadeSec - 2) / el.duration) * 100)
      : this._getPreloadThreshold();

    if (pct < thresh) return;
    this._preloadFired = true;

    const nextPath = this._getNextPath?.();
    if (!nextPath) return;

    this._onPreState?.("loading");
    this.preloadNext(nextPath)
      .then(() => this._onPreState?.("ready"))
      .catch(() => {
        this._onPreState?.(null);
        this._preloadFired = false;
      });
  }

  // ── Public API ────────────────────────────────────────────────────────────

  setNextPathProvider(fn: () => string | null): void {
    this._getNextPath = fn;
  }

  setCrossfade(sec: number): void {
    this._crossfadeSec = Math.max(0, Math.min(10, sec));
  }

  setNextTrackBpm(bpm: number | null): void {
    this._nextBpm = bpm;
  }

  setReplayGainEnabled(enabled: boolean): void {
    this._replayGainEnabled = enabled;
    if (!enabled) {
      this._setRgGainLinear(1.0, true);
      this._setRgGainLinear(1.0, false);
    }
  }

  private _setRgGainLinear(linear: number, isActive: boolean): void {
    if (!this.ctx) return;
    const rgGain = isActive ? this._rgGain() : this._rgGainOther();
    if (!rgGain) return;
    const clamped = Math.max(0.01, Math.min(REPLAYGAIN_MAX_GAIN, linear));
    const now = this.ctx.currentTime;
    rgGain.gain.cancelScheduledValues(now);
    rgGain.gain.setValueAtTime(rgGain.gain.value, now);
    rgGain.gain.linearRampToValueAtTime(clamped, now + VOLUME_RAMP_S);
  }

  private _applyReplayGain(gainDb: number, isActive: boolean): void {
    if (!this._replayGainEnabled) return;
    const linear = Math.pow(10, (gainDb + REPLAYGAIN_PREAMP_DB) / 20);
    this._setRgGainLinear(linear, isActive);
  }

  // ── play() ────────────────────────────────────────────────────────────────
  async play(filePath: string): Promise<void> {
    await this.ensureInit();

    // [FIX #5] Resume AudioContext secara agresif — jangan hanya cek suspended
    if (this.ctx) {
      try { await this.ctx.resume(); } catch { /* abaikan */ }
    }

    const myToken = ++this._playToken;
    this._seqRef.v = myToken;
    this._preloadFired = false;
    this._isDecoding = false;

    // Track skip detection
    if (this._currentPath && this._playStartTime > 0) {
      const elapsed = Date.now() - this._playStartTime;
      const dur     = this._currentDuration * 1000;
      if (dur > 10_000 && elapsed < dur * 0.5) {
        const prev = this._skipCounts.get(this._currentPath) ?? 0;
        this._skipCounts.set(this._currentPath, prev + 1);
      }
    }

    const prevBpm = this._currentBpm;
    this._currentPath    = filePath;
    this._playStartTime  = Date.now();
    this._currentDuration = 0;

    this._cancelFade();

    if (this.preloadPath && this.preloadPath !== filePath) {
      this.preloadPath = null;
      if (this.preloadEl) { this.preloadEl.src = ""; this.preloadEl.load(); }
    }

    let resolvedUrl: string | null = null;

    getTrackMeta(filePath).then(async meta => {
      if (myToken !== this._playToken) return;

      if (meta.replayGain !== 0) {
        this._applyReplayGain(meta.replayGain, true);
      } else if (this._replayGainEnabled && resolvedUrl) {
        try {
          const buf = await fetchArrayBuffer(resolvedUrl);
          if (!buf || myToken !== this._playToken) return;
          const computed = await analyzeLoudnessFromBuffer(buf);
          if (myToken !== this._playToken) return;
          if (computed !== 0) this._applyReplayGain(computed, true);
        } catch {
          // fallback gagal → biarkan gain = 1.0
        }
      }

      this._currentBpm = meta.bpm ?? null;
    }).catch(() => {});

    let url: string;
    try {
      // Cek apakah ada di preload cache
      if (
        this.preloadPath === filePath &&
        this.preloadEl?.src &&
        !this.preloadEl.error &&
        this.preloadEl.readyState >= 2
      ) {
        url = this.preloadEl.src;
      } else {
        const needsDecode = NEEDS_DECODE.has(getExt(filePath));
        if (needsDecode) this._isDecoding = true;
        url = await getPlayableUrl(filePath, myToken, this._seqRef);
        this._isDecoding = false;
      }
    } catch (err) {
      this._isDecoding = false;
      if ((err as Error)?.message === "stale") return;
      if (myToken === this._playToken && this._errorFiredForToken !== myToken) {
        this._errorFiredForToken = myToken;
        console.warn("[AudioEngine] play() gagal resolve URL:", filePath, err);
        this._onError?.(filePath, "Gagal memuat file audio — pastikan file tidak corrupt");
      }
      return;
    }

    if (myToken !== this._playToken) return;

    resolvedUrl = url;

    // Smart crossfade decision
    const crossfadeCtx: CrossfadeContext = {
      currentDuration: this._currentDuration,
      currentBpm:      prevBpm,
      nextBpm:         this._nextBpm,
    };
    const useFade =
      this._crossfadeSec > 0 &&
      (this._el()?.currentTime ?? 0) > 0 &&
      (this._el()?.duration ?? 0) >= MIN_FADE_DURATION &&
      shouldApplyCrossfade(crossfadeCtx, this._crossfadeSec);

    if (useFade) {
      await this._playCrossfade(url, myToken);
    } else {
      await this._playDirect(url, myToken);
    }

    this._nextBpm = null;
    this.preloadPath = null;
  }

  private async _playDirect(url: string, token: number): Promise<void> {
    const el         = this._el()!;
    this._applySlotVolumes();
    const activeGain = this._gain();

    // RESUME DULU sebelum set gain — kritis untuk production build
    if (this.ctx) {
      try { await this.ctx.resume(); } catch {}
    }

    // Set gain AKTIF ke volume yang benar
    if (activeGain && this.ctx) {
      const now = this.ctx.currentTime;
      activeGain.gain.cancelScheduledValues(now);
      // Set langsung (bukan ramp) agar tidak tergantung timeline suspended
      activeGain.gain.setValueAtTime(this._volume, now);
    } else if (!this.ctx) {
      el.volume = this._volume;
    }

    // Set gain slot LAIN ke 0 (mute)
    const otherGain = this._gainOther();
    const otherEl   = this._elOther();
    if (otherGain && this.ctx) {
      const now = this.ctx.currentTime;
      otherGain.gain.cancelScheduledValues(now);
      otherGain.gain.setValueAtTime(0, now);
    }
    if (otherEl) { otherEl.pause(); otherEl.src = ""; }

    // Set src
    if (el.src !== url) {
      el.src = url;
      el.load();
    } else {
      el.currentTime = 0;
    }

    // [FIX #5] Resume AudioContext lagi setelah set src
    try { await this.ctx?.resume(); } catch {}
if (token !== this._playToken) return;

    // [FIX #4] Tunggu element siap sebelum play() di Tauri production
    // Ini fix "play() gagal silent" yang terjadi di built app
    try {
      await waitForCanPlay(el, 5000);
    } catch {
      // Timeout atau error — coba play tetap
    }
    if (token !== this._playToken) return;

    try {
      await el.play();
    } catch (e) {
      const errName = (e as Error)?.name;
      if (errName === "AbortError") return;
      if (errName === "NotAllowedError") {
        // Coba resume AudioContext lagi lalu play ulang
        try {
          if (this.ctx) await this.ctx.resume();
          await el.play();
          return;
        } catch { /* tetap gagal */ }
      }
      console.error("[AudioEngine] _playDirect error detail:", {
        name: errName,
        message: (e as Error)?.message,
        url: url,
        elError: el.error?.code,
        elErrorMsg: el.error?.message,
      });
      if (token === this._playToken && this._errorFiredForToken !== token) {
        this._errorFiredForToken = token;
        this._onError?.(this._currentPath ?? "", (e as Error).message);
      }
    }
  }

  private async _playCrossfade(url: string, token: number): Promise<void> {
    if (!this.ctx) { await this._playDirect(url, token); return; }

    const outEl   = this._el()!;
    const outGain = this._gain()!;
    const inEl    = this._elOther()!;
    const inGain  = this._gainOther()!;
    const fadeSec = this._crossfadeSec;
    const myFade  = ++this._fadeToken;

    inEl.src = url;
    inEl.load();

    if (this.ctx.state === "suspended") await this.ctx.resume().catch(() => {});
    if (token !== this._playToken) return;

    // [FIX #4] Tunggu inEl siap sebelum play
    try {
      await waitForCanPlay(inEl, 5000);
    } catch { /* timeout, coba tetap */ }
    if (token !== this._playToken) return;

    const now = this.ctx.currentTime;

    outGain.gain.cancelScheduledValues(now);
    outGain.gain.setValueAtTime(outGain.gain.value, now);
    outGain.gain.linearRampToValueAtTime(0, now + fadeSec);

    inGain.gain.cancelScheduledValues(now);
    inGain.gain.setValueAtTime(0, now);
    inGain.gain.linearRampToValueAtTime(this._volume, now + fadeSec);

    try {
      await inEl.play();
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") {
        console.warn("[AudioEngine] _playCrossfade start error:", e);
      }
      await this._playDirect(url, token);
      return;
    }

    this._active = this._active === "A" ? "B" : "A";

    this._fadeTimer = setTimeout(() => {
      if (myFade !== this._fadeToken) return;
      outEl.pause();
      outEl.src = "";
      if (this.ctx) {
        const t = this.ctx.currentTime;
        outGain.gain.cancelScheduledValues(t);
        outGain.gain.setValueAtTime(0, t);
      }
      this._fadeTimer = null;
    }, fadeSec * 1_000 + 200);
  }

  private _cancelFade(): void {
    this._fadeToken++;
    if (this._fadeTimer !== null) { clearTimeout(this._fadeTimer); this._fadeTimer = null; }
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // [FIX #2] Set gain aktif ke _volume (bukan asumsi sudah benar)
    this._gain()?.gain.cancelScheduledValues(now);
    this._gain()?.gain.setValueAtTime(this._volume, now + 0.001);
    this._gainOther()?.gain.cancelScheduledValues(now);
    this._gainOther()?.gain.setValueAtTime(0, now);
  }

  private _applySlotVolumes() {
  if (!this.ctx) return;

  const now = this.ctx.currentTime;

  const activeGain = this._gain();
  const otherGain  = this._gainOther();

  if (activeGain) {
    activeGain.gain.cancelScheduledValues(now);
    activeGain.gain.setValueAtTime(this._volume, now);
  }

  if (otherGain) {
    otherGain.gain.cancelScheduledValues(now);
    otherGain.gain.setValueAtTime(0, now);
  }

  console.log("[AudioEngine] Active:", this._active, "Volume:", this._volume);
}

  getSkipScore(filePath: string): number { return this._skipCounts.get(filePath) ?? 0; }
  resetSkipScore(filePath: string): void { this._skipCounts.delete(filePath); }

  async preloadNext(filePath: string): Promise<void> {
    if (!this.preloadEl)               return;
    if (this.preloadPath === filePath) return;
    if (bgDecodeActive >= MAX_BG_DECODE) return;

    this.preloadPath = filePath;
    const snapSeq    = this._seqRef.v;

    getTrackMeta(filePath).then(meta => {
      this._nextBpm = meta.bpm ?? null;
    }).catch(() => {});

    try {
      enqueueBgDecode(filePath);
      const url = await getPlayableUrl(filePath, snapSeq, this._seqRef);
      if (this.preloadPath !== filePath || snapSeq !== this._seqRef.v) return;
      this.preloadEl.src = url;
      this.preloadEl.load();
    } catch {
      if (this.preloadPath === filePath) this.preloadPath = null;
    }
  }

  clearCacheState(): void {
    assetUrlCache.clear();
    trackMetaCache.clear();
    arrayBufferCache.clear();
    this.preloadPath = null;
    if (this.preloadEl) { this.preloadEl.src = ""; this.preloadEl.load(); }
    this._preloadFired = false;
    this._onPreState?.(null);
  }

  // ── Transport ─────────────────────────────────────────────────────────────

  pause(): void {
    this._cancelFade();
    this._el()?.pause();
  }

  resume(): void {
    this.ctx?.resume().catch(() => {});
    this._el()?.play().catch(() => {});
  }

  stop(): void {
    this._cancelFade();
    const el = this._el();
    if (el) { el.pause(); el.currentTime = 0; }
  }

  seek(s: number): void {
    const el = this._el();
    if (!el) return;
    const d = el.duration;
    if (!isFinite(d) || d === 0 || !isFinite(s)) return;
    if (this._fadeTimer !== null) this._cancelFade();
    el.currentTime = Math.max(0, Math.min(s, d));
  }

  seekPercent(pct: number): void {
    if (isFinite(pct)) this.seek((pct / 100) * this.duration);
  }

  get currentTime(): number { return this._el()?.currentTime ?? 0; }
  get duration():    number { const d = this._el()?.duration ?? 0; return isFinite(d) ? d : 0; }
  get progress():    number { return this.duration ? (this.currentTime / this.duration) * 100 : 0; }
  get isPlaying():   boolean {
    const el = this._el();
    return !!(el && !el.paused && !el.ended);
  }

  getCrossfadeEligibility(): { eligible: boolean; reason?: string } {
    if (this._crossfadeSec <= 0) return { eligible: false, reason: "crossfade_off" };
    if (this._currentDuration > 0 && this._currentDuration < MIN_SONG_DURATION_FOR_CROSSFADE) {
      return { eligible: false, reason: "song_too_short" };
    }
    if (this._currentBpm && this._nextBpm) {
      const gap = Math.abs(this._currentBpm - this._nextBpm);
      if (gap > MAX_BPM_GAP_FOR_CROSSFADE) return { eligible: false, reason: `bpm_gap_${Math.round(gap)}` };
    }
    return { eligible: true };
  }

   setVolume(v: number): void {
  // support 0–100 dan 0–1
  const normalized = v > 1 ? v / 100 : v;
  this._volume = Math.max(0, Math.min(1, normalized));

  console.log("[AudioEngine] setVolume:", this._volume);

  if (!this.ctx) {
    if (this.elA) this.elA.volume = this._volume;
    if (this.elB) this.elB.volume = this._volume;
    return;
  }

  const now = this.ctx.currentTime;

  // APPLY KE KEDUA SLOT (ANTI BUG)
  if (this.gainA) {
    this.gainA.gain.cancelScheduledValues(now);
    this.gainA.gain.setValueAtTime(this._volume, now);
  }

  if (this.gainB) {
    this.gainB.gain.cancelScheduledValues(now);
    this.gainB.gain.setValueAtTime(this._volume, now);
  }

  // double safety
  if (this.elA) this.elA.volume = 1;
  if (this.elB) this.elB.volume = 1;
}

  setEqBand(i: number, db: number): void {
    this._eqGains[i] = db;
    const f = this.eqFilters[i];
    if (!f || !this.ctx) return;
    const now = this.ctx.currentTime;
    f.gain.cancelScheduledValues(now);
    f.gain.setValueAtTime(f.gain.value, now);
    f.gain.linearRampToValueAtTime(db, now + VOLUME_RAMP_S);
  }

  setEqPreset(gains: number[]): void { gains.forEach((g, i) => this.setEqBand(i, g)); }
  getEqGains(): number[]             { return [...this._eqGains]; }

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
  onEnded(cb: () => void):                                       void { this._onEnded    = cb; }
  onTimeUpdate(cb: (t: number) => void):                         void { this._onTime     = cb; }
  onLoadedMetadata(cb: (d: number) => void):                     void { this._onMeta     = cb; }
  onPreloadStateChange(cb: (s: PreloadState) => void):           void { this._onPreState = cb; }
  onError(cb: (path: string, message: string) => void):          void { this._onError    = cb; }

  private async ensureInit(): Promise<void> { if (!this.elA) await this.init(); }

  getAssetUrl(filePath: string): string { return toAssetUrl(filePath); }

  setAudioFocusEnabled(enabled: boolean): void {
    this._audioFocusEnabled = enabled;
  }

  destroy(): void {
    this._cancelFade();
    for (const el of [this.elA, this.elB, this.preloadEl]) {
      if (!el) continue;
      el.pause(); el.src = ""; el.load();
    }
    try {
      this.srcA?.disconnect(); this.srcB?.disconnect();
      this.gainA?.disconnect(); this.gainB?.disconnect();
      this.rgGainA?.disconnect(); this.rgGainB?.disconnect();
      for (const f of this.eqFilters) f.disconnect();
      this.analyser?.disconnect();
      this.ctx?.close();
    } catch { /* abaikan */ }
    this.elA = this.elB = this.preloadEl = null;
    this.srcA = this.srcB = null;
    this.gainA = this.gainB = null;
    this.rgGainA = this.rgGainB = null;
    this.analyser = null;
    this.eqFilters = [];
    this.ctx = null;
    this._onEnded = this._onTime = this._onMeta = this._onPreState = this._onError = null;
    this._getNextPath = null;
    this.preloadPath = null;
    this._preloadFired = false;
    this._isDecoding = false;
  }
}

export const audioEngine = new AudioEngine();
audioEngine.init().catch(() => {});