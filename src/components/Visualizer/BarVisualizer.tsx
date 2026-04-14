/**
 * BarVisualizer.tsx — v2 (Design Fix)
 *
 * PERUBAHAN vs v1:
 *   [FIX] Hardcode #7C3AED dan #EC4899 di canvas drawing sekarang dibaca
 *         dari CSS variable via getComputedStyle() agar theme-aware.
 *         Fungsi getCssVar() membaca --accent dan --accent-pink dari :root.
 *   [FIX] CircleVisualizer dan WaveVisualizer juga menggunakan getCssVar()
 */

import { useEffect, useRef } from "react";
import { audioEngine } from "../../lib/audioEngine";

// ── Helper: baca nilai CSS variable dari root element ────────────────────────
function getCssVar(name: string, fallback = "#7C3AED"): string {
  if (typeof document === "undefined") return fallback;
  const val = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return val || fallback;
}

interface Props {
  isPlaying: boolean;
  height?: number;
  barCount?: number;
  color1?: string; // Opsional override gradient start — default baca dari --accent
  color2?: string; // Opsional override gradient end   — default baca dari --accent-pink
}

export default function BarVisualizer({
  isPlaying,
  height = 48,
  barCount = 40,
  color1,
  color2,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const idleRef = useRef<number[]>([]);

  useEffect(() => {
    idleRef.current = Array.from({ length: barCount }, (_, i) =>
      4 + Math.sin(i * 0.5) * 3
    );
  }, [barCount]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    const smoothHeights = new Float32Array(barCount).fill(4);
    let idlePhase = 0;

    function draw() {
      const W = canvas!.width;
      const H = canvas!.height;
      ctx.clearRect(0, 0, W, H);

      // Baca warna dari CSS variable setiap frame agar responsive terhadap theme change
      const c1 = color1 ?? getCssVar("--accent", "#7C3AED");
      const c2 = color2 ?? getCssVar("--accent-pink", "#EC4899");

      const gradient = ctx.createLinearGradient(0, H, 0, 0);
      gradient.addColorStop(0, c1);
      gradient.addColorStop(1, c2);
      ctx.fillStyle = gradient;

      const gap = 2;
      const barW = (W - gap * (barCount - 1)) / barCount;

      if (isPlaying) {
        const freqData = audioEngine.getFrequencyData();
        const step = Math.floor(freqData.length / barCount);

        for (let i = 0; i < barCount; i++) {
          let sum = 0;
          for (let j = 0; j < step; j++) {
            sum += freqData[i * step + j] ?? 0;
          }
          const avg = sum / step;
          const target = 4 + (avg / 255) * (H - 8);

          const lerpUp = 0.4;
          const lerpDown = 0.12;
          const prev = smoothHeights[i];
          smoothHeights[i] = target > prev
            ? prev + (target - prev) * lerpUp
            : prev + (target - prev) * lerpDown;

          const x = i * (barW + gap);
          const barH = smoothHeights[i];
          ctx.beginPath();
          ctx.roundRect(x, H - barH, barW, barH, [2, 2, 0, 0]);
          ctx.fill();
        }
      } else {
        // Idle animation
        idlePhase += 0.04;
        for (let i = 0; i < barCount; i++) {
          const target = 4 + Math.sin(i * 0.4 + idlePhase) * 3 + Math.sin(i * 0.9 + idlePhase * 0.7) * 2;
          smoothHeights[i] = smoothHeights[i] * 0.9 + target * 0.1;

          ctx.globalAlpha = 0.35;
          const x = i * (barW + gap);
          ctx.beginPath();
          ctx.roundRect(x, H - smoothHeights[i], barW, smoothHeights[i], [2, 2, 0, 0]);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, barCount, color1, color2]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = height * window.devicePixelRatio;
      canvas.style.height = `${height}px`;
      (canvas.getContext("2d") as CanvasRenderingContext2D)
        .scale(window.devicePixelRatio, window.devicePixelRatio);
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [height]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height, display: "block" }}
    />
  );
}

// ── Circle Visualizer ─────────────────────────────────────────────────────────
export function CircleVisualizer({ isPlaying }: { isPlaying: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const SIZE = 200;
    canvas.width = SIZE;
    canvas.height = SIZE;

    function draw() {
      ctx.clearRect(0, 0, SIZE, SIZE);
      const cx = SIZE / 2, cy = SIZE / 2;
      const radius = 60;
      const bars = 64;

      // Baca warna dari CSS variable
      const accent     = getCssVar("--accent", "#7C3AED");
      const accentPink = getCssVar("--accent-pink", "#EC4899");
      const borderColor = getCssVar("--accent", "#7C3AED");

      const freqData = isPlaying ? audioEngine.getFrequencyData() : new Uint8Array(128).fill(10);

      for (let i = 0; i < bars; i++) {
        const angle = (i / bars) * Math.PI * 2 - Math.PI / 2;
        const value = freqData[Math.floor((i / bars) * freqData.length)] / 255;
        const barH = 8 + value * 40;

        const x1 = cx + Math.cos(angle) * radius;
        const y1 = cy + Math.sin(angle) * radius;
        const x2 = cx + Math.cos(angle) * (radius + barH);
        const y2 = cy + Math.sin(angle) * (radius + barH);

        const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
        gradient.addColorStop(0, `${accent}${Math.round((0.4 + value * 0.6) * 255).toString(16).padStart(2, "0")}`);
        gradient.addColorStop(1, `${accentPink}${Math.round((0.4 + value * 0.6) * 255).toString(16).padStart(2, "0")}`);

        ctx.strokeStyle = gradient;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      // Center circle
      ctx.beginPath();
      ctx.arc(cx, cy, radius - 2, 0, Math.PI * 2);
      ctx.strokeStyle = `${borderColor}4d`; // 30% opacity
      ctx.lineWidth = 1;
      ctx.stroke();

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying]);

  return <canvas ref={canvasRef} style={{ width: 200, height: 200 }} />;
}

// ── Waveform Visualizer ───────────────────────────────────────────────────────
export function WaveVisualizer({ isPlaying }: { isPlaying: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    function draw() {
      const W = canvas!.offsetWidth || 300;
      const H = 60;
      canvas!.width = W;
      canvas!.height = H;

      ctx.clearRect(0, 0, W, H);

      const waveData = audioEngine.getWaveformData();
      const sliceW = W / waveData.length;

      // Baca warna dari CSS variable
      const accent     = getCssVar("--accent", "#7C3AED");
      const accentPink = getCssVar("--accent-pink", "#EC4899");

      ctx.lineWidth = 2;
      const gradient = ctx.createLinearGradient(0, 0, W, 0);
      gradient.addColorStop(0, accent);
      gradient.addColorStop(0.5, accentPink);
      gradient.addColorStop(1, accent);
      ctx.strokeStyle = gradient;

      ctx.beginPath();
      for (let i = 0; i < waveData.length; i++) {
        const v = waveData[i] / 128.0;
        const y = (v * H) / 2;
        if (i === 0) ctx.moveTo(0, y);
        else ctx.lineTo(i * sliceW, y);
      }
      ctx.stroke();

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying]);

  return <canvas ref={canvasRef} style={{ width: "100%", height: 60, display: "block" }} />;
}