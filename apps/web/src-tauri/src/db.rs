use rusqlite::{Connection, Result};
use std::fs;
use std::path::PathBuf;

pub fn get_db_path() -> PathBuf {
    let dir = PathBuf::from("../.kb");
    if !dir.exists() {
        let _ = fs::create_dir_all(&dir);
    }
    dir.join("index.sqlite")
}

pub fn init_db() -> Result<Connection> {
    let path = get_db_path();
    let conn = Connection::open(&path)?;

    // Create notes_meta table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS notes_meta (
            id TEXT PRIMARY KEY,
            title TEXT,
            path TEXT UNIQUE,
            created_at INTEGER,
            updated_at INTEGER,
            tags TEXT
        )",
        [],
    )?;

    // Create notes_fts virtual table for full-text search
    conn.execute(
        "CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
            id UNINDEXED,
            title,
            content,
            tokenize='unicode61'
        )",
        [],
    )?;

    Ok(conn)
}
