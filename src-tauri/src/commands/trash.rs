//! Comandos da Lixeira e do "Desfazer".

use crate::emit::blocking;
use crate::state::AppState;
use organizador_core::fsops::{self, OpReport};
use organizador_core::trashbin::{self, TrashActionReport, TrashEntry};
use tauri::{AppHandle, Manager};

#[tauri::command]
pub async fn trash_list(app: AppHandle, with_sizes: bool) -> Result<Vec<TrashEntry>, String> {
    blocking(move || app.state::<AppState>().trash.list(with_sizes, 20_000)).await?
}

#[tauri::command]
pub async fn trash_restore(app: AppHandle, ids: Vec<String>) -> Result<TrashActionReport, String> {
    blocking(move || app.state::<AppState>().trash.restore(&ids)).await
}

#[tauri::command]
pub async fn trash_purge(app: AppHandle, ids: Vec<String>) -> Result<TrashActionReport, String> {
    blocking(move || app.state::<AppState>().trash.purge(&ids)).await?
}

/// Restaura da Lixeira itens excluídos pelo próprio Organizador (Ctrl+Z).
#[tauri::command]
pub async fn trash_restore_paths(paths: Vec<String>, since: i64) -> Result<TrashActionReport, String> {
    blocking(move || trashbin::restore_paths(&paths, since)).await?
}

/// Desfaz movimentações e renomeações (pares [original, atual]).
#[tauri::command]
pub async fn undo_moves(app: AppHandle, pairs: Vec<(String, String)>) -> Result<OpReport, String> {
    blocking(move || fsops::move_back(&pairs, &app.state::<AppState>().protection)).await
}
