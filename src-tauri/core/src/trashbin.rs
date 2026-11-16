//! Lixeira do sistema: listar, restaurar e excluir definitivamente.

use crate::model::{category_from_ext, ext_of, Category};
use crate::safety::normalize;
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;
use trash::{os_limited, TrashItem, TrashItemSize};

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TrashEntry {
    pub id: String,
    pub name: String,
    pub original_path: String,
    pub original_parent: String,
    /// Data da exclusão (ms desde 1970).
    pub deleted_at: i64,
    pub size: Option<u64>,
    pub is_dir: bool,
    pub category: Category,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct TrashActionReport {
    pub done: usize,
    pub failed: Vec<String>,
}

/// Guarda os itens da última listagem (o identificador do item é opaco).
#[derive(Default)]
pub struct TrashCache {
    items: Mutex<HashMap<String, TrashItem>>,
}

fn err(e: trash::Error) -> String {
    format!("Não foi possível acessar a Lixeira: {e}")
}

impl TrashCache {
    pub fn list(&self, with_sizes: bool, limit: usize) -> Result<Vec<TrashEntry>, String> {
        let mut items = os_limited::list().map_err(err)?;
        items.sort_by(|a, b| b.time_deleted.cmp(&a.time_deleted));
        let mut cache = self.items.lock().unwrap_or_else(|e| e.into_inner());
        cache.clear();
        let mut out = Vec::new();
        for item in items.into_iter().take(limit) {
            let id = item.id.to_string_lossy().into_owned();
            let name = item.name.to_string_lossy().into_owned();
            let (size, is_dir) = if with_sizes {
                match os_limited::metadata(&item).map(|m| m.size) {
                    Ok(TrashItemSize::Bytes(b)) => (Some(b), false),
                    Ok(TrashItemSize::Entries(_)) => (None, true),
                    Err(_) => (None, false),
                }
            } else {
                (None, false)
            };
            out.push(TrashEntry {
                id: id.clone(),
                category: if is_dir { Category::Folder } else { category_from_ext(ext_of(&name)) },
                original_path: item.original_path().to_string_lossy().into_owned(),
                original_parent: item.original_parent.to_string_lossy().into_owned(),
                deleted_at: item.time_deleted * 1000,
                name,
                size,
                is_dir,
            });
            cache.insert(id, item);
        }
        Ok(out)
    }

    fn take(&self, ids: &[String]) -> (Vec<TrashItem>, Vec<String>) {
        let cache = self.items.lock().unwrap_or_else(|e| e.into_inner());
        let mut found = Vec::new();
        let mut missing = Vec::new();
        for id in ids {
            match cache.get(id) {
                Some(i) => found.push(i.clone()),
                None => missing.push(id.clone()),
            }
        }
        (found, missing)
    }

    /// Restaura itens para o local original (um a um, para relatar falhas).
    pub fn restore(&self, ids: &[String]) -> TrashActionReport {
        let (items, missing) = self.take(ids);
        restore_items(items, missing)
    }

    pub fn purge(&self, ids: &[String]) -> Result<TrashActionReport, String> {
        let (items, missing) = self.take(ids);
        let n = items.len();
        os_limited::purge_all(items).map_err(err)?;
        Ok(TrashActionReport { done: n, failed: missing })
    }
}

fn restore_items(items: Vec<TrashItem>, mut failed: Vec<String>) -> TrashActionReport {
    let mut done = 0;
    for item in items {
        let name = item.original_path().to_string_lossy().into_owned();
        if item.original_path().exists() {
            failed.push(format!("{name}: já existe um item com esse nome no local original."));
            continue;
        }
        match os_limited::restore_all([item]) {
            Ok(()) => done += 1,
            Err(e) => failed.push(format!("{name}: {e}")),
        }
    }
    TrashActionReport { done, failed }
}

/// Restaura itens enviados à Lixeira a partir de `since_ms` (usado pelo "Desfazer").
pub fn restore_paths(paths: &[String], since_ms: i64) -> Result<TrashActionReport, String> {
    let items = os_limited::list().map_err(err)?;
    let mut by_path: HashMap<String, TrashItem> = HashMap::new();
    for item in items {
        if item.time_deleted * 1000 + 120_000 < since_ms {
            continue;
        }
        let key = normalize(&item.original_path());
        match by_path.get(&key) {
            Some(existing) if existing.time_deleted >= item.time_deleted => {}
            _ => {
                by_path.insert(key, item);
            }
        }
    }
    let mut chosen = Vec::new();
    let mut missing = Vec::new();
    for p in paths {
        match by_path.remove(&normalize(Path::new(p))) {
            Some(i) => chosen.push(i),
            None => missing.push(format!("{p}: não está mais na Lixeira.")),
        }
    }
    Ok(restore_items(chosen, missing))
}

/// Quantidade e tamanho aproximado de itens na Lixeira (genérico, via listagem).
pub fn summary_via_list() -> Result<(u64, u64), String> {
    let items = os_limited::list().map_err(err)?;
    let mut bytes = 0u64;
    for item in &items {
        if let Ok(m) = os_limited::metadata(item) {
            if let TrashItemSize::Bytes(b) = m.size {
                bytes += b;
            }
        }
    }
    Ok((items.len() as u64, bytes))
}

/// Esvazia toda a Lixeira (genérico).
pub fn empty_via_list() -> Result<(), String> {
    let items = os_limited::list().map_err(err)?;
    if items.is_empty() {
        return Ok(());
    }
    os_limited::purge_all(items).map_err(err)
}
