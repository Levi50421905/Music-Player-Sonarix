/**
 * WaveformSeekbar.tsx — SoundCloud-style Waveform Seekbar
 *
 * Fix:
 *   - Decode audio via fetch(convertFileSrc) bukan readFile()
 *     karena OfflineAudioContext tidak bisa decode raw bytes FLAC
 *     yang dibaca lewat plugin-fs di Tauri/Chromium.
 *   - Canvas draw pakai ctx.save()/restore() agar scale tidak accumulate.
 *   - ResizeObserver tetap ada agar canvas resize dengan benar.
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { audioEngine } from "../../lib/audioEngine";

interface Props {
  filePath: string | null;
  progress: number;        // 0–100
  onSeek: (pct: number) => void;
  height?: number;
  barCount?: number;
}

// Cache decoded waveforms agar tidak decode ulang per lagu
const waveformCache = new Map<string, Float32Array>();

export default function WaveformSeekbar({
  filePath,
  progress,
  onSeek,
  height = 48,
  barCount = 150,
}: Props) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const [waveform, setWaveform] = useState<Float32Array | null>(null);
  const [loading, setLoading]   = useState(false);
  const isDragging  = useRef(false);

  // ── Decode waveform ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!filePath) return;

    // Cek cache
    if (waveformCache.has(filePath)) {
      setWaveform(waveformCache.get(filePath)!);
      return;
    }

    setLoading(true);
    let cancelled = false;

    (async () => {
      try {
        // ✅ Gunakan asset URL (convertFileSrc via audioEngine helper)
        //    fetch() bisa decode stream — tidak perlu baca seluruh file ke memory
        const url      = audioEngine.getAssetUrl(filePath);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer   = await response.arrayBuffer();

        // Decode via OfflineAudioContext
        // length harus > 0; kita pakai 1 sample karena hanya butuh channel data
        const offlineCtx  = new OfflineAudioContext(1, 44100, 44100);
        const audioBuffer = await offlineCtx.decodeAudioData(buffer);

        if (cancelled) return;

        // Downsample ke barCount (RMS per segment)
        const channelData = audioBuffer.getChannelData(0);
        const segSize     = Math.floor(channelData.length / barCount);
        const bars        = new Float32Array(barCount);

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
        if (!cancelled) setWaveform(bars);
      } catch (err) {
        console.warn("Waveform decode failed:", err);
        if (cancelled) return;

        // Fallback: fake waveform agar UI tetap fungsional
        const fake = new Float32Array(barCount);
        for (let i = 0; i < barCount; i++) {
          fake[i] = 0.2 + Math.abs(Math.sin(i * 0.3) * 0.4 + Math.sin(i * 0.7) * 0.3);
        }
        setWaveform(fake);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [filePath, barCount]);

  // ── Draw ke canvas ───────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !waveform) return;

    const dpr = window.devicePixelRatio || 1;
    const W   = canvas.offsetWidth;
    const H   = height;

    // ✅ Selalu sync ukuran canvas dengan CSS size
    canvas.width  = W * dpr;
    canvas.height = H * dpr;

    const ctx = canvas.getContext("2d")!;
    ctx.save();           // ✅ save agar scale tidak accumulate
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const playedX = (progress / 100) * W;
    const barW    = (W - barCount) / barCount; // 1px gap antar bar
    const minBarH = 2;

    for (let i = 0; i < waveform.length; i++) {
      const x      = i * (barW + 1);
      const barH   = Math.max(minBarH, waveform[i] * (H - 4));
      const y      = (H - barH) / 2;
      const isPlayed = x < playedX;
      const isNear   = Math.abs(x - playedX) < barW * 2;

      if (isPlayed) {
        const grad = ctx.createLinearGradient(0, y, 0, y + barH);
        grad.addColorStop(0, "#a78bfa");
        grad.addColorStop(1, "#EC4899");
        ctx.fillStyle = grad;
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

    ctx.restore(); // ✅ restore — bersih untuk render berikutnya
  }, [waveform, progress, barCount, height]);

  // ── Resize observer ──────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Trigger redraw saat container resize
    const ro = new ResizeObserver(() => {
      // Paksa re-render dengan setState dummy tidak perlu —
      // draw effect sudah baca offsetWidth langsung dari canvas.
      // Tapi kita perlu trigger effect, jadi kita redraw manual:
      if (!waveform) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width  = canvas.offsetWidth * dpr;
      canvas.height = height * dpr;
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [height, waveform]);

  // ── Seek interaction ─────────────────────────────────────────────────────
  const getPercent = (e: React.MouseEvent | MouseEvent): number => {
    const canvas = canvasRef.current!;
    const rect   = canvas.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * 100;
  };

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    onSeek(getPercent(e));

    const onMove = (ev: MouseEvent) => {
      if (isDragging.current) onSeek(getPercent(ev as any));
    };
    const onUp = () => {
      isDragging.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [onSeek]);

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        style={{
          width: "100%",
          height,
          display: "block",
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