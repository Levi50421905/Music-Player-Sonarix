/**
 * lib.rs — Resonance Tauri backend v5
 *
 * TAMBAHAN vs v4:
 *   [NEW] watch_folder / unwatch_folder commands menggunakan
 *         tauri-plugin-fs watch API untuk deteksi file baru
 *         tanpa intervensi user. Event dikirim ke frontend via
 *         app.emit("fs:file-added", path).
 */

use std::path::{Path, PathBuf};
use std::io::Write;
use std::sync::Arc;
use std::collections::HashMap;
use tauri::{Manager, Emitter};
use tokio::sync::Semaphore;
use tokio::sync::OnceCell;
use tokio::sync::Mutex as AsyncMutex;

// Semaphore decode yang benar-benar shared
static DECODE_SEM: OnceCell<Arc<Semaphore>> = OnceCell::const_new();

async fn decode_semaphore() -> Arc<Semaphore> {
    DECODE_SEM
        .get_or_init(|| async { Arc::new(Semaphore::new(2)) })
        .await
        .clone()
}

// Watcher registry: path → watcher handle
// Kita simpan sebagai Arc<AsyncMutex<HashMap>> agar bisa di-share antar thread
static WATCHERS: OnceCell<Arc<AsyncMutex<HashMap<String, WatchHandle>>>> = OnceCell::const_new();

async fn watchers() -> Arc<AsyncMutex<HashMap<String, WatchHandle>>> {
    WATCHERS
        .get_or_init(|| async {
            Arc::new(AsyncMutex::new(HashMap::new()))
        })
        .await
        .clone()
}

// Handle untuk mematikan watcher saat unwatch
struct WatchHandle {
    _stop: tokio::sync::oneshot::Sender<()>,
}

const AUDIO_EXTENSIONS: &[&str] = &[
    "mp3", "flac", "wav", "ogg", "aac", "m4a", "alac", "wma", "opus", "ape"
];

fn is_audio_file(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| AUDIO_EXTENSIONS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:resonance.db", vec![])
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            get_app_version,
            open_file_manager,
            decode_audio_to_cache,
            get_cache_path,
            get_cache_size,
            evict_audio_cache,
            get_track_meta,
            decode_audio_to_wav,
            check_audio_support,
            watch_folder,    // [NEW]
            unwatch_folder,  // [NEW]
            list_watch_folders, // [NEW]
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn cache_dir_from_handle(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Gagal resolve app_local_data_dir: {}", e))?;
    let dir = base.join("audio_cache");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Gagal buat cache dir: {}", e))?;
    Ok(dir)
}

fn fnv1a_64(input: &str) -> u64 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in input.as_bytes() {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
}

fn cache_path_for(dir: &Path, source_path: &str) -> PathBuf {
    let hash = fnv1a_64(source_path);
    dir.join(format!("{:016x}.wav", hash))
}

// ─── [NEW] Folder Watch Commands ──────────────────────────────────────────────

/// Mulai watch folder. Setiap kali file audio baru ditambahkan,
/// emit event "fs:file-added" ke frontend dengan path file.
#[tauri::command]
async fn watch_folder(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let watchers = watchers().await;
    let mut map = watchers.lock().await;

    // Sudah di-watch → skip
    if map.contains_key(&path) {
        return Ok(());
    }

    let watch_path = PathBuf::from(&path);
    if !watch_path.exists() {
        return Err(format!("Path tidak ditemukan: {}", path));
    }

    let (stop_tx, mut stop_rx) = tokio::sync::oneshot::channel::<()>();
    let app_clone = app.clone();
    let watch_path_clone = watch_path.clone();
    let path_clone = path.clone();

    tokio::spawn(async move {
        // Polling setiap 5 detik — sederhana dan cross-platform
        // Tauri v2 plugin-fs watch masih experimental; polling lebih stabil
        let mut known_files: std::collections::HashSet<PathBuf> = std::collections::HashSet::new();

        // Inisialisasi dengan file yang sudah ada
        if let Ok(entries) = collect_audio_files(&watch_path_clone) {
            known_files.extend(entries);
        }

        loop {
            tokio::select! {
                _ = &mut stop_rx => {
                    break;
                }
                _ = tokio::time::sleep(tokio::time::Duration::from_secs(5)) => {
                    match collect_audio_files(&watch_path_clone) {
                        Ok(current_files) => {
                            let current_set: std::collections::HashSet<PathBuf> =
                                current_files.into_iter().collect();

                            // File baru = ada di current tapi tidak di known
                            for new_file in current_set.difference(&known_files) {
                                let file_str = new_file.to_string_lossy().to_string();
                                // Emit ke frontend
                                let _ = app_clone.emit("fs:file-added", file_str);
                            }

                            known_files = current_set;
                        }
                        Err(_) => {
                            // Folder mungkin dihapus — hentikan watcher
                            break;
                        }
                    }
                }
            }
        }
    });

    map.insert(path, WatchHandle { _stop: stop_tx });
    Ok(())
}

/// Hentikan watch folder.
#[tauri::command]
async fn unwatch_folder(path: String) -> Result<(), String> {
    let watchers = watchers().await;
    let mut map = watchers.lock().await;

    if map.remove(&path).is_some() {
        Ok(())
    } else {
        Err(format!("Folder tidak sedang di-watch: {}", path))
    }
}

/// Daftar folder yang sedang di-watch.
#[tauri::command]
async fn list_watch_folders() -> Vec<String> {
    let watchers = watchers().await;
    let map = watchers.lock().await;
    map.keys().cloned().collect()
}

fn collect_audio_files(dir: &Path) -> Result<Vec<PathBuf>, String> {
    let mut files = Vec::new();
    collect_recursive(dir, &mut files)
        .map_err(|e| format!("Gagal scan: {}", e))?;
    Ok(files)
}

fn collect_recursive(dir: &Path, out: &mut Vec<PathBuf>) -> std::io::Result<()> {
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            // Abaikan hidden directories
            if path.file_name()
                .and_then(|n| n.to_str())
                .map(|n| n.starts_with('.'))
                .unwrap_or(false)
            {
                continue;
            }
            let _ = collect_recursive(&path, out);
        } else if is_audio_file(&path) {
            out.push(path);
        }
    }
    Ok(())
}

// ─── Commands (sama seperti sebelumnya) ───────────────────────────────────────

#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
async fn get_track_meta(path: String) -> Result<serde_json::Value, String> {
    let ext = Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    if ext == "flac" {
        match claxon::FlacReader::open(&path) {
            Ok(reader) => {
                let info = reader.streaminfo();
                let duration_secs = if info.sample_rate > 0 {
                    info.samples.unwrap_or(0) as f64 / info.sample_rate as f64
                } else {
                    0.0
                };
                let mut rg_gain: f64 = 0.0;
                for tag in reader.tags() {
                    let key = tag.0.to_uppercase();
                    if key == "R128_TRACK_GAIN" || key == "REPLAYGAIN_TRACK_GAIN" {
                        let val_str = tag.1.trim().trim_end_matches(" dB");
                        if let Ok(v) = val_str.parse::<f64>() {
                            rg_gain = v;
                            break;
                        }
                    }
                }
                return Ok(serde_json::json!({
                    "duration": duration_secs,
                    "sampleRate": info.sample_rate,
                    "channels": info.channels,
                    "bitsPerSample": info.bits_per_sample,
                    "replayGain": rg_gain,
                }));
            }
            Err(_) => {}
        }
    }

    Ok(serde_json::json!({ "duration": null, "replayGain": 0.0 }))
}

#[tauri::command]
async fn decode_audio_to_cache(
    app: tauri::AppHandle,
    path: String,
) -> Result<String, String> {
    let dir   = cache_dir_from_handle(&app)?;
    let cache = cache_path_for(&dir, &path);

    if cache.exists() {
        return Ok(cache.to_string_lossy().into_owned());
    }

    let ext = Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let sem = decode_semaphore().await;
    let _permit = sem
        .acquire()
        .await
        .map_err(|e| format!("Semaphore acquire error: {}", e))?;

    let path_clone  = path.clone();
    let _cache_clone = cache.clone();

    let wav_bytes = tokio::task::spawn_blocking(move || -> Result<Vec<u8>, String> {
        match ext.as_str() {
            "flac" => decode_flac(&path_clone),
            "wav"  => std::fs::read(&path_clone)
                .map_err(|e| format!("Gagal baca WAV: {}", e)),
            other  => Err(format!("Format tidak didukung untuk decode: {}", other)),
        }
    })
    .await
    .map_err(|e| format!("Decode task error: {}", e))??;

    let tmp = cache.with_extension("tmp");
    {
        let mut f = std::fs::File::create(&tmp)
            .map_err(|e| format!("Gagal buat file temp: {}", e))?;
        f.write_all(&wav_bytes)
            .map_err(|e| format!("Gagal tulis cache: {}", e))?;
    }
    std::fs::rename(&tmp, &cache)
        .map_err(|e| format!("Gagal rename cache: {}", e))?;

    Ok(cache.to_string_lossy().into_owned())
}

#[tauri::command]
fn get_cache_path(app: tauri::AppHandle, source_path: String) -> String {
    match cache_dir_from_handle(&app) {
        Ok(dir) => {
            let p = cache_path_for(&dir, &source_path);
            if p.exists() { p.to_string_lossy().into_owned() } else { String::new() }
        }
        Err(_) => String::new(),
    }
}

#[tauri::command]
fn get_cache_size(app: tauri::AppHandle) -> Result<u64, String> {
    let dir = cache_dir_from_handle(&app)?;
    let total = std::fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .flatten()
        .filter_map(|e| e.metadata().ok())
        .map(|m| m.len())
        .sum();
    Ok(total)
}

#[tauri::command]
async fn evict_audio_cache(app: tauri::AppHandle, max_bytes: u64) -> Result<u64, String> {
    let dir = cache_dir_from_handle(&app)?;

    let mut entries: Vec<(PathBuf, u64, std::time::SystemTime)> = Vec::new();
    if let Ok(read) = std::fs::read_dir(&dir) {
        for entry in read.flatten() {
            let p = entry.path();
            if p.extension().and_then(|e| e.to_str()) == Some("wav") {
                if let Ok(meta) = p.metadata() {
                    let mtime = meta.modified().unwrap_or(std::time::UNIX_EPOCH);
                    entries.push((p, meta.len(), mtime));
                }
            }
        }
    }

    let total: u64 = entries.iter().map(|(_, sz, _)| sz).sum();
    if total <= max_bytes { return Ok(total); }

    entries.sort_by_key(|(_, _, t)| *t);

    let mut freed = 0u64;
    let to_free   = total - max_bytes;
    for (path, size, _) in entries {
        if freed >= to_free { break; }
        if std::fs::remove_file(&path).is_ok() { freed += size; }
    }

    Ok(total - freed)
}

#[tauri::command]
async fn decode_audio_to_wav(app: tauri::AppHandle, path: String) -> Result<String, String> {
    decode_audio_to_cache(app, path).await
}

#[tauri::command]
fn check_audio_support() -> Vec<String> {
    vec!["mp3".into(), "aac".into(), "m4a".into(), "wav".into(), "ogg".into(), "opus".into()]
}

#[tauri::command]
async fn open_file_manager(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let folder = Path::new(&path).parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| path.clone());
        std::process::Command::new("explorer").arg(&folder).spawn().map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg("-R").arg(&path).spawn().map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        let folder = Path::new(&path).parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| path.clone());
        std::process::Command::new("xdg-open").arg(&folder).spawn().map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ─── FLAC decode ──────────────────────────────────────────────────────────────

fn decode_flac(path: &str) -> Result<Vec<u8>, String> {
    use claxon::FlacReader;

    let reader = FlacReader::open(path)
        .map_err(|e| format!("Gagal buka FLAC: {}", e))?;
    let info            = reader.streaminfo();
    let sample_rate     = info.sample_rate;
    let channels        = info.channels as u16;
    let bits_per_sample = info.bits_per_sample as u16;

    let mut reader2 = FlacReader::open(path)
        .map_err(|e| format!("Gagal buka FLAC kedua kali: {}", e))?;

    let estimated_samples = info.samples.unwrap_or(0) as usize;
    let mut samples: Vec<i32> = Vec::with_capacity(estimated_samples.min(50_000_000));

    let mut iter = reader2.samples();
    while let Some(s) = iter.next() {
        samples.push(s.map_err(|e| format!("Error sample FLAC: {}", e))?);
    }

    pcm_to_wav(&samples, sample_rate, channels, bits_per_sample)
}

fn pcm_to_wav(
    samples: &[i32],
    sample_rate: u32,
    channels: u16,
    bits_per_sample: u16,
) -> Result<Vec<u8>, String> {
    let bytes_per_sample = (bits_per_sample / 8) as usize;
    let data_size        = samples.len() * bytes_per_sample;
    let file_size        = 36 + data_size;

    let mut wav = Vec::with_capacity(44 + data_size);

    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(file_size as u32).to_le_bytes());
    wav.extend_from_slice(b"WAVE");
    wav.extend_from_slice(b"fmt ");
    wav.extend_from_slice(&16u32.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes());
    wav.extend_from_slice(&channels.to_le_bytes());
    wav.extend_from_slice(&sample_rate.to_le_bytes());
    let byte_rate   = sample_rate * channels as u32 * bits_per_sample as u32 / 8;
    let block_align = channels * bits_per_sample / 8;
    wav.extend_from_slice(&byte_rate.to_le_bytes());
    wav.extend_from_slice(&block_align.to_le_bytes());
    wav.extend_from_slice(&bits_per_sample.to_le_bytes());
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&(data_size as u32).to_le_bytes());

    for &sample in samples {
        match bits_per_sample {
            8  => wav.push((sample as i8 as i16 + 128) as u8),
            16 => wav.extend_from_slice(&(sample as i16).to_le_bytes()),
            24 => { let b = sample.to_le_bytes(); wav.push(b[0]); wav.push(b[1]); wav.push(b[2]); }
            32 => wav.extend_from_slice(&sample.to_le_bytes()),
            _  => return Err(format!("bits_per_sample tidak didukung: {}", bits_per_sample)),
        }
    }

    Ok(wav)
}