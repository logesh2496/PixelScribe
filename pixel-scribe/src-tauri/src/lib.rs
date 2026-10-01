mod watcher;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn rename_file(old_path: String, new_path: String) -> Result<(), String> {
    std::fs::rename(&old_path, &new_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_default_folder() -> Result<String, String> {
    dirs::download_dir()
        .map(|d| d.to_string_lossy().into_owned())
        .ok_or_else(|| "Could not find downloads directory".to_string())
}

#[tauri::command]
fn get_settings() -> Result<(String, String), String> {
    let api_key = std::env::var("NVIDIA_API_KEY").unwrap_or_default();
    let model = std::env::var("NVIDIA_MODEL").unwrap_or_else(|_| "meta/llama-3.2-11b-vision-instruct".to_string());
    Ok((api_key, model))
}

#[tauri::command]
fn save_settings(api_key: String, model: String) -> Result<(), String> {
    std::env::set_var("NVIDIA_API_KEY", &api_key);
    std::env::set_var("NVIDIA_MODEL", &model);
    
    if let Some(home) = dirs::home_dir() {
        let env_path = home.join(".pixel-scribe.env");
        let content = format!("NVIDIA_API_KEY={}\nNVIDIA_MODEL={}\n", api_key, model);
        std::fs::write(&env_path, content).map_err(|e| e.to_string())?;
    }
    
    Ok(())
}


#[tauri::command]
fn scan_folder(folder_path: String) -> Result<Vec<String>, String> {
    let mut files = Vec::new();
    let dir = std::path::PathBuf::from(folder_path);
    
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                    if watcher::is_image_extension(ext) {
                        files.push(path.to_string_lossy().into_owned());
                    }
                }
            }
        }
    }
    
    Ok(files)
}

#[tauri::command]
async fn process_image_command(app: tauri::AppHandle, path: String) -> Result<String, String> {
    watcher::process_image(std::path::PathBuf::from(path), app).await.map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load .env variables from home directory so it works in the built .app
    if let Some(home) = dirs::home_dir() {
        let _ = dotenvy::from_filename(home.join(".pixel-scribe.env"));
    }
    
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let handle = app.handle().clone();
            watcher::start_watcher(handle);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet, rename_file, get_default_folder, scan_folder, process_image_command, get_settings, save_settings])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
