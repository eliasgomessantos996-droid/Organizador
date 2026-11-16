//! Estado compartilhado do aplicativo (protegido para acesso entre threads).

use organizador_core::cleanup::Cleaner;
use organizador_core::health::HealthMonitor;
use organizador_core::progress::CancelFlag;
use organizador_core::query::QueryResult;
use organizador_core::safety::Protection;
use organizador_core::scan::ScanIndex;
use organizador_core::trashbin::TrashCache;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, RwLock};

/// Uma varredura guardada em memória ("organizador", "mapa", "duplicados"...).
pub struct ScanSlot {
    pub index: RwLock<ScanIndex>,
    pub cache: Mutex<Option<QueryResult>>,
}

#[derive(Default)]
pub struct AppState {
    pub protection: Protection,
    pub trash: TrashCache,
    pub health: HealthMonitor,
    pub cleaner: Cleaner,
    tasks: Mutex<HashMap<String, CancelFlag>>,
    scans: Mutex<HashMap<String, Arc<ScanSlot>>>,
}

impl AppState {
    /// Registra uma tarefa cancelável.
    pub fn begin_task(&self, id: &str) -> CancelFlag {
        let flag = CancelFlag::new();
        self.tasks.lock().unwrap_or_else(|e| e.into_inner()).insert(id.to_string(), flag.clone());
        flag
    }

    pub fn end_task(&self, id: &str) {
        self.tasks.lock().unwrap_or_else(|e| e.into_inner()).remove(id);
    }

    pub fn cancel_task(&self, id: &str) -> bool {
        match self.tasks.lock().unwrap_or_else(|e| e.into_inner()).get(id) {
            Some(f) => {
                f.cancel();
                true
            }
            None => false,
        }
    }

    pub fn put_scan(&self, slot: &str, index: ScanIndex) {
        let s = Arc::new(ScanSlot { index: RwLock::new(index), cache: Mutex::new(None) });
        self.scans.lock().unwrap_or_else(|e| e.into_inner()).insert(slot.to_string(), s);
    }

    pub fn scan(&self, slot: &str) -> Result<Arc<ScanSlot>, String> {
        self.scans
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .get(slot)
            .cloned()
            .ok_or_else(|| "Nenhuma análise carregada. Analise as pastas novamente.".to_string())
    }

    pub fn drop_scan(&self, slot: &str) {
        self.scans.lock().unwrap_or_else(|e| e.into_inner()).remove(slot);
    }
}
