/**
 * WaveformSeekbar.tsx — v2 (Design Refresh)
 *
 * PERUBAHAN vs v1:
 *   [DESIGN] Height naik ke 56px (dari 48px) — hit area lebih baik
 *   [DESIGN] Hover feedback lebih jelas — tint bar di sekitar kursor
 *   [DESIGN] Time tooltip lebih besar (13px) dan lebih visible
 *   [DESIGN] Playhead line lebih tebal dan jelas (3px)
 *   [DESIGN] Loading spinner lebih halus
 *   [DESIGN] Bar yang dimainkan gradient lebih vivid
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { audioEngine } from "../../lib/audioEngine";

interface Props {
  filePath: string | null;
  progress: number;
  onSeek: (pct: number) => void;
  height?: number;
  barCount?: number;
}

const waveformCache = new Map<string, Float32Array>();

function generateFallbackWaveform(barCount: number): Float32Array {
  const fake = new Float32Array(barCount);
  for (let i = 0; i < barCount; i++) {
    fake[i] = 0.15
      + Math.abs(Math.sin(i * 0.18) * 0.35)
      + Math.abs(Math.sin(i * 0.07) * 0.25)
      + Math.abs(Math.sin(i * 0.41) * 0.15)
      + Math.random() * 0.08;
    fake[i] = Math.min(1, fake[i]);
  }
  return fake;
}

export default function WaveformSeekbar({
  filePath,
  progress,
  onSeek,
  height = 56,
  barCount = 150,
}: Props) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const [waveform, setWaveform]     = useState<Float32Array | null>(null);
  const [loading, setLoading]       = useState(false);
  const [hoverPct, setHoverPct]     = useState<number | null>(null);
  const [hoverTime, setHoverTime]   = useState<string | null>(null);
  const isDragging   = useRef(false);

  // Decode waveform
  useEffect(() => {
    if (!filePath) return;
    if (waveformCache.has(filePath)) {
      setWaveform(waveformCache.get(filePath)!);
      return;
    }
    setLoading(true);
    let cancelled = false;

    (async () => {
      try {
        const url = audioEngine.getAssetUrl(filePath);
        const controller = new AbortController();
        const timeoutId  = setTimeout(() => controller.abort(), 10000);
        let decoded = false;

        try {
          const response = await fetch(url, { signal: controller.signal });
          clearTimeout(timeoutId);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const buffer = await response.arrayBuffer();
          try {
            const offlineCtx = new OfflineAudioContext(1, 44100, 44100);
            const audioBuffer = await offlineCtx.decodeAudioData(buffer.slice(0));
            if (cancelled) return;
            const channelData = audioBuffer.getChannelData(0);
            const segSize = Math.floor(channelData.length / barCount);
            const bars = new Float32Array(barCount);
            for (let i = 0; i < barCount; i++) {
              let sum = 0;
              const start = i * segSize;
              for (let j = 0; j < segSize; j++) sum += channelData[start + j] ** 2;
              bars[i] = Math.sqrt(sum / Math.max(segSize, 1));
            }
            const max = Math.max(...bars, 0.001);
            for (let i = 0; i < bars.length; i++) bars[i] /= max;
            waveformCache.set(filePath, bars);
            if (!cancelled) setWaveform(bars);
            decoded = true;
          } catch {}
        } catch { clearTimeout(timeoutId); }

        if (!decoded && !cancelled) {
          const fake = generateFallbackWaveform(barCount);
          waveformCache.set(filePath, fake);
          setWaveform(fake);
        }
      } catch {
        if (!cancelled) {
          const fake = generateFallbackWaveform(barCount);
          waveformCache.set(filePath, fake);
          setWaveform(fake);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [filePath, barCount]);

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !waveform) return;

    const dpr = window.devicePixelRatio || 1;
    const W   = canvas.offsetWidth;
    const H   = height;

    canvas.width  = W * dpr;
    canvas.height = H * dpr;

    const ctx = canvas.getContext("2d")!;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const playedX    = (progress / 100) * W;
    const hoverX     = hoverPct !== null ? (hoverPct / 100) * W : null;
    const totalBars  = waveform.length;
    const barW       = Math.max(1.5, (W / totalBars) - 1.2);
    const gap        = W / totalBars - barW;
    const minBarH    = 2;
    const HOVER_ZONE = barW * 6; // highlight zone around hover

    for (let i = 0; i < totalBars; i++) {
      const x     = i * (barW + gap);
      const barH  = Math.max(minBarH, waveform[i] * (H - 8));
      const y     = (H - barH) / 2;
      const cx    = x + barW / 2;

      const isPlayed  = x + barW < playedX;
      const isHead    = Math.abs(cx - playedX) < barW * 2.5;
      const isHovered = hoverX !== null && Math.abs(cx - hoverX) < HOVER_ZONE;

      if (isPlayed) {
        const grad = ctx.createLinearGradient(0, y, 0, y + barH);
        grad.addColorStop(0, "#a78bfa");
        grad.addColorStop(1, "#EC4899");
        ctx.fillStyle = grad;
        ctx.globalAlpha = 0.92;
      } else if (isHead) {
        ctx.fillStyle = "rgba(210,195,255,0.8)";
        ctx.globalAlpha = 1;
      } else if (isHovered) {
        // Hover tint — gradient from center
        const dist  = hoverX !== null ? Math.abs(cx - hoverX) : HOVER_ZONE;
        const alpha = 0.35 * (1 - dist / HOVER_ZONE);
        ctx.fillStyle = `rgba(167,139,250,${0.18 + alpha})`;
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.09)";
        ctx.globalAlpha = 1;
      }

      ctx.beginPath();
      const r = Math.min(barW / 2, 2);
      ctx.roundRect(x, y, barW, barH, r);
      ctx.fill();
    }

    ctx.globalAlpha = 1;

    // Playhead line
    if (progress > 0) {
      const lineX = Math.max(1.5, playedX - 1.5);
      // Glow
      ctx.shadowColor  = "rgba(167,139,250,0.7)";
      ctx.shadowBlur   = 8;
      ctx.fillStyle    = "rgba(255,255,255,0.95)";
      ctx.beginPath();
      ctx.roundRect(lineX, 0, 3, H, 1.5);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Hover position ghost line
    if (hoverX !== null && !isDragging.current) {
      ctx.fillStyle = "rgba(167,139,250,0.3)";
      ctx.beginPath();
      ctx.roundRect(hoverX - 1, 0, 2, H, 1);
      ctx.fill();
    }

    ctx.restore();
  }, [waveform, progress, barCount, height, hoverPct]);

  // Resize observer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      canvas.style.height = `${height}px`;
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [height, waveform]);

  // Seek interaction
  const getPct = (e: React.MouseEvent | MouseEvent): number => {
    const canvas = canvasRef.current!;
    const rect   = canvas.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * 100;
  };

  const getTimeStr = (pct: number): string => {
    const dur = audioEngine.duration;
    if (!dur) return "";
    const secs = (pct / 100) * dur;
    return `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, "0")}`;
  };

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    onSeek(getPct(e));
    const onMove = (ev: MouseEvent) => {
      if (isDragging.current) {
        const pct = Math.max(0, Math.min(100, (ev.clientX - canvasRef.current!.getBoundingClientRect().left) / canvasRef.current!.getBoundingClientRect().width * 100));
        setHoverPct(pct);
        onSeek(pct);
      }
    };
    const onUp = () => {
      isDragging.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [onSeek]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const pct = getPct(e);
    setHoverPct(pct);
    setHoverTime(getTimeStr(pct));
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoverPct(null);
    setHoverTime(null);
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", cursor: "pointer" }}>
      {/* Time tooltip */}
      {hoverTime && hoverPct !== null && (
        <div style={{
          position: "absolute",
          bottom: "calc(100% + 6px)",
          left: `${Math.max(18, Math.min(hoverPct, 93))}%`,
          transform: "translateX(-50%)",
          background: "var(--bg-overlay, #111128)",
          border: "1px solid var(--border-medium, rgba(255,255,255,0.1))",
          borderRadius: 5,
          padding: "3px 8px",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text-primary, #eaeaf5)",
          fontFamily: "'Space Mono', monospace",
          pointerEvents: "none",
          zIndex: 10,
          whiteSpace: "nowrap",
          boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
        }}>
          {hoverTime}
        </div>
      )}

      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          width: "100%",
          height,
          display: "block",
          opacity: loading ? 0.25 : 1,
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
            width: 16, height: 16, borderRadius: "50%",
            border: "2px solid var(--accent, #7C3AED)",
            borderTopColor: "transparent",
            animation: "spin 0.8s linear infinite",
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}
    </div>
  );
}