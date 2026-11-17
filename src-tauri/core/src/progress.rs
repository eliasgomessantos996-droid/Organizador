//! Relato de progresso e cancelamento para operações longas.

use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProgressUpdate {
    /// Fase atual ("Listando arquivos", "Comparando conteúdo"...).
    pub phase: String,
    pub done: u64,
    pub total: u64,
    pub bytes_done: u64,
    pub bytes_total: u64,
    /// Item sendo processado agora.
    pub current: String,
}

pub trait Progress: Send + Sync {
    fn report(&self, update: ProgressUpdate);
    fn cancelled(&self) -> bool;
}

/// Progresso que não faz nada (testes e chamadas internas).
pub struct NoProgress;

impl Progress for NoProgress {
    fn report(&self, _update: ProgressUpdate) {}
    fn cancelled(&self) -> bool {
        false
    }
}

/// Sinal de cancelamento compartilhado.
#[derive(Clone, Default)]
pub struct CancelFlag(Arc<AtomicBool>);

impl CancelFlag {
    pub fn new() -> CancelFlag {
        CancelFlag::default()
    }
    pub fn cancel(&self) {
        self.0.store(true, Ordering::Relaxed);
    }
    pub fn is_cancelled(&self) -> bool {
        self.0.load(Ordering::Relaxed)
    }
}
