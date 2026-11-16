//! Comandos da varredura (Organizador, Mapa de espaço, arquivos esquecidos).

use crate::emit::{blocking, TaskProgress};
use crate::state::AppState;
use organizador_core::model::now_ms;
use organizador_core::query::{self, FileFilter, QueryPage, SortSpec, Summary};
use organizador_core::scan::{self, ScanOptions, ScanStats};
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};

#[tauri::command]
pub async fn scan_start(app: AppHandle, task_id: String, slot: String, roots: Vec<String>, options: ScanOptions) -> Result<ScanStats, String> {
    blocking(move || {
        let p = TaskProgress::new(&app, &task_id);
        let roots: Vec<PathBuf> = roots.iter().map(PathBuf::from).collect();
        if roots.iter().all(|r| !r.is_dir()) {
            return Err("Nenhuma das pastas selecionadas existe.".to_string());
        }
        let state = app.state::<AppState>();
        // Libera a varredura anterior antes de começar (economiza memória).
        state.drop_scan(&slot);
        let index = scan::scan(&roots, &options, &p);
        let stats = index.stats();
        state.put_scan(&slot, index);
        Ok(stats)
    })
    .await?
}

#[tauri::command]
pub async fn scan_query(app: AppHandle, slot: String, filter: FileFilter, sort: SortSpec, offset: usize, limit: usize) -> Result<QueryPage, String> {
    blocking(move || {
        let s = app.state::<AppState>().scan(&slot)?;
        let index = s.index.read().unwrap_or_else(|e| e.into_inner());
        let mut cache = s.cache.lock().unwrap_or_else(|e| e.into_inner());
        let q = query::run_cached(&index, &filter, sort, &mut cache);
        Ok(query::page(&index, &q, offset, limit.min(2000)))
    })
    .await?
}

#[tauri::command]
pub async fn scan_summary(app: AppHandle, slot: String, filter: FileFilter, sort: SortSpec) -> Result<Summary, String> {
    blocking(move || {
        let s = app.state::<AppState>().scan(&slot)?;
        let index = s.index.read().unwrap_or_else(|e| e.into_inner());
        let mut cache = s.cache.lock().unwrap_or_else(|e| e.into_inner());
        let q = query::run_cached(&index, &filter, sort, &mut cache);
        Ok(query::summarize(&index, &q.ids, now_ms()))
    })
    .await?
}

/// Todos os índices do resultado atual ("Selecionar todos os resultados").
#[tauri::command]
pub async fn scan_ids(app: AppHandle, slot: String, filter: FileFilter, sort: SortSpec) -> Result<Vec<u32>, String> {
    blocking(move || {
        let s = app.state::<AppState>().scan(&slot)?;
        let index = s.index.read().unwrap_or_else(|e| e.into_inner());
        let mut cache = s.cache.lock().unwrap_or_else(|e| e.into_inner());
        Ok(query::run_cached(&index, &filter, sort, &mut cache).ids.to_vec())
    })
    .await?
}

#[tauri::command]
pub async fn scan_paths(app: AppHandle, slot: String, ids: Vec<u32>) -> Result<Vec<String>, String> {
    blocking(move || {
        let s = app.state::<AppState>().scan(&slot)?;
        let index = s.index.read().unwrap_or_else(|e| e.into_inner());
        Ok(index.paths_of(&ids))
    })
    .await?
}

/// Remove do índice os arquivos já excluídos ou movidos.
#[tauri::command]
pub async fn scan_remove(app: AppHandle, slot: String, ids: Vec<u32>) -> Result<ScanStats, String> {
    blocking(move || {
        let s = app.state::<AppState>().scan(&slot)?;
        let mut index = s.index.write().unwrap_or_else(|e| e.into_inner());
        index.mark_removed(&ids);
        *s.cache.lock().unwrap_or_else(|e| e.into_inner()) = None;
        Ok(index.stats())
    })
    .await?
}

#[tauri::command]
pub fn scan_stats(state: State<'_, AppState>, slot: String) -> Option<ScanStats> {
    state.scan(&slot).ok().map(|s| s.index.read().unwrap_or_else(|e| e.into_inner()).stats())
}

#[tauri::command]
pub fn scan_dispose(state: State<'_, AppState>, slot: String) {
    state.drop_scan(&slot);
}
