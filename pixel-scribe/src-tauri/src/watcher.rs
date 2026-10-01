use base64::Engine;
use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use regex::Regex;
use serde_json::json;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::sync::mpsc::channel;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use lazy_static::lazy_static;

lazy_static! {
    static ref PROCESSING_FILES: Arc<Mutex<HashSet<PathBuf>>> = Arc::new(Mutex::new(HashSet::new()));
}

pub fn is_generic_image_name(filename: &str) -> bool {
    let re = Regex::new(
        r"(?i)^(untitled|screenshot|whatsapp image|img|image|capture|download|dsc|picture)[\s_-]*\d*.*$|^[0-9a-fA-F_-]+$|^\d+$"
    ).unwrap();
    
    let is_random_string = !filename.contains(' ') && !filename.contains('-') && filename.len() > 12;
    
    re.is_match(filename) || is_random_string
}

pub fn is_image_extension(ext: &str) -> bool {
    let ext = ext.to_lowercase();
    matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "webp")
}

pub fn start_watcher(app: AppHandle) {
    std::thread::spawn(move || {
        let (tx, rx) = channel();
        let mut watcher = RecommendedWatcher::new(tx, Config::default()).unwrap();
        
        let download_dir = dirs::download_dir().unwrap_or_default();
        let desktop_dir = dirs::desktop_dir().unwrap_or_default();
        let picture_dir = dirs::picture_dir().unwrap_or_default();
        
        if download_dir.exists() {
            let _ = watcher.watch(&download_dir, RecursiveMode::NonRecursive);
        }
        if desktop_dir.exists() {
            let _ = watcher.watch(&desktop_dir, RecursiveMode::NonRecursive);
        }
        if picture_dir.exists() {
            let _ = watcher.watch(&picture_dir, RecursiveMode::Recursive);
        }
        
        println!("Started watching folders...");
        
        for res in rx {
            match res {
                Ok(event) => {
                    match event.kind {
                        EventKind::Create(_) | EventKind::Modify(_) => {
                            for path in event.paths {
                                if path.is_file() {
                                    handle_new_file(&path, app.clone());
                                }
                            }
                        }
                        _ => {}
                    }
                },
                Err(e) => println!("watch error: {:?}", e),
            }
        }
    });
}

fn handle_new_file(path: &Path, app: AppHandle) {
    let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
    if !is_image_extension(ext) {
        return;
    }
    
    let filename = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
    if !is_generic_image_name(filename) {
        return;
    }
    
    let path_buf = path.to_path_buf();
    
    // Check and insert into tracking set to avoid processing the same file multiple times
    {
        let mut set = PROCESSING_FILES.lock().unwrap();
        if set.contains(&path_buf) {
            return;
        }
        set.insert(path_buf.clone());
    }
    
    println!("Found generic image: {:?}", path);
    
    let id = path_buf.to_string_lossy().to_string();
    let app_clone = app.clone();
    
    let _ = app.emit("file-processing", json!({
        "id": id,
        "name": path.file_name().unwrap_or_default().to_string_lossy(),
        "status": "waiting",
        "progress": 10,
        "message": "Waiting for file write..."
    }));
    
    tauri::async_runtime::spawn(async move {
        // give it a second for the file to be fully written
        tokio::time::sleep(Duration::from_secs(3)).await;
        
        let _ = app_clone.emit("file-processing", json!({
            "id": id.clone(),
            "status": "processing",
            "progress": 40,
            "message": "Analyzing image content..."
        }));
        
        if let Err(e) = process_image(path_buf.clone(), app_clone.clone()).await {
            println!("Error processing image {:?}: {}", path_buf, e);
            let _ = app_clone.emit("file-processing", json!({
                "id": id,
                "status": "error",
                "progress": 0,
                "message": format!("Error: {}", e)
            }));
        }
        
        // Remove from tracking set after we are done
        let mut set = PROCESSING_FILES.lock().unwrap();
        set.remove(&path_buf);
    });
}

pub async fn process_image(path: PathBuf, app: AppHandle) -> Result<String, Box<dyn std::error::Error>> {
    let api_key = std::env::var("NVIDIA_API_KEY").unwrap_or_default();
    if api_key.is_empty() || api_key == "your_nvidia_api_key_here" {
        return Err("NVIDIA API key not set in .env".into());
    }
    
    let model = std::env::var("NVIDIA_MODEL").unwrap_or_else(|_| "meta/llama-3.2-11b-vision-instruct".to_string());
    
    // Check if file still exists (could be renamed by another process)
    if !path.exists() {
        return Err("File no longer exists after wait".into());
    }
    
    let image_bytes = fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))?;
    let base64_image = base64::engine::general_purpose::STANDARD.encode(image_bytes);
    
    let mime_type = match path.extension().and_then(|e| e.to_str()).unwrap_or("png") {
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        _ => "image/png",
    };
    let data_url = format!("data:{};base64,{}", mime_type, base64_image);
    
    let client = reqwest::Client::new();
    
    let request_body = json!({
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": "You are a programmatic file renaming tool. Your ONLY job is to output a 2-4 word description in lowercase kebab-case (e.g. red-car-driving). NEVER use conversational text, NEVER say 'the image shows', NEVER use punctuation."
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "Analyze this image and output exactly 2-4 words in kebab-case to be used as a filename."
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": data_url
                        }
                    }
                ]
            }
        ],
        "max_tokens": 15,
        "temperature": 0.1,
        "stream": false
    });
    
    let id = path.to_string_lossy().to_string();
    
    let _ = app.emit("file-processing", json!({
        "id": id.clone(),
        "status": "processing",
        "progress": 60,
        "message": "Generating filename..."
    }));
    
    println!("Requesting new name for {:?} using model {}", path, model);
    let res = client.post("https://integrate.api.nvidia.com/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Accept", "application/json")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("API request failed: {}", e))?;
        
    let res_json: serde_json::Value = res.json().await.map_err(|e| format!("Failed to parse JSON: {}", e))?;
    
    let new_name = res_json["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .trim();
        
    if new_name.is_empty() {
        return Err(format!("Empty response from API or unexpected structure: {:?}", res_json).into());
    }
    
    let mut clean_name = new_name
        .to_lowercase()
        .replace('\n', "")
        .replace('"', "")
        .replace('\'', "")
        .replace('.', "")
        .replace(',', "")
        .replace(' ', "-")
        .trim()
        .to_string();
        
    // Clean up conversational prefixes if the model ignored instructions
    let prefixes_to_remove = [
        "the-image-shows-a-", "the-image-shows-", "this-is-a-", "this-is-",
        "an-image-of-a-", "an-image-of-", "image-of-a-", "image-of-",
        "a-photo-of-a-", "a-photo-of-", "photo-of-", "picture-of-", "a-close-up-of-a-", "a-close-up-of-"
    ];
    
    for prefix in prefixes_to_remove {
        if clean_name.starts_with(prefix) {
            clean_name = clean_name.trim_start_matches(prefix).to_string();
            break;
        }
    }
    
    // Ensure it doesn't get ridiculously long
    let parts: Vec<&str> = clean_name.split('-').collect();
    if parts.len() > 6 {
        clean_name = parts[0..6].join("-");
    }
        
    let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("png");
    let mut new_path = path.with_file_name(format!("{}.{}", clean_name, ext));
    
    let mut counter = 1;
    while new_path.exists() && new_path != path {
        new_path = path.with_file_name(format!("{}-{}.{}", clean_name, counter, ext));
        counter += 1;
    }
    
    if new_path != path {
        fs::rename(&path, &new_path).map_err(|e| format!("Failed to rename file: {}", e))?;
        println!("Renamed {:?} -> {:?}", path, new_path);
        
        let old_name_str = path.file_name().unwrap_or_default().to_string_lossy();
        let new_name_str = new_path.file_name().unwrap_or_default().to_string_lossy();
        
        let _ = app.emit("file-processing", json!({
            "id": id,
            "status": "completed",
            "progress": 100,
            "message": "Renaming complete",
            "old_name": old_name_str,
            "new_name": new_name_str,
            "old_path": path.to_string_lossy(),
            "new_path": new_path.to_string_lossy()
        }));
        return Ok(new_name_str.into_owned());
    }
    
    Ok(path.file_name().unwrap_or_default().to_string_lossy().into_owned())
}
