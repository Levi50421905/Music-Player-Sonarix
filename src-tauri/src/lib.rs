#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:resonance.db", vec![])
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            get_app_version,
            open_file_manager,
            decode_audio_to_wav,
            check_audio_support,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
async fn open_file_manager(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        // Open the folder containing the file, selecting it
        let path_obj = std::path::Path::new(&path);
        let folder = path_obj.parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or(path.clone());
        
        std::process::Command::new("explorer")
            .arg(&folder)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        let path_obj = std::path::Path::new(&path);
        let folder = path_obj.parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or(path.clone());
        std::process::Command::new("xdg-open")
            .arg(&folder)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Check what formats the WebView can natively play
#[tauri::command]
fn check_audio_support() -> Vec<String> {
    // WebView2 on Windows can play: MP3, AAC, M4A, WAV, OGG (with codec)
    // It CANNOT natively play: FLAC, APE, WMA, ALAC
    vec![
        "mp3".to_string(),
        "aac".to_string(),
        "m4a".to_string(),
        "wav".to_string(),
        "ogg".to_string(),
        "opus".to_string(),
    ]
}

/// Decode audio file (FLAC, APE, etc.) to WAV bytes for WebView playback
/// Returns base64-encoded WAV data
#[tauri::command]
async fn decode_audio_to_wav(path: String) -> Result<String, String> {
    let ext = std::path::Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    match ext.as_str() {
        "flac" => decode_flac_to_wav(&path),
        "wav"  => {
            // WAV: just read and return as-is
            let data = std::fs::read(&path).map_err(|e| e.to_string())?;
            use base64::{Engine as _, engine::general_purpose};
Ok(general_purpose::STANDARD.encode(&data))
        },
        _ => Err(format!("Unsupported format for decode: {}", ext)),
    }
}

fn decode_flac_to_wav(path: &str) -> Result<String, String> {
    use claxon::FlacReader;
    
    let reader = FlacReader::open(path)
        .map_err(|e| format!("FLAC open failed: {}", e))?;
    
    let info = reader.streaminfo();
    let sample_rate = info.sample_rate;
    let channels = info.channels as u16;
    let bits_per_sample = info.bits_per_sample as u16;
    
    // Collect all samples
    let mut samples_i32: Vec<i32> = Vec::new();
    
    // We need to re-open since FlacReader is consumed
    let mut reader2 = FlacReader::open(path)
        .map_err(|e| format!("FLAC re-open failed: {}", e))?;
    
    let mut sample_iter = reader2.samples();
    while let Some(sample) = sample_iter.next() {
        samples_i32.push(sample.map_err(|e| format!("FLAC sample error: {}", e))?);
    }
    
    // Convert to WAV bytes
    let wav_bytes = pcm_to_wav(
        &samples_i32,
        sample_rate,
        channels,
        bits_per_sample,
    )?;
    
    Ok(base64::encode(&wav_bytes))
}

fn pcm_to_wav(
    samples: &[i32],
    sample_rate: u32,
    channels: u16,
    bits_per_sample: u16,
) -> Result<Vec<u8>, String> {
    let bytes_per_sample = (bits_per_sample / 8) as usize;
    let data_size = samples.len() * bytes_per_sample;
    let file_size = 36 + data_size;
    
    let mut wav = Vec::with_capacity(44 + data_size);
    
    // RIFF header
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(file_size as u32).to_le_bytes());
    wav.extend_from_slice(b"WAVE");
    
    // fmt chunk
    wav.extend_from_slice(b"fmt ");
    wav.extend_from_slice(&16u32.to_le_bytes()); // chunk size
    wav.extend_from_slice(&1u16.to_le_bytes());  // PCM format
    wav.extend_from_slice(&channels.to_le_bytes());
    wav.extend_from_slice(&sample_rate.to_le_bytes());
    
    let byte_rate = sample_rate * channels as u32 * bits_per_sample as u32 / 8;
    let block_align = channels * bits_per_sample / 8;
    wav.extend_from_slice(&byte_rate.to_le_bytes());
    wav.extend_from_slice(&block_align.to_le_bytes());
    wav.extend_from_slice(&bits_per_sample.to_le_bytes());
    
    // data chunk
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&(data_size as u32).to_le_bytes());
    
    // Write samples
    for &sample in samples {
        match bits_per_sample {
            16 => {
                wav.extend_from_slice(&(sample as i16).to_le_bytes());
            },
            24 => {
                let bytes = sample.to_le_bytes();
                wav.push(bytes[0]);
                wav.push(bytes[1]);
                wav.push(bytes[2]);
            },
            32 => {
                wav.extend_from_slice(&sample.to_le_bytes());
            },
            8 => {
                // 8-bit WAV is unsigned
                wav.push((sample as i8 as i16 + 128) as u8);
            },
            _ => {
                return Err(format!("Unsupported bits per sample: {}", bits_per_sample));
            }
        }
    }
    
    Ok(wav)
}