/**
 * audioEngine.ts — Web Audio API Wrapper
 *
 * Fix:
 *   - onTimeUpdate / onLoadedMetadata sekarang disimpan sebagai callback
 *     dan dipasang ke audioEl di dalam init(), bukan di setter.
 *     Sebelumnya setter langsung addEventListener tapi audioEl belum ada.
 *   - seek() dan seekPercent() diberi guard isFinite
 */
import { convertFileSrc } from "@tauri-apps/api/core";

export type RepeatMode = "off" | "one" | "all";

// Frekuensi center untuk 10-band EQ (Hz)
export const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private eqFilters: BiquadFilterNode[] = [];
  private source: MediaElementAudioSourceNode | null = null;
  private audioEl: HTMLAudioElement | null = null;

  // State
  private _volume = 0.8;
  private _eqGains: number[] = new Array(10).fill(0);

  // Callbacks — disimpan di sini, dipasang ke audioEl di init()
  private _onEnded: (() => void) | null = null;
  private _onTimeUpdate: ((time: number) => void) | null = null;
  private _onLoadedMetadata: ((duration: number) => void) | null = null;

  // ── Init ──────────────────────────────────────────────────────────────────

  /**
   * Inisialisasi AudioContext dan semua node.
   * HARUS dipanggil setelah user gesture (klik) karena browser policy.
   */
  async init(): Promise<void> {
    if (this.ctx) return; // sudah diinit

    this.ctx = new AudioContext();

    // Audio element (streaming, memory-efficient untuk file besar)
    this.audioEl = new Audio();
    this.audioEl.crossOrigin = "anonymous";
    this.audioEl.preload = "auto";

    // ✅ Pasang semua event listener di sini, setelah audioEl ada
    this.audioEl.addEventListener("ended", () => {
      this._onEnded?.();
    });

    this.audioEl.addEventListener("timeupdate", () => {
      if (this.audioEl) this._onTimeUpdate?.(this.audioEl.currentTime);
    });

    this.audioEl.addEventListener("loadedmetadata", () => {
      if (this.audioEl) this._onLoadedMetadata?.(this.audioEl.duration);
    });

    // Volume gain
    this.gainNode = this.ctx.createGain();
    this.gainNode.gain.value = this._volume;

    // 10-band EQ (peaking filters)
    this.eqFilters = EQ_FREQUENCIES.map(freq => {
      const filter = this.ctx!.createBiquadFilter();
      filter.type = "peaking";
      filter.frequency.value = freq;
      filter.Q.value = 1.0;
      filter.gain.value = 0;
      return filter;
    });

    // Analyser untuk visualizer
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.8;

    // Connect graph: source → gain → eq[0..9] → analyser → destination
    this.source = this.ctx.createMediaElementSource(this.audioEl);
    this.source.connect(this.gainNode);

    let prev: AudioNode = this.gainNode;
    for (const filter of this.eqFilters) {
      prev.connect(filter);
      prev = filter;
    }
    prev.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
  }

  // ── Playback ──────────────────────────────────────────────────────────────

  async play(filePath: string): Promise<void> {
    await this.ensureInit();

    const url = this.pathToUrl(filePath);

    if (this.audioEl!.src === url && !this.audioEl!.ended) {
      this.audioEl!.currentTime = 0;
    } else {
      this.audioEl!.src = url;
      this.audioEl!.load();
    }

    if (this.ctx!.state === "suspended") {
      await this.ctx!.resume();
    }

    await this.audioEl!.play();
  }

  pause(): void {
    this.audioEl?.pause();
  }

  resume(): void {
    this.ctx?.resume();
    this.audioEl?.play();
  }

  stop(): void {
    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl.currentTime = 0;
    }
  }

  seek(seconds: number): void {
    if (!this.audioEl) return;
    // ✅ Guard: jangan seek kalau duration belum ready atau nilai tidak valid
    if (!isFinite(this.audioEl.duration) || this.audioEl.duration === 0) return;
    if (!isFinite(seconds)) return;
    this.audioEl.currentTime = Math.max(0, Math.min(seconds, this.audioEl.duration));
  }

  seekPercent(percent: number): void {
    if (!isFinite(percent)) return; // ✅ Guard
    this.seek((percent / 100) * this.duration);
  }

  // ── State getters ─────────────────────────────────────────────────────────

  get currentTime(): number {
    return this.audioEl?.currentTime ?? 0;
  }

  get duration(): number {
    const d = this.audioEl?.duration ?? 0;
    return isFinite(d) ? d : 0; // ✅ Selalu return angka finite
  }

  get progress(): number {
    if (!this.duration) return 0;
    return (this.currentTime / this.duration) * 100;
  }

  get isPlaying(): boolean {
    return !!(this.audioEl && !this.audioEl.paused && !this.audioEl.ended);
  }

  // ── Volume ────────────────────────────────────────────────────────────────

  setVolume(value: number): void {
    this._volume = value / 100;
    if (this.gainNode && this.ctx) {
      this.gainNode.gain.setTargetAtTime(this._volume, this.ctx.currentTime, 0.01);
    }
    if (this.audioEl) this.audioEl.volume = this._volume;
  }

  // ── Equalizer ────────────────────────────────────────────────────────────

  setEqBand(bandIndex: number, gainDb: number): void {
    this._eqGains[bandIndex] = gainDb;
    if (this.eqFilters[bandIndex] && this.ctx) {
      this.eqFilters[bandIndex].gain.setTargetAtTime(
        gainDb, this.ctx.currentTime, 0.01
      );
    }
  }

  setEqPreset(gains: number[]): void {
    gains.forEach((g, i) => this.setEqBand(i, g));
  }

  getEqGains(): number[] {
    return [...this._eqGains];
  }

  // ── Visualizer ────────────────────────────────────────────────────────────

  getFrequencyData(): Uint8Array {
    if (!this.analyser) return new Uint8Array(128);
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    return data;
  }

  getWaveformData(): Uint8Array {
    if (!this.analyser) return new Uint8Array(128);
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteTimeDomainData(data);
    return data;
  }

  // ── Events ────────────────────────────────────────────────────────────────

  /**
   * Semua setter hanya menyimpan callback.
   * Listener sudah dipasang ke audioEl di dalam init().
   */
  onEnded(callback: () => void): void {
    this._onEnded = callback;
  }

  onTimeUpdate(callback: (time: number) => void): void {
    this._onTimeUpdate = callback;
  }

  onLoadedMetadata(callback: (duration: number) => void): void {
    this._onLoadedMetadata = callback;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async ensureInit(): Promise<void> {
    if (!this.ctx) await this.init();
  }

  private pathToUrl(filePath: string): string {
    return convertFileSrc(filePath);
  }

  /** Expose convertFileSrc untuk WaveformSeekbar */
  getAssetUrl(filePath: string): string {
    return this.pathToUrl(filePath);
  }

  destroy(): void {
    this.audioEl?.pause();
    this.ctx?.close();
    this._onEnded = null;
    this._onTimeUpdate = null;
    this._onLoadedMetadata = null;
  }
}

// Singleton instance — satu AudioEngine untuk seluruh app
export const audioEngine = new AudioEngine();