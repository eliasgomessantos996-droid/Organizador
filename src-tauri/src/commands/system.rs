//! Comandos de sistema: saúde, processos, memória, bateria, inicialização,
//! programas instalados, ferramentas do Windows e Lixeira.

use crate::emit::blocking;
use crate::state::AppState;
use organizador_core::health::{self, BatteryInfo, HealthSnapshot, JunkInfo, ProcessInfo, TrimReport};
use organizador_core::platform::{self, InstalledProgram, StartupItem};
use serde::Serialize;
use tauri::{AppHandle, Manager};

#[tauri::command]
pub async fn health_snapshot(app: AppHandle) -> Result<HealthSnapshot, String> {
    blocking(move || app.state::<AppState>().health.snapshot()).await
}

#[tauri::command]
pub async fn top_processes(app: AppHandle, limit: usize) -> Result<Vec<ProcessInfo>, String> {
    blocking(move || app.state::<AppState>().health.top_processes(limit)).await
}

#[tauri::command]
pub async fn kill_process(app: AppHandle, pid: u32) -> Result<(), String> {
    blocking(move || app.state::<AppState>().health.kill(pid)).await?
}

#[tauri::command]
pub async fn trim_memory(app: AppHandle) -> Result<TrimReport, String> {
    blocking(move || app.state::<AppState>().health.trim_memory()).await
}

#[tauri::command]
pub async fn junk_estimate(app: AppHandle, force: bool) -> Result<JunkInfo, String> {
    blocking(move || app.state::<AppState>().health.junk_estimate(force)).await
}

#[tauri::command]
pub async fn battery_info() -> Result<Option<BatteryInfo>, String> {
    blocking(health::battery).await
}

#[tauri::command]
pub async fn startup_list() -> Result<Vec<StartupItem>, String> {
    blocking(platform::startup_items).await
}

#[tauri::command]
pub async fn startup_set_enabled(id: String, enabled: bool) -> Result<(), String> {
    blocking(move || platform::set_startup_enabled(&id, enabled)).await?
}

#[tauri::command]
pub async fn programs_list() -> Result<Vec<InstalledProgram>, String> {
    blocking(platform::installed_programs).await
}

#[tauri::command]
pub async fn program_uninstall(id: String) -> Result<(), String> {
    blocking(move || platform::uninstall_program(&id)).await?
}

#[tauri::command]
pub fn launch_tool(id: String) -> Result<(), String> {
    platform::launch_tool(&id)
}

#[tauri::command]
pub fn is_elevated() -> bool {
    platform::is_elevated()
}

/// Reabre o Organizador como administrador e fecha esta instância.
#[tauri::command]
pub fn relaunch_admin(app: AppHandle) -> Result<(), String> {
    platform::relaunch_as_admin()?;
    app.exit(0);
    Ok(())
}

#[tauri::command]
pub fn self_autostart_get() -> bool {
    platform::self_autostart()
}

#[tauri::command]
pub fn self_autostart_set(enabled: bool) -> Result<(), String> {
    platform::set_self_autostart(enabled)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecycleInfo {
    bytes: u64,
    items: u64,
}

#[tauri::command]
pub async fn recycle_info() -> Result<RecycleInfo, String> {
    blocking(|| platform::recycle_bin_info().map(|(bytes, items)| RecycleInfo { bytes, items })).await?
}

/// Esvazia a Lixeira e devolve quanto foi liberado.
#[tauri::command]
pub async fn empty_recycle_bin(app: AppHandle) -> Result<RecycleInfo, String> {
    blocking(move || {
        let (bytes, items) = platform::recycle_bin_info().unwrap_or((0, 0));
        platform::empty_recycle_bin()?;
        // Atualiza a estimativa de lixo usada pela nota de saúde.
        let _ = app.state::<AppState>().health.junk_estimate(true);
        Ok(RecycleInfo { bytes, items })
    })
    .await?
}
