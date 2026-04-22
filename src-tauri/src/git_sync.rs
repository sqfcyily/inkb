use git2::{Repository, Signature, PushOptions, RemoteCallbacks};
use std::path::PathBuf;
use tauri::command;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct GitStatus {
    pub is_clean: bool,
    pub files_changed: usize,
    pub branch: String,
}

fn get_kb_dir() -> PathBuf {
    PathBuf::from("../.kb")
}

#[command]
pub fn git_status() -> Result<GitStatus, String> {
    let repo = Repository::open(get_kb_dir()).map_err(|e| e.to_string())?;
    
    let head = repo.head().map_err(|e| e.to_string())?;
    let branch = head.shorthand().unwrap_or("unknown").to_string();
    
    let mut opts = git2::StatusOptions::new();
    opts.include_untracked(true);
    let statuses = repo.statuses(Some(&mut opts)).map_err(|e| e.to_string())?;
    
    let mut files_changed = 0;
    for entry in statuses.iter() {
        if entry.status() != git2::Status::CURRENT {
            files_changed += 1;
        }
    }
    
    Ok(GitStatus {
        is_clean: files_changed == 0,
        files_changed,
        branch,
    })
}

#[command]
pub fn git_sync(remote: String, branch: String) -> Result<(), String> {
    let repo = Repository::open(get_kb_dir()).map_err(|e| e.to_string())?;
    
    // 1. Commit everything
    let mut index = repo.index().map_err(|e| e.to_string())?;
    index.add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None).map_err(|e| e.to_string())?;
    index.write().map_err(|e| e.to_string())?;
    
    let oid = index.write_tree().map_err(|e| e.to_string())?;
    let tree = repo.find_tree(oid).map_err(|e| e.to_string())?;
    
    let sig = Signature::now("Knowledge Base User", "user@example.com").map_err(|e| e.to_string())?;
    
    // if head exists, get parent
    let parent_commit = match repo.head() {
        Ok(head) => Some(head.peel_to_commit().map_err(|e| e.to_string())?),
        Err(_) => None,
    };
    
    if let Some(parent) = parent_commit {
        repo.commit(
            Some("HEAD"),
            &sig,
            &sig,
            "Auto sync commit",
            &tree,
            &[&parent],
        ).map_err(|e| e.to_string())?;
    } else {
        repo.commit(
            Some("HEAD"),
            &sig,
            &sig,
            "Initial sync commit",
            &tree,
            &[],
        ).map_err(|e| e.to_string())?;
    }
    
    // 2. Add remote if not exists (for simplicity, we assume remote is configured or we just set it)
    // We skip the push for now or implement a dummy one since pushing requires auth callbacks
    
    Ok(())
}
