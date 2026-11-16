//! Integrações específicas do sistema operacional.
//!
//! No Windows usa as APIs nativas; nos demais sistemas oferece versões
//! simplificadas (úteis para desenvolvimento e testes).

#[cfg(windows)]
mod windows;
#[cfg(windows)]
pub use self::windows::*;

#[cfg(not(windows))]
mod other;
#[cfg(not(windows))]
pub use self::other::*;

use serde::Serialize;

/// Arquivos na área de transferência do sistema.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardFiles {
    pub paths: Vec<String>,
    pub cut: bool,
}
