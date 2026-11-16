//! Comandos do Explorador de arquivos.

use crate::emit::{blocking, TaskProgress};
use crate::state::AppState;
use organizador_core::fsops::{self, Conflict, DeleteReport, OpReport, SizeInfo};
use organizador_core::model::FileEntry;
use organizador_core::platform::{self, ClipboardFiles};
use organizador_core::sys::{self, DriveInfo, SpecialFolders};
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, State};

fn paths(list: &[String]) -> Vec<PathBuf> {
    list.iter().map(PathBuf::from).collect()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    version: String,
    platform: String,
    os: String,
}

#[tauri::command]
pub fn app_info(app: AppHandle) -> AppInfo {
    AppInfo {
        version: app.package_info().version.to_string(),
        platform: std::env::consts::OS.to_string(),
        os: sysinfo::System::long_os_version().unwrap_or_else(|| std::env::consts::OS.to_string()),
    }
}

#[tauri::command]
pub fn special_folders() -> SpecialFolders {
    sys::special_folders()
}

#[tauri::command]
pub async fn list_drives() -> Result<Vec<DriveInfo>, String> {
    blocking(sys::list_drives).await
}

#[tauri::command]
pub async fn list_dir(path: String, show_hidden: bool) -> Result<Vec<FileEntry>, String> {
    blocking(move || fsops::list_dir(Path::new(&path), show_hidden)).await?
}

#[tauri::command]
pub async fn stat_path(path: String) -> Result<FileEntry, String> {
    blocking(move || FileEntry::from_path(Path::new(&path)).map_err(|e| fsops::io_msg(&e))).await?
}

#[tauri::command]
pub fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[tauri::command]
pub fn is_dir(path: String) -> bool {
    Path::new(&path).is_dir()
}

#[tauri::command]
pub async fn folder_size(app: AppHandle, task_id: String, path: String) -> Result<SizeInfo, String> {
    blocking(move || {
        let p = TaskProgress::new(&app, &task_id);
        fsops::size_of(Path::new(&path), &p)
    })
    .await
}

#[tauri::command]
pub async fn read_text_preview(path: String) -> Result<String, String> {
    blocking(move || sys::read_text_preview(Path::new(&path), 8192)).await?
}

#[tauri::command]
pub fn open_path(path: String) -> Result<(), String> {
    tauri_plugin_opener::open_path(&path, None::<&str>).map_err(|e| format!("Não foi possível abrir: {e}"))
}

#[tauri::command]
pub fn reveal_path(path: String) -> Result<(), String> {
    tauri_plugin_opener::reveal_item_in_dir(&path).map_err(|e| format!("Não foi possível mostrar no Explorer: {e}"))
}

#[tauri::command]
pub async fn check_conflicts(sources: Vec<String>, dest: String) -> Result<Vec<String>, String> {
    blocking(move || fsops::conflicts(&paths(&sources), Path::new(&dest))).await
}

#[tauri::command]
pub async fn copy_items(app: AppHandle, task_id: String, sources: Vec<String>, dest: String, conflict: Conflict) -> Result<OpReport, String> {
    blocking(move || {
        let p = TaskProgress::new(&app, &task_id);
        fsops::copy_items(&paths(&sources), Path::new(&dest), conflict, &p)
    })
    .await
}

#[tauri::command]
pub async fn move_items(app: AppHandle, task_id: String, sources: Vec<String>, dest: String, conflict: Conflict) -> Result<OpReport, String> {
    blocking(move || {
        let p = TaskProgress::new(&app, &task_id);
        let state = app.state::<AppState>();
        fsops::move_items(&paths(&sources), Path::new(&dest), conflict, &state.protection, &p)
    })
    .await
}

#[tauri::command]
pub async fn delete_items(app: AppHandle, task_id: String, paths: Vec<String>, permanent: bool) -> Result<DeleteReport, String> {
    blocking(move || {
        let p = TaskProgress::new(&app, &task_id);
        let state = app.state::<AppState>();
        fsops::delete_items(&self::paths(&paths), permanent, &state.protection, &p)
    })
    .await
}

#[tauri::command]
pub async fn rename_item(app: AppHandle, path: String, new_name: String) -> Result<String, String> {
    blocking(move || {
        let state = app.state::<AppState>();
        fsops::rename(Path::new(&path), &new_name, &state.protection).map(|p| p.to_string_lossy().into_owned())
    })
    .await?
}

#[tauri::command]
pub async fn create_folder(parent: String, name: Option<String>) -> Result<String, String> {
    blocking(move || fsops::create_folder(Path::new(&parent), name.as_deref()).map(|p| p.to_string_lossy().into_owned())).await?
}

#[tauri::command]
pub async fn create_text_file(parent: String, name: Option<String>) -> Result<String, String> {
    blocking(move || fsops::create_text_file(Path::new(&parent), name.as_deref()).map(|p| p.to_string_lossy().into_owned())).await?
}

#[tauri::command]
pub fn clipboard_write(paths: Vec<String>, cut: bool) -> Result<(), String> {
    platform::clipboard_set_files(&paths, cut)
}

#[tauri::command]
pub fn clipboard_read() -> Option<ClipboardFiles> {
    platform::clipboard_get_files()
}

#[tauri::command]
pub fn clipboard_clear() {
    platform::clipboard_clear()
}

#[tauri::command]
pub fn set_protected_paths(state: State<'_, AppState>, paths: Vec<String>) {
    state.protection.set_user_paths(&paths);
}

#[tauri::command]
pub fn check_protected(state: State<'_, AppState>, path: String) -> Option<String> {
    state.protection.check(Path::new(&path)).err()
}

#[tauri::command]
pub fn cancel_task(state: State<'_, AppState>, task_id: String) -> bool {
    state.cancel_task(&task_id)
}

#[tauri::command]
pub async fn save_text_file(path: String, contents: String) -> Result<(), String> {
    blocking(move || {
        // BOM para o Excel reconhecer acentos em arquivos CSV.
        let data = if path.to_lowercase().ends_with(".csv") { format!("\u{feff}{contents}") } else { contents };
        std::fs::write(&path, data).map_err(|e| fsops::io_msg(&e))
    })
    .await?
}
