//! Comandos de Duplicados, Mapa de espaço e Regras automáticas.

use crate::emit::{blocking, TaskProgress};
use crate::state::AppState;
use organizador_core::diskmap::{self, MapNode, Tree};
use organizador_core::duplicates::{self, DupOptions, DupResult};
use organizador_core::rules::{self, ApplyResult, PlannedAction, Rule};
use organizador_core::scan::{self, ScanOptions};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Manager};

/// Varre as pastas e procura arquivos duplicados.
#[tauri::command]
pub async fn dup_find(app: AppHandle, task_id: String, roots: Vec<String>, options: DupOptions) -> Result<DupResult, String> {
    blocking(move || {
        let p = TaskProgress::new(&app, &task_id);
        let roots: Vec<PathBuf> = roots.iter().map(PathBuf::from).collect();
        if roots.iter().all(|r| !r.is_dir()) {
            return Err("Nenhuma das pastas selecionadas existe.".to_string());
        }
        let index = scan::scan(&roots, &ScanOptions { include_hidden: options.include_hidden, skip_system: true, exclude: Vec::new() }, &p);
        if index.cancelled {
            return Ok(DupResult { cancelled: true, scanned_files: index.files.len() as u64, ..Default::default() });
        }
        Ok(duplicates::find_duplicates(&index, &options, &p))
    })
    .await?
}

/// Nó do Mapa de espaço (a varredura fica no slot "mapa").
#[tauri::command]
pub async fn map_node(app: AppHandle, path: Option<String>, depth: u8, max_children: usize) -> Result<MapNode, String> {
    blocking(move || {
        let slot = app.state::<AppState>().scan("mapa")?;
        let index = slot.index.read().unwrap_or_else(|e| e.into_inner());
        let tree = {
            let mut t = slot.tree.lock().unwrap_or_else(|e| e.into_inner());
            match t.as_ref() {
                Some(tree) => tree.clone(),
                None => {
                    let built = Arc::new(Tree::build(&index));
                    *t = Some(built.clone());
                    built
                }
            }
        };
        diskmap::node(&index, &tree, path.as_deref(), depth.min(3), max_children.clamp(4, 200)).ok_or_else(|| "Pasta não encontrada na análise.".to_string())
    })
    .await?
}

#[tauri::command]
pub async fn rules_preview(app: AppHandle, rules: Vec<Rule>) -> Result<Vec<PlannedAction>, String> {
    blocking(move || rules::preview(&rules, &app.state::<AppState>().protection)).await?
}

#[tauri::command]
pub async fn rules_apply(app: AppHandle, task_id: String, plan: Vec<PlannedAction>) -> Result<ApplyResult, String> {
    blocking(move || {
        let p = TaskProgress::new(&app, &task_id);
        rules::apply(&plan, &app.state::<AppState>().protection, &p)
    })
    .await
}
