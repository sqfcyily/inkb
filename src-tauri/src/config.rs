use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

pub fn get_kb_dir() -> PathBuf {
    // Return ../.kb path
    PathBuf::from("../.kb")
}

pub fn read_json<T: for<'de> Deserialize<'de> + Default>(filename: &str) -> T {
    let path = get_kb_dir().join(filename);
    if let Ok(content) = fs::read_to_string(&path) {
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        T::default()
    }
}

pub fn write_json<T: Serialize>(filename: &str, data: &T) -> Result<(), String> {
    let dir = get_kb_dir();
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    let path = dir.join(filename);
    let content = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_secrets() -> serde_json::Value {
    let val: serde_json::Value = read_json("secrets.json");
    if val.is_null() { serde_json::json!({}) } else { val }
}

#[tauri::command]
pub fn write_secrets(secrets: serde_json::Value) -> Result<(), String> {
    write_json("secrets.json", &secrets)
}

#[tauri::command]
pub fn read_config() -> serde_json::Value {
    let val: serde_json::Value = read_json("config.json");
    if val.is_null() { serde_json::json!({}) } else { val }
}

#[tauri::command]
pub fn write_config(config: serde_json::Value) -> Result<(), String> {
    write_json("config.json", &config)
}
