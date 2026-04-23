use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{command, State};
use gray_matter::engine::YAML;
use gray_matter::Matter;
use uuid::Uuid;
use chrono::Utc;
use crate::db::get_db_path;

#[derive(Serialize, Deserialize, Debug)]
pub struct Note {
    pub id: String,
    pub title: String,
    pub path: String,
    pub content: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub tags: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct NoteMeta {
    pub id: String,
    pub title: String,
    pub path: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub tags: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FrontMatter {
    pub id: Option<String>,
    pub title: Option<String>,
    pub created_at: Option<i64>,
    pub updated_at: Option<i64>,
    pub tags: Option<Vec<String>>,
}

fn get_notes_dir() -> PathBuf {
    let dir = PathBuf::from("../.kb/notes");
    if !dir.exists() {
        let _ = fs::create_dir_all(&dir);
    }
    dir
}

#[command]
pub fn get_categories() -> Result<Vec<String>, String> {
    // Currently tags serve as categories. Let's extract unique tags from db.
    let conn = Connection::open(get_db_path()).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT tags FROM notes_meta").map_err(|e| e.to_string())?;
    
    let tag_iters = stmt.query_map([], |row| {
        let tags: String = row.get(0)?;
        Ok(tags)
    }).map_err(|e| e.to_string())?;
    
    let mut all_tags = std::collections::HashSet::new();
    for tags_str in tag_iters {
        if let Ok(ts) = tags_str {
            if let Ok(parsed) = serde_json::from_str::<Vec<String>>(&ts) {
                for t in parsed {
                    all_tags.insert(t);
                }
            }
        }
    }
    
    let mut result: Vec<String> = all_tags.into_iter().collect();
    result.sort();
    Ok(result)
}

#[command]
pub fn get_notes() -> Result<Vec<NoteMeta>, String> {
    let conn = Connection::open(get_db_path()).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, title, path, created_at, updated_at, tags FROM notes_meta ORDER BY updated_at DESC").map_err(|e| e.to_string())?;
    
    let note_iters = stmt.query_map([], |row| {
        let tags_str: String = row.get(5)?;
        let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();
        Ok(NoteMeta {
            id: row.get(0)?,
            title: row.get(1)?,
            path: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
            tags,
        })
    }).map_err(|e| e.to_string())?;
    
    let mut notes = Vec::new();
    for note in note_iters {
        if let Ok(n) = note {
            notes.push(n);
        }
    }
    
    Ok(notes)
}

#[command]
pub fn get_note(id: String) -> Result<Note, String> {
    let conn = Connection::open(get_db_path()).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, title, path, created_at, updated_at, tags FROM notes_meta WHERE id = ?1").map_err(|e| e.to_string())?;
    
    let mut meta = None;
    let mut rows = stmt.query([&id]).map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let tags_str: String = row.get(5)?;
        let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();
        meta = Some(NoteMeta {
            id: row.get(0)?,
            title: row.get(1)?,
            path: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
            tags,
        });
    }
    
    let meta = meta.ok_or_else(|| "Note not found".to_string())?;
    let abs_path = get_notes_dir().join(&meta.path);
    let raw_content = fs::read_to_string(&abs_path).unwrap_or_default();
    
    let matter = Matter::<YAML>::new();
    let result = matter.parse(&raw_content);
    
    Ok(Note {
        id: meta.id,
        title: meta.title,
        path: meta.path,
        content: result.content,
        created_at: meta.created_at,
        updated_at: meta.updated_at,
        tags: meta.tags,
    })
}

#[command]
pub fn create_note(title: String, content: String, tags: Vec<String>) -> Result<Note, String> {
    let id = Uuid::new_v4().to_string();
    let created_at = Utc::now().timestamp_millis();
    let updated_at = created_at;
    let filename = format!("{}.md", id);
    let path = filename.clone();
    
    let fm = FrontMatter {
        id: Some(id.clone()),
        title: Some(title.clone()),
        created_at: Some(created_at),
        updated_at: Some(updated_at),
        tags: Some(tags.clone()),
    };
    
    let fm_str = serde_json::to_string(&fm).map_err(|e| e.to_string())?;
    // We'll use yaml for frontmatter
    let yaml_fm = format!("---\n{}\n---\n", serde_yaml::to_string(&fm).unwrap_or_default());
    let full_content = format!("{}{}", yaml_fm, content);
    
    let abs_path = get_notes_dir().join(&filename);
    fs::write(&abs_path, full_content).map_err(|e| e.to_string())?;
    
    let tags_json = serde_json::to_string(&tags).unwrap_or_default();
    
    let conn = Connection::open(get_db_path()).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO notes_meta (id, title, path, created_at, updated_at, tags) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        [&id, &title, &path, &created_at.to_string(), &updated_at.to_string(), &tags_json],
    ).map_err(|e| e.to_string())?;
    
    conn.execute(
        "INSERT INTO notes_fts (id, title, content) VALUES (?1, ?2, ?3)",
        [&id, &title, &content],
    ).map_err(|e| e.to_string())?;
    
    Ok(Note {
        id,
        title,
        path,
        content,
        created_at,
        updated_at,
        tags,
    })
}

#[command]
pub fn update_note(id: String, title: String, content: String, tags: Vec<String>) -> Result<Note, String> {
    let updated_at = Utc::now().timestamp_millis();
    
    let conn = Connection::open(get_db_path()).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT path, created_at FROM notes_meta WHERE id = ?1").map_err(|e| e.to_string())?;
    
    let mut path = String::new();
    let mut created_at = 0;
    
    let mut rows = stmt.query([&id]).map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        path = row.get(0)?;
        created_at = row.get(1)?;
    } else {
        return Err("Note not found".to_string());
    }
    
    let fm = FrontMatter {
        id: Some(id.clone()),
        title: Some(title.clone()),
        created_at: Some(created_at),
        updated_at: Some(updated_at),
        tags: Some(tags.clone()),
    };
    
    let yaml_fm = format!("---\n{}\n---\n", serde_yaml::to_string(&fm).unwrap_or_default());
    let full_content = format!("{}{}", yaml_fm, content);
    
    let abs_path = get_notes_dir().join(&path);
    fs::write(&abs_path, full_content).map_err(|e| e.to_string())?;
    
    let tags_json = serde_json::to_string(&tags).unwrap_or_default();
    
    conn.execute(
        "UPDATE notes_meta SET title = ?1, updated_at = ?2, tags = ?3 WHERE id = ?4",
        [&title, &updated_at.to_string(), &tags_json, &id],
    ).map_err(|e| e.to_string())?;
    
    conn.execute(
        "UPDATE notes_fts SET title = ?1, content = ?2 WHERE id = ?3",
        [&title, &content, &id],
    ).map_err(|e| e.to_string())?;
    
    Ok(Note {
        id,
        title,
        path,
        content,
        created_at,
        updated_at,
        tags,
    })
}

#[command]
pub fn delete_note(id: String) -> Result<(), String> {
    let conn = Connection::open(get_db_path()).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT path FROM notes_meta WHERE id = ?1").map_err(|e| e.to_string())?;
    
    let mut path = String::new();
    let mut rows = stmt.query([&id]).map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        path = row.get(0)?;
    } else {
        return Err("Note not found".to_string());
    }
    
    let abs_path = get_notes_dir().join(&path);
    if abs_path.exists() {
        fs::remove_file(&abs_path).map_err(|e| e.to_string())?;
    }
    
    conn.execute("DELETE FROM notes_meta WHERE id = ?1", [&id]).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM notes_fts WHERE id = ?1", [&id]).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[command]
pub fn rename_category(old_name: String, new_name: String) -> Result<(), String> {
    let conn = Connection::open(get_db_path()).map_err(|e| e.to_string())?;
    
    // We need to fetch all notes that have this tag and rename it
    let mut stmt = conn.prepare("SELECT id, tags FROM notes_meta").map_err(|e| e.to_string())?;
    let note_iters = stmt.query_map([], |row| {
        let id: String = row.get(0)?;
        let tags_str: String = row.get(1)?;
        let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();
        Ok((id, tags))
    }).map_err(|e| e.to_string())?;
    
    let mut to_update = Vec::new();
    for row in note_iters {
        if let Ok((id, tags)) = row {
            if tags.contains(&old_name) {
                let mut new_tags = tags.clone();
                for tag in &mut new_tags {
                    if *tag == old_name {
                        *tag = new_name.clone();
                    }
                }
                to_update.push((id, new_tags));
            }
        }
    }
    
    for (id, tags) in to_update {
        // Just update tags in db
        let tags_json = serde_json::to_string(&tags).unwrap_or_default();
        conn.execute(
            "UPDATE notes_meta SET tags = ?1 WHERE id = ?2",
            [&tags_json, &id],
        ).map_err(|e| e.to_string())?;
        
        // Also need to update the file's frontmatter
        if let Ok(mut note) = get_note(id.clone()) {
            note.tags = tags.clone();
            let _ = update_note(id, note.title, note.content, tags);
        }
    }
    
    Ok(())
}

#[command]
pub fn search_notes(q: String) -> Result<Vec<NoteMeta>, String> {
    let conn = Connection::open(get_db_path()).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT m.id, m.title, m.path, m.created_at, m.updated_at, m.tags 
         FROM notes_meta m
         JOIN notes_fts f ON m.id = f.id
         WHERE notes_fts MATCH ?1
         ORDER BY rank"
    ).map_err(|e| e.to_string())?;
    
    let note_iters = stmt.query_map([&q], |row| {
        let tags_str: String = row.get(5)?;
        let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();
        Ok(NoteMeta {
            id: row.get(0)?,
            title: row.get(1)?,
            path: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
            tags,
        })
    }).map_err(|e| e.to_string())?;
    
    let mut notes = Vec::new();
    for note in note_iters {
        if let Ok(n) = note {
            notes.push(n);
        }
    }
    
    Ok(notes)
}
