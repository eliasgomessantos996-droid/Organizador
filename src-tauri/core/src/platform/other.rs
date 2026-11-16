//! Versões simplificadas para sistemas que não são Windows (desenvolvimento).

use super::ClipboardFiles;

pub fn clipboard_set_files(_paths: &[String], _cut: bool) -> Result<(), String> {
    Ok(())
}

pub fn clipboard_get_files() -> Option<ClipboardFiles> {
    None
}

pub fn clipboard_clear() {}

/* ───────────── Sistema (versões simplificadas fora do Windows) ───────────── */

use super::{InstalledProgram, StartupItem};

pub fn recycle_bin_info() -> Result<(u64, u64), String> {
    crate::trashbin::summary_via_list().map(|(items, bytes)| (bytes, items))
}

pub fn empty_recycle_bin() -> Result<(), String> {
    crate::trashbin::empty_via_list()
}

pub fn is_elevated() -> bool {
    std::env::var("USER").map(|u| u == "root").unwrap_or(false)
}

pub fn shell_execute(file: &str, _params: Option<&str>, _verb: Option<&str>) -> Result<(), String> {
    std::process::Command::new("xdg-open").arg(file).spawn().map(|_| ()).map_err(|e| e.to_string())
}

pub fn relaunch_as_admin() -> Result<(), String> {
    Err("Disponível apenas no Windows.".into())
}

pub fn trim_working_sets(_pids: &[u32]) -> u32 {
    0
}

pub fn power_status() -> Option<(f32, bool, bool)> {
    None
}

pub fn file_version_info(_path: &str) -> (Option<String>, Option<String>) {
    (None, None)
}

pub fn split_command(cmd: &str) -> (String, String) {
    match cmd.trim().split_once(' ') {
        Some((a, b)) => (a.to_string(), b.to_string()),
        None => (cmd.trim().to_string(), String::new()),
    }
}

/// Aplicativos em ~/.config/autostart (equivalente do Linux).
pub fn startup_items() -> Vec<StartupItem> {
    let Some(dir) = dirs::config_dir().map(|d| d.join("autostart")) else { return Vec::new() };
    let Ok(rd) = std::fs::read_dir(&dir) else { return Vec::new() };
    let mut out = Vec::new();
    for e in rd.flatten() {
        let p = e.path();
        if p.extension().map(|x| x != "desktop").unwrap_or(true) {
            continue;
        }
        let text = std::fs::read_to_string(&p).unwrap_or_default();
        let get = |k: &str| text.lines().find_map(|l| l.strip_prefix(&format!("{k}="))).map(|s| s.trim().to_string());
        let name = get("Name").unwrap_or_else(|| p.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default());
        out.push(StartupItem {
            id: format!("folder|hkcu|StartupFolder|{}", p.file_name().unwrap_or_default().to_string_lossy()),
            name,
            command: get("Exec").unwrap_or_default(),
            path: Some(p.to_string_lossy().into_owned()),
            location: "Inicialização automática".into(),
            scope: "user".into(),
            enabled: get("Hidden").map(|h| h != "true").unwrap_or(true) && get("X-GNOME-Autostart-enabled").map(|h| h != "false").unwrap_or(true),
            needs_admin: false,
            publisher: None,
            description: get("Comment"),
            exists: true,
        });
    }
    out
}

pub fn set_startup_enabled(_id: &str, _enabled: bool) -> Result<(), String> {
    Err("Disponível apenas no Windows.".into())
}

pub fn installed_programs() -> Vec<InstalledProgram> {
    Vec::new()
}

pub fn uninstall_program(_id: &str) -> Result<(), String> {
    Err("Disponível apenas no Windows.".into())
}

pub fn launch_tool(_id: &str) -> Result<(), String> {
    Err("Disponível apenas no Windows.".into())
}

pub fn self_autostart() -> bool {
    false
}

pub fn set_self_autostart(_enabled: bool) -> Result<(), String> {
    Err("Disponível apenas no Windows.".into())
}
