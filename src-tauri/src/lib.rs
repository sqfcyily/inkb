pub mod config;
pub mod db;
pub mod notes;
pub mod watcher;
pub mod git_sync;
pub mod importer;
pub mod ai;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .setup(|app| {
            // Initialize Database
            if let Err(e) = db::init_db() {
                log::error!("Failed to initialize database: {}", e);
            } else {
                log::info!("Database initialized successfully.");
            }
            
            watcher::start_watcher(app.handle().clone());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            config::read_secrets,
            config::write_secrets,
            config::read_config,
            config::write_config,
            notes::get_categories,
            notes::get_notes,
            notes::get_note,
            notes::create_note,
            notes::update_note,
            notes::delete_note,
            notes::search_notes,
            notes::rename_category,
            git_sync::git_status,
            git_sync::git_sync,
            importer::import_url,
            importer::import_file,
            importer::create_memo,
            ai::ai_summarize,
            ai::ai_completion
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
