/**
 * WaveformSeekbar.tsx — SoundCloud-style Waveform Seekbar
 *
 * WHY waveform seekbar:
 *   Progress bar biasa hanya menunjukkan posisi waktu.
 *   Waveform menunjukkan "isi" audio — mana bagian yang keras,
 *   mana yang sunyi — sehingga user bisa navigate ke bagian
 *   yang mereka inginkan dengan lebih intuitif.
 *
 * CARA KERJA:
 *   1. Saat lagu di-load, decode audio buffer
 *   2. Downsample channel data ke N bars
 *   3. Gambar waveform di canvas: played (terang) vs unplayed (redup)
 *   4. Click/drag untuk seek
 *
 * CATATAN PERFORMA:
 *   Decode audio buffer hanya sekali per lagu dan di-cache.
 *   Canvas hanya di-redraw saat progress berubah (bukan tiap frame).
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { readFile } from "@tauri-apps/plugin-fs";

interface Props {
  filePath: string | null;
  progress: number;           // 0–100
  onSeek: (pct: number) => void;
  height?: number;
  barCount?: number;
}

// Cache decoded waveforms agar tidak decode ulang
const waveformCache = new Map<string, Float32Array>();

export default function WaveformSeekbar({
  filePath,
  progress,
  onSeek,
  height = 48,
  barCount = 150,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [waveform, setWaveform] = useState<Float32Array | null>(null);
  const [loading, setLoading] = useState(false);
  const isDragging = useRef(false);

  // ── Decode waveform dari file audio ─────────────────────────────────────
  useEffect(() => {
    if (!filePath) return;

    // Cek cache
    if (waveformCache.has(filePath)) {
      setWaveform(waveformCache.get(filePath)!);
      return;
    }

    setLoading(true);

    (async () => {
      try {
        // Baca file
        const bytes = await readFile(filePath);
        const buffer = bytes.buffer as ArrayBuffer;

        // Decode via Web Audio API (offline context)
        const ctx = new OfflineAudioContext(1, 1, 44100);
        const audioBuffer = await ctx.decodeAudioData(buffer.slice(0));

        // Ambil channel data (mono mix)
        const channelData = audioBuffer.getChannelData(0);

        // Downsample ke barCount values (RMS per segment)
        const segSize = Math.floor(channelData.length / barCount);
        const bars = new Float32Array(barCount);

        for (let i = 0; i < barCount; i++) {
          let sum = 0;
          for (let j = 0; j < segSize; j++) {
            sum += channelData[i * segSize + j] ** 2;
          }
          bars[i] = Math.sqrt(sum / segSize); // RMS
        }

        // Normalize ke 0–1
        const max = Math.max(...bars);
        if (max > 0) for (let i = 0; i < bars.length; i++) bars[i] /= max;

        waveformCache.set(filePath, bars);
        setWaveform(bars);
      } catch (err) {
        console.warn("Waveform decode failed:", err);
        // Fallback: generate fake waveform
        const fake = new Float32Array(barCount);
        for (let i = 0; i < barCount; i++) {
          fake[i] = 0.2 + Math.abs(Math.sin(i * 0.3) * 0.4 + Math.sin(i * 0.7) * 0.3);
        }
        setWaveform(fake);
      } finally {
        setLoading(false);
      }
    })();
  }, [filePath, barCount]);

  // ── Draw waveform ke canvas ──────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !waveform) return;

    const ctx = canvas.getContext("2d")!;
    const W = canvas.width / window.devicePixelRatio;
    const H = canvas.height / window.devicePixelRatio;
    const dpr = window.devicePixelRatio;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);

    const playedX = (progress / 100) * W;
    const barW = (W - barCount * 1) / barCount; // 1px gap
    const minBarH = 2;

    for (let i = 0; i < waveform.length; i++) {
      const x = i * (barW + 1);
      const barH = Math.max(minBarH, waveform[i] * (H - 4));
      const y = (H - barH) / 2;
      const isPlayed = x < playedX;
      const isNear = Math.abs(x - playedX) < barW * 2; // near playhead

      // Color: played = gradient purple-pink, unplayed = muted
      if (isPlayed) {
        const gradH = ctx.createLinearGradient(0, y, 0, y + barH);
        gradH.addColorStop(0, "#a78bfa");
        gradH.addColorStop(1, "#EC4899");
        ctx.fillStyle = gradH;
      } else if (isNear) {
        ctx.fillStyle = "rgba(167,139,250,0.5)";
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.12)";
      }

      ctx.beginPath();
      ctx.roundRect(x, y, Math.max(1, barW), barH, 1);
      ctx.fill();
    }

    // Playhead line
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(playedX - 1, 0, 2, H, 1);
    ctx.fill();

    // Reset scale
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }, [waveform, progress, barCount]);

  // ── Resize canvas ────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio;
    const ro = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = height * dpr;
      canvas.style.height = `${height}px`;
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [height]);

  // ── Seek interaction ─────────────────────────────────────────────────────
  const getPercent = (e: React.MouseEvent | MouseEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * 100;
  };

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    onSeek(getPercent(e));

    const onMove = (ev: MouseEvent) => { if (isDragging.current) onSeek(getPercent(ev as any)); };
    const onUp   = () => { isDragging.current = false; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [onSeek]);

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        style={{
          width: "100%", height, display: "block",
          cursor: "pointer",
          opacity: loading ? 0.4 : 1,
          transition: "opacity 0.3s",
        }}
      />
      {loading && (
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          pointerEvents: "none",
        }}>
          <div style={{
            width: 12, height: 12, borderRadius: "50%",
            border: "2px solid #7C3AED",
            borderTopColor: "transparent",
            animation: "spin 0.8s linear infinite",
          }} />
        </div>
      )}
    </div>
  );
}