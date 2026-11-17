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

/// Programa que inicia com o sistema.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StartupItem {
    pub id: String,
    pub name: String,
    pub command: String,
    pub path: Option<String>,
    /// Onde está registrado (Registro do usuário, pasta Inicializar...).
    pub location: String,
    /// "user" ou "machine".
    pub scope: String,
    pub enabled: bool,
    pub needs_admin: bool,
    pub publisher: Option<String>,
    pub description: Option<String>,
    pub exists: bool,
}

/// Programa instalado (Painel de Controle / Aplicativos instalados).
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InstalledProgram {
    pub id: String,
    pub name: String,
    pub publisher: Option<String>,
    pub version: Option<String>,
    pub install_date: Option<String>,
    pub size: Option<u64>,
    pub location: Option<String>,
    pub can_uninstall: bool,
    pub scope: String,
}
