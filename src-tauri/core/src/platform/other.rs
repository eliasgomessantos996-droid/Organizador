//! Versões simplificadas para sistemas que não são Windows (desenvolvimento).

use super::ClipboardFiles;

pub fn clipboard_set_files(_paths: &[String], _cut: bool) -> Result<(), String> {
    Ok(())
}

pub fn clipboard_get_files() -> Option<ClipboardFiles> {
    None
}

pub fn clipboard_clear() {}
