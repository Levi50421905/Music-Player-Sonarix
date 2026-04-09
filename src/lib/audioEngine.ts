/**
 * audioEngine.ts — Web Audio API Wrapper
 *
 * WHY: Web Audio API sangat powerful tapi verbose. File ini meng-encapsulate
 * semua logika audio (play, pause, seek, EQ, visualizer data) ke interface
 * yang bersih dan mudah dipakai oleh komponen React.
 *
 * GRAPH (audio node chain):
 *   AudioBufferSource → GainNode (volume) → BiquadFilters[10] (EQ) →
 *   AnalyserNode (visualizer) → AudioContext.destination (speaker)
 *
 * WHY AudioBufferSource bukan HTMLAudioElement:
 *   - Support FLAC 32-bit float, high sample rate (192kHz)
 *   - Akses penuh ke Web Audio node graph
 *   - HTMLAudioElement tidak support semua format di semua browser
 *
 * CATATAN: Untuk file besar (FLAC), kita stream menggunakan
 * HTMLAudioElement + MediaElementSourceNode sebagai fallback yang lebih
 * memory-efficient.
 */

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
  private _onEnded: (() => void) | null = null;

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
    this.analyser.fftSize = 256; // 128 bins, cukup untuk bar visualizer
    this.analyser.smoothingTimeConstant = 0.8;

    // Connect graph: source → gain → eq[0] → eq[1] → ... → analyser → destination
    this.source = this.ctx.createMediaElementSource(this.audioEl);
    this.source.connect(this.gainNode);

    let prev: AudioNode = this.gainNode;
    for (const filter of this.eqFilters) {
      prev.connect(filter);
      prev = filter;
    }
    prev.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    // Event listener
    this.audioEl.addEventListener("ended", () => this._onEnded?.());
  }

  // ── Playback ──────────────────────────────────────────────────────────────

  /** Load dan play file audio dari path lokal */
  async play(filePath: string): Promise<void> {
    await this.ensureInit();

    if (this.audioEl!.src === this.pathToUrl(filePath) && !this.audioEl!.ended) {
      this.audioEl!.currentTime = 0;
    } else {
      this.audioEl!.src = this.pathToUrl(filePath);
      this.audioEl!.load();
    }

    // Resume context jika suspended (browser autoplay policy)
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
    if (this.audioEl) {
      this.audioEl.currentTime = Math.max(0, Math.min(seconds, this.duration));
    }
  }

  seekPercent(percent: number): void {
    this.seek((percent / 100) * this.duration);
  }

  // ── State getters ─────────────────────────────────────────────────────────

  get currentTime(): number {
    return this.audioEl?.currentTime ?? 0;
  }

  get duration(): number {
    return this.audioEl?.duration ?? 0;
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
    // value: 0–100 dari UI, konversi ke 0–1 untuk Web Audio
    this._volume = value / 100;
    if (this.gainNode) {
      // Smooth transition untuk menghindari click/pop suara
      this.gainNode.gain.setTargetAtTime(this._volume, this.ctx!.currentTime, 0.01);
    }
    if (this.audioEl) this.audioEl.volume = this._volume;
  }

  // ── Equalizer ────────────────────────────────────────────────────────────

  /**
   * Set gain untuk satu band EQ.
   * @param bandIndex 0–9 (sesuai EQ_FREQUENCIES)
   * @param gainDb gain dalam dB, range -12 sampai +12
   */
  setEqBand(bandIndex: number, gainDb: number): void {
    this._eqGains[bandIndex] = gainDb;
    if (this.eqFilters[bandIndex]) {
      this.eqFilters[bandIndex].gain.setTargetAtTime(
        gainDb, this.ctx!.currentTime, 0.01
      );
    }
  }

  /** Set semua band sekaligus (untuk apply preset) */
  setEqPreset(gains: number[]): void {
    gains.forEach((g, i) => this.setEqBand(i, g));
  }

  getEqGains(): number[] {
    return [...this._eqGains];
  }

  // ── Visualizer ────────────────────────────────────────────────────────────

  /**
   * Ambil data frekuensi untuk visualizer.
   * Return Uint8Array dengan nilai 0–255 per frekuensi bin.
   * Dipanggil di setiap animation frame.
   */
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

  onEnded(callback: () => void): void {
    this._onEnded = callback;
  }

  onTimeUpdate(callback: (time: number) => void): void {
    this.audioEl?.addEventListener("timeupdate", () => {
      callback(this.audioEl!.currentTime);
    });
  }

  onLoadedMetadata(callback: (duration: number) => void): void {
    this.audioEl?.addEventListener("loadedmetadata", () => {
      callback(this.audioEl!.duration);
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async ensureInit(): Promise<void> {
    if (!this.ctx) await this.init();
  }

  /**
   * Konversi path file lokal ke URL yang bisa dimuat HTMLAudioElement.
   * Tauri menggunakan protokol asset:// untuk file lokal.
   */
  private pathToUrl(filePath: string): string {
    // Tauri v2: gunakan convertFileSrc dari @tauri-apps/api/core
    // Import dilakukan secara dynamic untuk menghindari error di preview web
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { convertFileSrc } = require("@tauri-apps/api/core");
      return convertFileSrc(filePath);
    } catch {
      return filePath; // fallback untuk development di browser
    }
  }

  destroy(): void {
    this.audioEl?.pause();
    this.ctx?.close();
    this._onEnded = null;
  }
}

// Singleton instance — satu AudioEngine untuk seluruh app
export const audioEngine = new AudioEngine();