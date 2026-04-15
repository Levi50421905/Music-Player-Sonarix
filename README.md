<div align="center">

# 🎵 Sonarix

**A modern, lightweight desktop music player built with Tauri + React**

[![Release](https://img.shields.io/github/v/release/Levi50421905/Music-Player-Sonarix?style=flat-square&color=6c63ff)](https://github.com/Levi50421905/Music-Player-Sonarix/releases)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows-blue?style=flat-square)](https://github.com/Levi50421905/Music-Player-Sonarix/releases)
[![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%202-orange?style=flat-square)](https://tauri.app)

</div>

---

## ✨ Overview

**Sonarix** (formerly known as **Sonarix**) is a fast, clean desktop music player that respects your local music library. Built with Tauri 2 and React, it combines the performance of a native app with the flexibility of a modern web frontend — all in a tiny installer footprint.

---

## 🚀 Download

| Installer | Type | Recommended |
|-----------|------|-------------|
| [Sonarix_1.0.0_x64-setup.exe](https://github.com/Levi50421905/Music-Player-Sonarix/releases/download/v1.0.0/Sonarix_1.0.0_x64-setup.exe) | NSIS Installer | ✅ Most users |
| [Sonarix_1.0.0_x64_en-US.msi](https://github.com/Levi50421905/Music-Player-Sonarix/releases/download/v1.0.0/Sonarix_1.0.0_x64_en-US.msi) | MSI Package | For enterprise / IT deployment |

> **Windows only** — macOS and Linux builds are planned for a future release.

---

## 🎧 Features

- **Local Library Management** — scan folders and manage your entire music collection in one place
- **Multi-format Support** — plays MP3, FLAC, WAV, OGG, AAC, M4A, ALAC, WMA, OPUS, APE
- **FLAC Native Decode** — high-quality FLAC decoding with ReplayGain support (R128 & RG tags)
- **Smart Audio Cache** — decoded audio is cached for fast repeat playback, with automatic eviction to manage disk usage
- **Auto Folder Watch** — monitors your music folders in the background and automatically picks up new files without needing a manual rescan
- **Synchronized Lyrics** — fetches LRC-format synced lyrics automatically via [lrclib.net](https://lrclib.net)
- **SQLite Library** — your library metadata is stored in a local SQLite database — fast, reliable, no cloud required
- **Mini Player** — a compact always-on-top mini player window for when you want music controls without the full UI
- **File Manager Integration** — open any track's folder directly in Windows Explorer

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop Runtime | [Tauri 2](https://tauri.app) |
| Frontend | React 18 + TypeScript |
| Styling | Tailwind CSS 4 |
| State Management | Zustand |
| Backend / Audio | Rust (claxon, hound, tokio) |
| Database | SQLite via tauri-plugin-sql |
| Build Tool | Vite 5 |

---

## 📦 Installation

### Option 1 — NSIS Installer (Recommended)
1. Download `Sonarix-setup.exe`
2. Run the installer and follow the setup wizard
3. Launch **Sonarix** from the Start Menu or Desktop shortcut

### Option 2 — MSI Package
1. Download `Sonarix_1.0.0_x64_en-US.msi`
2. Run the `.msi` file
3. Follow the Windows Installer prompts

> **Note:** Windows may show a SmartScreen warning on first launch since the app is not yet code-signed. Click **"More info" → "Run anyway"** to proceed. This is expected for new releases.

---

## 🖥️ System Requirements

| | Minimum |
|-|---------|
| OS | Windows 10 (x64) or later |
| RAM | 100 MB |
| Disk | 30 MB (installer) + cache space for decoded audio |
| Runtime | WebView2 (bundled with Windows 10/11, auto-installed if missing) |

---

## 🔒 Privacy

Sonarix is **fully local**. Your music library data never leaves your machine. The only external network calls made are:

- **lrclib.net** — to fetch synchronized lyrics (only when you open the lyrics panel)
- **Google Fonts** — for UI typography

No telemetry. No accounts. No subscriptions.

---

## 🐛 Known Issues (v1.0.0)

- MP3/AAC/M4A decoding is handled by the system's native WebView2 codec; quality depends on Windows codec availability
- Mini player window position is not persisted between sessions
- Very large FLAC files (>1 hour) may take a few seconds to cache on first play

---

## 🗺️ Roadmap

- [ ] macOS support
- [ ] Linux support
- [ ] Equalizer / DSP effects
- [ ] Playlist import/export (M3U, PLS)
- [ ] Last.fm scrobbling
- [ ] Album art background themes
- [ ] Code signing for smoother Windows install experience

---

## 🧑‍💻 Building from Source

### Prerequisites
- [Node.js](https://nodejs.org) 18+
- [Rust](https://rustup.rs) (stable toolchain)
- [Tauri CLI](https://tauri.app/start/prerequisites/)

```bash
# Clone the repository
git clone https://github.com/Levi50421905/Music-Player-Sonarix.git
cd Music-Player-Sonarix

# Install frontend dependencies
npm install

# Run in development mode
npm run tauri

# Build release binary
npm run build:release
```

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

<div align="center">
Made with ♥ using Tauri, React, and Rust
</div>