//! Informações do sistema usadas pelo Explorador: unidades e pastas especiais.

use serde::Serialize;
use std::path::PathBuf;
use sysinfo::{DiskKind, Disks};

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DriveInfo {
    /// Ponto de montagem ("C:\").
    pub mount: String,
    /// Rótulo do volume ("Windows", "Backup"...), pode ser vazio.
    pub label: String,
    pub file_system: String,
    pub total: u64,
    pub free: u64,
    pub removable: bool,
    /// "ssd", "hdd" ou "desconhecido".
    pub kind: String,
    pub is_system: bool,
}

pub fn list_drives() -> Vec<DriveInfo> {
    let disks = Disks::new_with_refreshed_list();
    let system = crate::safety::normalize(&crate::safety::system_drive());
    let mut seen = std::collections::HashSet::new();
    let mut out: Vec<DriveInfo> = disks
        .list()
        .iter()
        .filter(|d| d.total_space() > 0)
        .filter(|d| {
            // No Linux há muitas montagens virtuais; mostra só as relevantes.
            if cfg!(windows) {
                return true;
            }
            let m = d.mount_point().to_string_lossy();
            m == "/" || m.starts_with("/home") || m.starts_with("/mnt") || m.starts_with("/media") || m.starts_with("/run/media")
        })
        .filter_map(|d| {
            let mount = d.mount_point().to_string_lossy().into_owned();
            if !seen.insert(mount.clone()) {
                return None;
            }
            let kind = match d.kind() {
                DiskKind::SSD => "ssd",
                DiskKind::HDD => "hdd",
                _ => "desconhecido",
            };
            Some(DriveInfo {
                is_system: crate::safety::normalize(d.mount_point()) == system || (!cfg!(windows) && mount == "/"),
                label: d.name().to_string_lossy().into_owned(),
                file_system: d.file_system().to_string_lossy().into_owned(),
                total: d.total_space(),
                free: d.available_space(),
                removable: d.is_removable(),
                kind: kind.into(),
                mount,
            })
        })
        .collect();
    out.sort_by(|a, b| a.mount.cmp(&b.mount));
    out
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct SpecialFolders {
    pub home: Option<String>,
    pub desktop: Option<String>,
    pub documents: Option<String>,
    pub downloads: Option<String>,
    pub pictures: Option<String>,
    pub music: Option<String>,
    pub videos: Option<String>,
    pub temp: String,
}

fn s(p: Option<PathBuf>) -> Option<String> {
    p.filter(|p| p.exists()).map(|p| p.to_string_lossy().into_owned())
}

pub fn special_folders() -> SpecialFolders {
    SpecialFolders {
        home: s(dirs::home_dir()),
        desktop: s(dirs::desktop_dir()),
        documents: s(dirs::document_dir()),
        downloads: s(dirs::download_dir()),
        pictures: s(dirs::picture_dir()),
        music: s(dirs::audio_dir()),
        videos: s(dirs::video_dir()),
        temp: std::env::temp_dir().to_string_lossy().into_owned(),
    }
}

/// Lê o começo de um arquivo de texto para a pré-visualização.
pub fn read_text_preview(path: &std::path::Path, max_bytes: usize) -> Result<String, String> {
    use std::io::Read;
    let mut f = std::fs::File::open(path).map_err(|e| crate::fsops::io_msg(&e))?;
    let mut buf = vec![0u8; max_bytes];
    let n = f.read(&mut buf).map_err(|e| crate::fsops::io_msg(&e))?;
    buf.truncate(n);
    if buf.iter().take(1024).filter(|&&b| b == 0).count() > 2 {
        return Err("Arquivo binário".into());
    }
    Ok(String::from_utf8_lossy(&buf).into_owned())
}
