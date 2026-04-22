use std::path::Path;
use std::sync::mpsc::channel;
use notify::{Watcher, RecursiveMode, Event, RecommendedWatcher, Config};
use tauri::{AppHandle, Emitter};
use std::time::Duration;
use crate::db::get_db_path;

pub fn start_watcher(app_handle: AppHandle) {
    std::thread::spawn(move || {
        let (tx, rx) = channel();
        let mut watcher = RecommendedWatcher::new(tx, Config::default()).unwrap();
        
        let path = std::path::PathBuf::from("../.kb/notes");
        if !path.exists() {
            let _ = std::fs::create_dir_all(&path);
        }
        
        watcher.watch(&path, RecursiveMode::Recursive).unwrap();
        
        loop {
            match rx.recv() {
                Ok(Ok(event)) => {
                    // When a file is updated/created/deleted, we can emit an event to the frontend
                    // In a complete implementation we'd also sync the sqlite db here
                    // For simplicity, we just notify the frontend that notes changed
                    let _ = app_handle.emit("notes-changed", ());
                },
                Ok(Err(e)) => log::error!("watch error: {:?}", e),
                Err(e) => log::error!("watch channel error: {:?}", e),
            }
        }
    });
}
