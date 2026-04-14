/**
 * useSettingsInit.ts — Settings Initializer Hook  
 * ================================================
 * LETAKKAN FILE INI DI: src/hooks/useSettingsInit.ts
 *
 * TUJUAN:
 *   Dipanggil SEKALI di App.tsx. Membaca semua settings dari Zustand store
 *   (yang sudah persist ke localStorage) lalu menerapkannya ke DOM dan audioEngine.
 *
 *   TANPA ini: kalau user pilih tema "light" kemarin, buka app hari ini tetap gelap
 *   sampai mereka buka Settings panel lagi.
 *
 * CARA PAKAI di App.tsx (tambahkan 2 baris):
 *   import { useSettingsInit } from "./hooks/useSettingsInit";
 *   // di dalam fungsi App():
 *   useSettingsInit();  // ← letakkan di baris paling atas, sebelum state lainnya
 */

import { useEffect } from "react";
import { useSettingsStore } from "../store";
import { audioEngine } from "../lib/audioEngine";
import {
  applyThemeToDom,
  applyAccentToDom,
  applyFontScaleToDom,
  applyCompactModeToDom,
  applyAnimationSpeedToDom,
  applyAmbientBlurToDom,
  applyCustomBackgroundToDom,
} from "../components/Settings/SettingsPanel";
import { setLang } from "../lib/i18n";

export function useSettingsInit() {
  const settings = useSettingsStore() as any;

  useEffect(() => {
    // ── 1. Tema & Warna ──────────────────────────────────────────────────────
    // Terapkan tema dulu, lalu accent (supaya accent tidak ditimpa tema)
    if (settings.theme) {
      applyThemeToDom(settings.theme);
    }
    if (settings.accentColor) {
      // Sedikit delay agar theme diterapkan lebih dulu
      setTimeout(() => applyAccentToDom(settings.accentColor), 10);
    }

    // ── 2. Tipografi & Layout ────────────────────────────────────────────────
    if (settings.fontSizeScale) {
      applyFontScaleToDom(settings.fontSizeScale);
    }
    applyCompactModeToDom(!!settings.compactMode);
    if (settings.animationSpeed) {
      applyAnimationSpeedToDom(settings.animationSpeed);
    }

    // ── 3. Visual Efek ───────────────────────────────────────────────────────
    if (settings.ambientBlurIntensity !== undefined) {
      applyAmbientBlurToDom(settings.ambientBlurIntensity);
    }
    if (settings.customBackground !== undefined) {
      applyCustomBackgroundToDom(settings.customBackground);
    }

    // ── 4. Cover Art Style ───────────────────────────────────────────────────
    // SettingsPanel menyimpannya tapi tidak apply ke DOM root
    // Kita apply class ke <html> agar bisa dipakai CoverArt component via CSS
    if (settings.coverArtStyle) {
      const root = document.documentElement;
      root.classList.remove("cover-square", "cover-rounded", "cover-circle");
      root.classList.add(`cover-${settings.coverArtStyle}`);
    }

    // ── 5. Audio Engine ──────────────────────────────────────────────────────
    // Volume
    if (settings.defaultVolume !== undefined) {
      audioEngine.setVolume(settings.defaultVolume);
    }
    // Crossfade
    if (settings.crossfadeSec !== undefined) {
      audioEngine.setCrossfade(settings.crossfadeSec);
    }
    // ReplayGain
    audioEngine.setReplayGainEnabled(settings.replayGainEnabled !== false);
    // EQ
    if (settings.eqGains && Array.isArray(settings.eqGains)) {
      audioEngine.setEqPreset(settings.eqGains);
    }

    // ── 6. Output Device ────────────────────────────────────────────────────
    if (settings.outputDeviceId) {
      (async () => {
        try {
          const elA = (audioEngine as any).elA as HTMLAudioElement | null;
          const elB = (audioEngine as any).elB as HTMLAudioElement | null;
          if (elA && typeof (elA as any).setSinkId === "function") {
            await (elA as any).setSinkId(settings.outputDeviceId);
          }
          if (elB && typeof (elB as any).setSinkId === "function") {
            await (elB as any).setSinkId(settings.outputDeviceId);
          }
        } catch {
          // Device tidak tersedia, abaikan
        }
      })();
    }

    // ── 7. Bahasa (i18n) ─────────────────────────────────────────────────────
    // Bahasa disimpan di localStorage terpisah oleh i18n.ts (key: "resonance-lang")
    // Kita baca dan terapkan agar seluruh app menggunakan bahasa yang tersimpan
    try {
      const savedLang = localStorage.getItem("resonance-lang");
      if (savedLang === "id" || savedLang === "en") {
        setLang(savedLang);
        document.documentElement.lang = savedLang;
      }
    } catch {
      // localStorage tidak tersedia
    }

    // ── 8. CSS Variables Tambahan ────────────────────────────────────────────
    // Pastikan variabel yang mungkin belum di-set selalu ada
    const root = document.documentElement;
    root.style.setProperty("--accent-pink", "#EC4899");
    root.style.setProperty("--accent-pink-dim", "rgba(236,72,153,0.15)");
    root.style.setProperty("--accent-pink-border", "rgba(236,72,153,0.35)");

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // ← [] artinya HANYA dijalankan sekali saat mount, tidak re-run
}