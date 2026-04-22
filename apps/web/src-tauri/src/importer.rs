use tauri::command;
use scraper::{Html, Selector};
use lopdf::Document;
use std::fs;
use crate::notes::create_note;
use std::path::PathBuf;

#[command]
pub async fn import_url(url: String, tags: Vec<String>) -> Result<String, String> {
    let response = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    let html_content = response.text().await.map_err(|e| e.to_string())?;
    
    let document = Html::parse_document(&html_content);
    
    // Very basic title extraction
    let title_selector = Selector::parse("title").unwrap();
    let title = document.select(&title_selector).next()
        .map(|el| el.inner_html())
        .unwrap_or_else(|| "Imported URL".to_string());
    
    // Basic body extraction (in a real scenario, use readability algorithm)
    let body_selector = Selector::parse("body").unwrap();
    let body = document.select(&body_selector).next()
        .map(|el| el.text().collect::<Vec<_>>().join(" "))
        .unwrap_or_else(|| "".to_string());
        
    // Markdown formatting
    let markdown = format!("# {}\n\n[Original URL]({})\n\n{}", title, url, body);
    
    let note = create_note(title, markdown, tags).map_err(|e| e.to_string())?;
    
    Ok(note.id)
}

#[command]
pub fn import_file(name: String, content: Vec<u8>, tags: Vec<String>) -> Result<String, String> {
    let path_buf = PathBuf::from(&name);
    let ext = path_buf.extension().and_then(|e| e.to_str()).unwrap_or("");
    
    let title = path_buf.file_stem().and_then(|s| s.to_str()).unwrap_or("Imported File").to_string();
    let text_content = match ext.to_lowercase().as_str() {
        "pdf" => {
            let doc = Document::load_mem(&content).map_err(|e| e.to_string())?;
            let mut text = String::new();
            for page in doc.get_pages().keys() {
                if let Ok(t) = doc.extract_text(&[*page]) {
                    text.push_str(&t);
                    text.push('\n');
                }
            }
            text
        },
        "md" | "txt" => {
            String::from_utf8(content).map_err(|e| e.to_string())?
        },
        _ => return Err("Unsupported file type".to_string()),
    };
    
    let note = create_note(title, text_content, tags).map_err(|e| e.to_string())?;
    Ok(note.id)
}

#[command]
pub fn create_memo(content: String, tags: Vec<String>) -> Result<String, String> {
    let title = content.lines().next().unwrap_or("New Memo").to_string();
    let note = create_note(title, content, tags).map_err(|e| e.to_string())?;
    Ok(note.id)
}
