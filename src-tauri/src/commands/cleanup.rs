//! Comandos da Limpeza e do One Click Optimize.

use crate::emit::{blocking, TaskProgress};
use crate::state::AppState;
use organizador_core::cleanup::{CleanItem, CleanOptions, CleanReport, TargetInfo, TargetReport};
use tauri::{AppHandle, Manager, State};

#[tauri::command]
pub fn cleanup_targets(state: State<'_, AppState>, options: CleanOptions) -> Vec<TargetInfo> {
    state.cleaner.targets(&options)
}

#[tauri::command]
pub async fn cleanup_analyze(app: AppHandle, task_id: String, ids: Vec<String>, options: CleanOptions) -> Result<Vec<TargetReport>, String> {
    blocking(move || {
        let p = TaskProgress::new(&app, &task_id);
        let st = app.state::<AppState>();
        st.cleaner.analyze(&ids, &options, &st.protection, &p)
    })
    .await
}

#[tauri::command]
pub fn cleanup_items(state: State<'_, AppState>, id: String, limit: usize) -> Vec<CleanItem> {
    state.cleaner.items(&id, limit)
}

#[tauri::command]
pub fn cleanup_exclude(state: State<'_, AppState>, id: String, paths: Vec<String>) {
    state.cleaner.exclude(&id, &paths);
}

#[tauri::command]
pub async fn cleanup_run(app: AppHandle, task_id: String, ids: Vec<String>, options: CleanOptions) -> Result<CleanReport, String> {
    blocking(move || {
        let p = TaskProgress::new(&app, &task_id);
        let st = app.state::<AppState>();
        let report = st.cleaner.run(&ids, &options, &st.protection, &p);
        // A estimativa de lixo da Saúde precisa refletir a limpeza.
        let _ = st.health.junk_estimate(true);
        report
    })
    .await
}
