//! Limpeza: alvos conhecidos (temporários, caches, Lixeira, downloads antigos...),
//! análise com prévia e execução com relatório do espaço liberado.

use crate::fsops::{remove_all, trash_paths};
use crate::model::{ext_of, now_ms, to_ms};
use crate::platform;
use crate::progress::{Progress, ProgressUpdate};
use crate::safety::{is_within, Protection};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Risk {
    /// Pode apagar sem preocupação (o programa recria).
    Seguro,
    /// Apaga dados do usuário que provavelmente não servem mais.
    Moderado,
}

#[derive(Clone, Debug)]
enum Kind {
    RecycleBin,
    Files {
        roots: Vec<PathBuf>,
        min_age_hours: u64,
        exts: Option<&'static [&'static str]>,
        prefixes: Option<&'static [&'static str]>,
        recursive: bool,
        remove_empty_dirs: bool,
        /// Usa a data do último uso (modificação ou acesso) em vez da modificação.
        by_last_use: bool,
        to_trash: bool,
    },
    EmptyFolders {
        roots: Vec<PathBuf>,
    },
}

#[derive(Clone, Debug)]
struct Target {
    id: &'static str,
    name: &'static str,
    description: &'static str,
    group: &'static str,
    icon: &'static str,
    risk: Risk,
    needs_admin: bool,
    kind: Kind,
}

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct CleanOptions {
    pub temp_min_age_hours: u64,
    pub old_downloads_days: u64,
    pub old_installers_days: u64,
}

impl Default for CleanOptions {
    fn default() -> Self {
        CleanOptions { temp_min_age_hours: 24, old_downloads_days: 90, old_installers_days: 30 }
    }
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TargetInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub group: String,
    pub icon: String,
    pub risk: Risk,
    pub needs_admin: bool,
    pub to_trash: bool,
    pub available: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CleanItem {
    pub path: String,
    pub size: u64,
    pub modified: i64,
    pub is_dir: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TargetReport {
    pub id: String,
    pub files: u64,
    pub bytes: u64,
    /// Itens que não puderam ser lidos (geralmente exigem administrador).
    pub denied: u64,
    pub sample: Vec<CleanItem>,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct TargetResult {
    pub id: String,
    pub name: String,
    pub freed: u64,
    pub deleted: u64,
    pub failed: u64,
    pub error: Option<String>,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct CleanReport {
    pub freed: u64,
    pub deleted: u64,
    pub failed: u64,
    pub targets: Vec<TargetResult>,
    pub cancelled: bool,
}

#[derive(Clone, Debug)]
struct Found {
    path: PathBuf,
    size: u64,
    modified: i64,
    is_dir: bool,
}

fn existing(paths: Vec<PathBuf>) -> Vec<PathBuf> {
    paths.into_iter().filter(|p| p.exists()).collect()
}

/// Caches de navegadores baseados no Chromium (todas as contas/perfis).
fn chromium_caches(base: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    for d in ["ShaderCache", "GrShaderCache", "GraphiteDawnCache"] {
        out.push(base.join(d));
    }
    if let Ok(rd) = std::fs::read_dir(base) {
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            if name == "Default" || name.starts_with("Profile ") || name == "Guest Profile" || name == "System Profile" {
                for sub in ["Cache", "Code Cache", "GPUCache", "DawnCache", "DawnGraphiteCache", "DawnWebGPUCache", "Media Cache"] {
                    out.push(e.path().join(sub));
                }
            }
        }
    }
    existing(out)
}

fn firefox_caches(profiles: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Ok(rd) = std::fs::read_dir(profiles) {
        for e in rd.flatten() {
            for sub in ["cache2", "startupCache", "thumbnails", "jumpListCache"] {
                out.push(e.path().join(sub));
            }
        }
    }
    existing(out)
}

const TEMP_EXTS: &[&str] = &["crdownload", "part", "partial", "download", "tmp"];
const INSTALLER_EXTS: &[&str] = &["exe", "msi", "msix", "msixbundle", "appx"];
const THUMB_PREFIXES: &[&str] = &["thumbcache_", "iconcache_"];
const DB_EXT: &[&str] = &["db"];
const LOG_EXTS: &[&str] = &["log", "etl", "old", "bak"];

fn files(roots: Vec<PathBuf>, min_age_hours: u64) -> Kind {
    Kind::Files { roots, min_age_hours, exts: None, prefixes: None, recursive: true, remove_empty_dirs: true, by_last_use: false, to_trash: false }
}

fn all_targets(o: &CleanOptions) -> Vec<Target> {
    let home = dirs::home_dir().unwrap_or_default();
    let local = dirs::cache_dir().unwrap_or_else(|| home.join(".cache"));
    let roaming = dirs::data_dir().unwrap_or_else(|| home.join(".local/share"));
    let temp = std::env::temp_dir();
    let downloads = dirs::download_dir();
    let mut t = Vec::new();

    t.push(Target {
        id: "lixeira",
        name: "Lixeira",
        description: "Itens que você já excluiu e ainda ocupam espaço no disco.",
        group: "sistema",
        icon: "trash",
        risk: Risk::Moderado,
        needs_admin: false,
        kind: Kind::RecycleBin,
    });
    t.push(Target {
        id: "temp-usuario",
        name: "Arquivos temporários",
        description: "Sobras de instalações e programas na pasta Temp do seu usuário.",
        group: "sistema",
        icon: "clock",
        risk: Risk::Seguro,
        needs_admin: false,
        kind: files(vec![temp], o.temp_min_age_hours),
    });

    if cfg!(windows) {
        let win = crate::safety::windows_dir();
        let pd = std::env::var_os("ProgramData").map(PathBuf::from).unwrap_or_else(|| PathBuf::from(r"C:\ProgramData"));
        t.push(Target {
            id: "temp-windows",
            name: "Temporários do Windows",
            description: "Arquivos temporários do sistema em Windows\\Temp.",
            group: "sistema",
            icon: "clock",
            risk: Risk::Seguro,
            needs_admin: true,
            kind: files(vec![win.join("Temp")], o.temp_min_age_hours),
        });
        t.push(Target {
            id: "miniaturas",
            name: "Cache de miniaturas",
            description: "Miniaturas de imagens e ícones; o Windows recria quando precisar.",
            group: "sistema",
            icon: "image",
            risk: Risk::Seguro,
            needs_admin: false,
            kind: Kind::Files {
                roots: vec![local.join(r"Microsoft\Windows\Explorer")],
                min_age_hours: 0,
                exts: Some(DB_EXT),
                prefixes: Some(THUMB_PREFIXES),
                recursive: false,
                remove_empty_dirs: false,
                by_last_use: false,
                to_trash: false,
            },
        });
        t.push(Target {
            id: "cache-internet",
            name: "Cache de internet do Windows",
            description: "Arquivos temporários de internet usados por apps do Windows.",
            group: "sistema",
            icon: "globe",
            risk: Risk::Seguro,
            needs_admin: false,
            kind: files(vec![local.join(r"Microsoft\Windows\INetCache")], 0),
        });
        t.push(Target {
            id: "relatorios-erro",
            name: "Relatórios de erro",
            description: "Despejos de falhas de programas e relatórios do Windows Error Reporting.",
            group: "sistema",
            icon: "alert-triangle",
            risk: Risk::Seguro,
            needs_admin: false,
            kind: files(
                existing(vec![
                    local.join("CrashDumps"),
                    local.join(r"Microsoft\Windows\WER\ReportArchive"),
                    local.join(r"Microsoft\Windows\WER\ReportQueue"),
                    pd.join(r"Microsoft\Windows\WER\ReportArchive"),
                    pd.join(r"Microsoft\Windows\WER\ReportQueue"),
                ]),
                0,
            ),
        });
        t.push(Target {
            id: "despejos-memoria",
            name: "Despejos de memória do sistema",
            description: "Arquivos gerados quando o Windows travou (tela azul). Podem ser enormes.",
            group: "sistema",
            icon: "memory",
            risk: Risk::Seguro,
            needs_admin: true,
            kind: files(existing(vec![win.join("Minidump"), win.join("MEMORY.DMP"), win.join("LiveKernelReports")]), 0),
        });
        t.push(Target {
            id: "windows-update",
            name: "Cache do Windows Update",
            description: "Atualizações já baixadas e instaladas. O Windows baixa de novo se precisar.",
            group: "sistema",
            icon: "refresh",
            risk: Risk::Moderado,
            needs_admin: true,
            kind: files(vec![win.join(r"SoftwareDistribution\Download")], 0),
        });
        t.push(Target {
            id: "otimizacao-entrega",
            name: "Otimização de Entrega",
            description: "Cópias de atualizações compartilhadas com outros computadores.",
            group: "sistema",
            icon: "download",
            risk: Risk::Seguro,
            needs_admin: true,
            kind: files(vec![win.join(r"ServiceProfiles\NetworkService\AppData\Local\Microsoft\Windows\DeliveryOptimization\Cache")], 0),
        });
        t.push(Target {
            id: "logs",
            name: "Logs antigos do sistema",
            description: "Registros de instalação e diagnóstico com mais de 30 dias.",
            group: "sistema",
            icon: "file-text",
            risk: Risk::Seguro,
            needs_admin: true,
            kind: Kind::Files {
                roots: vec![win.join("Logs")],
                min_age_hours: 30 * 24,
                exts: Some(LOG_EXTS),
                prefixes: None,
                recursive: true,
                remove_empty_dirs: false,
                by_last_use: false,
                to_trash: false,
            },
        });
        let browsers: [(&str, &str, Vec<PathBuf>); 5] = [
            ("chrome", "Google Chrome", chromium_caches(&local.join(r"Google\Chrome\User Data"))),
            ("edge", "Microsoft Edge", chromium_caches(&local.join(r"Microsoft\Edge\User Data"))),
            ("brave", "Brave", chromium_caches(&local.join(r"BraveSoftware\Brave-Browser\User Data"))),
            (
                "opera",
                "Opera",
                existing(vec![
                    local.join(r"Opera Software\Opera Stable\Cache"),
                    local.join(r"Opera Software\Opera Stable\Default\Cache"),
                    local.join(r"Opera Software\Opera GX Stable\Cache"),
                    local.join(r"Opera Software\Opera GX Stable\Default\Cache"),
                ]),
            ),
            ("firefox", "Mozilla Firefox", firefox_caches(&local.join(r"Mozilla\Firefox\Profiles"))),
        ];
        for (id, name, roots) in browsers {
            t.push(Target {
                id,
                name,
                description: "Cache de páginas e imagens. Você continua conectado nos sites.",
                group: "navegadores",
                icon: "globe",
                risk: Risk::Seguro,
                needs_admin: false,
                kind: files(roots, 0),
            });
        }
        t.push(Target {
            id: "apps",
            name: "Cache de aplicativos",
            description: "Caches de Discord, Teams, Slack, VS Code, Spotify e Steam.",
            group: "aplicativos",
            icon: "app-window",
            risk: Risk::Seguro,
            needs_admin: false,
            kind: files(
                existing(vec![
                    roaming.join(r"discord\Cache"),
                    roaming.join(r"discord\Code Cache"),
                    roaming.join(r"discord\GPUCache"),
                    roaming.join(r"Microsoft\Teams\Cache"),
                    roaming.join(r"Microsoft\Teams\GPUCache"),
                    roaming.join(r"Slack\Cache"),
                    roaming.join(r"Slack\Code Cache"),
                    roaming.join(r"Slack\GPUCache"),
                    roaming.join(r"Code\Cache"),
                    roaming.join(r"Code\CachedData"),
                    roaming.join(r"Code\Code Cache"),
                    roaming.join(r"Code\GPUCache"),
                    local.join(r"Spotify\Data"),
                    local.join(r"Steam\htmlcache"),
                ]),
                0,
            ),
        });
    } else {
        t.push(Target {
            id: "miniaturas",
            name: "Cache de miniaturas",
            description: "Miniaturas de imagens; o sistema recria quando precisar.",
            group: "sistema",
            icon: "image",
            risk: Risk::Seguro,
            needs_admin: false,
            kind: files(vec![local.join("thumbnails")], 0),
        });
        t.push(Target {
            id: "chrome",
            name: "Google Chrome",
            description: "Cache de páginas e imagens. Você continua conectado nos sites.",
            group: "navegadores",
            icon: "globe",
            risk: Risk::Seguro,
            needs_admin: false,
            kind: files(chromium_caches(&local.join("google-chrome")), 0),
        });
        t.push(Target {
            id: "firefox",
            name: "Mozilla Firefox",
            description: "Cache de páginas e imagens. Você continua conectado nos sites.",
            group: "navegadores",
            icon: "globe",
            risk: Risk::Seguro,
            needs_admin: false,
            kind: files(firefox_caches(&local.join("mozilla/firefox")), 0),
        });
    }

    if let Some(dl) = downloads {
        t.push(Target {
            id: "downloads-incompletos",
            name: "Downloads incompletos",
            description: "Downloads interrompidos (.crdownload, .part) com mais de um dia.",
            group: "arquivos",
            icon: "download",
            risk: Risk::Seguro,
            needs_admin: false,
            kind: Kind::Files { roots: vec![dl.clone()], min_age_hours: 24, exts: Some(TEMP_EXTS), prefixes: None, recursive: false, remove_empty_dirs: false, by_last_use: false, to_trash: true },
        });
        t.push(Target {
            id: "instaladores",
            name: "Instaladores antigos",
            description: "Arquivos .exe e .msi na pasta Downloads que você provavelmente já instalou.",
            group: "arquivos",
            icon: "package",
            risk: Risk::Moderado,
            needs_admin: false,
            kind: Kind::Files {
                roots: vec![dl.clone()],
                min_age_hours: o.old_installers_days * 24,
                exts: Some(INSTALLER_EXTS),
                prefixes: None,
                recursive: false,
                remove_empty_dirs: false,
                by_last_use: true,
                to_trash: true,
            },
        });
        t.push(Target {
            id: "downloads-antigos",
            name: "Downloads esquecidos",
            description: "Arquivos da pasta Downloads que você não abre há muito tempo (vão para a Lixeira).",
            group: "arquivos",
            icon: "inbox",
            risk: Risk::Moderado,
            needs_admin: false,
            kind: Kind::Files { roots: vec![dl], min_age_hours: o.old_downloads_days * 24, exts: None, prefixes: None, recursive: true, remove_empty_dirs: false, by_last_use: true, to_trash: true },
        });
    }
    let user_dirs: Vec<PathBuf> = [dirs::desktop_dir(), dirs::document_dir(), dirs::download_dir(), dirs::picture_dir(), dirs::audio_dir(), dirs::video_dir()]
        .into_iter()
        .flatten()
        .collect();
    t.push(Target {
        id: "pastas-vazias",
        name: "Pastas vazias",
        description: "Pastas sem nenhum arquivo dentro das suas pastas pessoais.",
        group: "arquivos",
        icon: "folder",
        risk: Risk::Moderado,
        needs_admin: false,
        kind: Kind::EmptyFolders { roots: existing(user_dirs) },
    });
    t
}

impl Kind {
    fn to_trash(&self) -> bool {
        matches!(self, Kind::Files { to_trash: true, .. })
    }
    fn available(&self) -> bool {
        match self {
            Kind::RecycleBin => true,
            Kind::Files { roots, .. } | Kind::EmptyFolders { roots } => roots.iter().any(|r| r.exists()),
        }
    }
}

/// Coleta arquivos de um alvo do tipo Files.
#[allow(clippy::too_many_arguments)]
fn collect_files(
    roots: &[PathBuf],
    min_age_hours: u64,
    exts: Option<&[&str]>,
    prefixes: Option<&[&str]>,
    recursive: bool,
    by_last_use: bool,
    prot: &Protection,
    progress: &dyn Progress,
) -> (Vec<Found>, u64) {
    let cutoff = now_ms() - (min_age_hours as i64) * 3_600_000;
    let mut found = Vec::new();
    let mut denied = 0u64;
    let start = Instant::now();
    for root in roots {
        let md = match std::fs::symlink_metadata(root) {
            Ok(m) => m,
            Err(_) => continue,
        };
        if md.is_file() {
            // Alvo que é um único arquivo (ex.: MEMORY.DMP).
            let modified = to_ms(md.modified());
            if min_age_hours == 0 || modified < cutoff {
                found.push(Found { path: root.clone(), size: md.len(), modified, is_dir: false });
            }
            continue;
        }
        let mut stack = vec![root.clone()];
        while let Some(dir) = stack.pop() {
            if progress.cancelled() || start.elapsed() > Duration::from_secs(120) {
                break;
            }
            let rd = match std::fs::read_dir(&dir) {
                Ok(r) => r,
                Err(_) => {
                    denied += 1;
                    continue;
                }
            };
            for e in rd.flatten() {
                let Ok(ft) = e.file_type() else { continue };
                if ft.is_symlink() {
                    continue;
                }
                let p = e.path();
                if ft.is_dir() {
                    if recursive {
                        stack.push(p);
                    }
                    continue;
                }
                let name = e.file_name().to_string_lossy().into_owned();
                if let Some(ex) = exts {
                    let e2 = ext_of(&name).to_ascii_lowercase();
                    if !ex.contains(&e2.as_str()) {
                        continue;
                    }
                }
                if let Some(px) = prefixes {
                    let lower = name.to_ascii_lowercase();
                    if !px.iter().any(|x| lower.starts_with(x)) {
                        continue;
                    }
                }
                let Ok(m) = e.metadata() else {
                    denied += 1;
                    continue;
                };
                let modified = to_ms(m.modified());
                let when = if by_last_use { modified.max(to_ms(m.accessed())) } else { modified };
                if min_age_hours > 0 && when >= cutoff {
                    continue;
                }
                if prot.check_user_only(&p).is_err() {
                    continue;
                }
                found.push(Found { path: p, size: m.len(), modified, is_dir: false });
            }
        }
    }
    (found, denied)
}

/// Pastas vazias (de baixo para cima; uma pasta que só contém pastas vazias também conta).
fn collect_empty_dirs(roots: &[PathBuf], prot: &Protection) -> Vec<Found> {
    fn visit(dir: &Path, out: &mut Vec<Found>, prot: &Protection, depth: usize) -> bool {
        if depth > 64 {
            return false;
        }
        let Ok(rd) = std::fs::read_dir(dir) else { return false };
        let mut empty = true;
        for e in rd.flatten() {
            let Ok(ft) = e.file_type() else {
                empty = false;
                continue;
            };
            if ft.is_dir() && !ft.is_symlink() {
                if !visit(&e.path(), out, prot, depth + 1) {
                    empty = false;
                }
            } else {
                // desktop.ini sozinho não impede a pasta de ser "vazia" para o usuário? Mantém por segurança.
                empty = false;
            }
        }
        if empty && depth > 0 && prot.check(dir).is_ok() {
            out.push(Found { path: dir.to_path_buf(), size: 0, modified: 0, is_dir: true });
        }
        empty
    }
    let mut out = Vec::new();
    for r in roots {
        visit(r, &mut out, prot, 0);
    }
    out
}

fn remove_empty_subdirs(root: &Path) {
    fn visit(dir: &Path, is_root: bool) -> bool {
        let Ok(rd) = std::fs::read_dir(dir) else { return false };
        let mut empty = true;
        for e in rd.flatten() {
            let Ok(ft) = e.file_type() else {
                empty = false;
                continue;
            };
            if ft.is_dir() && !ft.is_symlink() {
                if !visit(&e.path(), false) {
                    empty = false;
                }
            } else {
                empty = false;
            }
        }
        if empty && !is_root {
            return std::fs::remove_dir(dir).is_ok();
        }
        empty
    }
    if root.is_dir() {
        visit(root, true);
    }
}

#[derive(Default)]
pub struct Cleaner {
    last: Mutex<HashMap<String, (Instant, Vec<Found>)>>,
}

impl Cleaner {
    pub fn targets(&self, opts: &CleanOptions) -> Vec<TargetInfo> {
        all_targets(opts)
            .into_iter()
            .map(|t| TargetInfo {
                id: t.id.into(),
                name: t.name.into(),
                description: t.description.into(),
                group: t.group.into(),
                icon: t.icon.into(),
                risk: t.risk,
                needs_admin: t.needs_admin,
                to_trash: t.kind.to_trash(),
                available: t.kind.available(),
            })
            .collect()
    }

    fn analyze_one(&self, t: &Target, prot: &Protection, progress: &dyn Progress) -> TargetReport {
        let (found, denied) = match &t.kind {
            Kind::RecycleBin => {
                let (bytes, items) = platform::recycle_bin_info().unwrap_or((0, 0));
                self.last.lock().unwrap_or_else(|e| e.into_inner()).insert(t.id.into(), (Instant::now(), Vec::new()));
                return TargetReport { id: t.id.into(), files: items, bytes, denied: 0, sample: Vec::new() };
            }
            Kind::Files { roots, min_age_hours, exts, prefixes, recursive, by_last_use, .. } => {
                collect_files(roots, *min_age_hours, *exts, *prefixes, *recursive, *by_last_use, prot, progress)
            }
            Kind::EmptyFolders { roots } => (collect_empty_dirs(roots, prot), 0),
        };
        let bytes = found.iter().map(|f| f.size).sum();
        let mut sample: Vec<CleanItem> = found
            .iter()
            .map(|f| CleanItem { path: f.path.to_string_lossy().into_owned(), size: f.size, modified: f.modified, is_dir: f.is_dir })
            .collect();
        sample.sort_by(|a, b| b.size.cmp(&a.size));
        sample.truncate(50);
        let files = found.len() as u64;
        self.last.lock().unwrap_or_else(|e| e.into_inner()).insert(t.id.into(), (Instant::now(), found));
        TargetReport { id: t.id.into(), files, bytes, denied, sample }
    }

    /// Analisa os alvos e guarda a lista para que a limpeza apague exatamente o que foi mostrado.
    pub fn analyze(&self, ids: &[String], opts: &CleanOptions, prot: &Protection, progress: &dyn Progress) -> Vec<TargetReport> {
        let targets = all_targets(opts);
        let chosen: Vec<&Target> = targets.iter().filter(|t| ids.iter().any(|i| i == t.id)).collect();
        let total = chosen.len() as u64;
        let mut out = Vec::new();
        for (i, t) in chosen.into_iter().enumerate() {
            if progress.cancelled() {
                break;
            }
            progress.report(ProgressUpdate { phase: format!("Analisando: {}", t.name), done: i as u64, total, ..Default::default() });
            out.push(self.analyze_one(t, prot, progress));
        }
        progress.report(ProgressUpdate { phase: "Análise concluída".into(), done: total, total, ..Default::default() });
        out
    }

    /// Lista os itens encontrados na última análise (para a prévia detalhada).
    pub fn items(&self, id: &str, limit: usize) -> Vec<CleanItem> {
        let last = self.last.lock().unwrap_or_else(|e| e.into_inner());
        let Some((_, found)) = last.get(id) else { return Vec::new() };
        let mut items: Vec<CleanItem> = found
            .iter()
            .map(|f| CleanItem { path: f.path.to_string_lossy().into_owned(), size: f.size, modified: f.modified, is_dir: f.is_dir })
            .collect();
        items.sort_by(|a, b| b.size.cmp(&a.size));
        items.truncate(limit);
        items
    }

    /// Exclui itens específicos de um alvo (prévia com seleção manual).
    pub fn exclude(&self, id: &str, paths: &[String]) {
        let mut last = self.last.lock().unwrap_or_else(|e| e.into_inner());
        if let Some((_, found)) = last.get_mut(id) {
            let set: std::collections::HashSet<&str> = paths.iter().map(|s| s.as_str()).collect();
            found.retain(|f| !set.contains(f.path.to_string_lossy().as_ref()));
        }
    }

    /// Executa a limpeza dos alvos escolhidos.
    pub fn run(&self, ids: &[String], opts: &CleanOptions, prot: &Protection, progress: &dyn Progress) -> CleanReport {
        let targets = all_targets(opts);
        let chosen: Vec<&Target> = targets.iter().filter(|t| ids.iter().any(|i| i == t.id)).collect();
        let mut report = CleanReport::default();

        // Usa a análise recente; se não houver (ou estiver velha), analisa de novo.
        let mut plan: Vec<(&Target, Vec<Found>)> = Vec::new();
        for t in &chosen {
            let cached = {
                let mut last = self.last.lock().unwrap_or_else(|e| e.into_inner());
                match last.remove(t.id) {
                    Some((when, f)) if when.elapsed() < Duration::from_secs(15 * 60) => Some(f),
                    _ => None,
                }
            };
            let found = match cached {
                Some(f) => f,
                None => {
                    self.analyze_one(t, prot, progress);
                    self.last.lock().unwrap_or_else(|e| e.into_inner()).remove(t.id).map(|x| x.1).unwrap_or_default()
                }
            };
            plan.push((t, found));
        }

        let total_files: u64 = plan.iter().map(|(_, f)| f.len() as u64).sum();
        let total_bytes: u64 = plan.iter().map(|(_, f)| f.iter().map(|x| x.size).sum::<u64>()).sum();
        let mut done_files = 0u64;
        let mut done_bytes = 0u64;

        for (t, found) in plan {
            if progress.cancelled() {
                report.cancelled = true;
                break;
            }
            let mut r = TargetResult { id: t.id.into(), name: t.name.into(), ..Default::default() };
            progress.report(ProgressUpdate {
                phase: format!("Limpando: {}", t.name),
                done: done_files,
                total: total_files,
                bytes_done: done_bytes,
                bytes_total: total_bytes,
                current: String::new(),
            });
            match &t.kind {
                Kind::RecycleBin => {
                    let (bytes, items) = platform::recycle_bin_info().unwrap_or((0, 0));
                    match platform::empty_recycle_bin() {
                        Ok(()) => {
                            r.freed = bytes;
                            r.deleted = items;
                        }
                        Err(e) => r.error = Some(e),
                    }
                }
                Kind::Files { roots, remove_empty_dirs, to_trash, .. } => {
                    // Confere de novo que cada item continua dentro da pasta do alvo.
                    let valid: Vec<Found> = found.into_iter().filter(|f| roots.iter().any(|root| is_within(&f.path, root))).collect();
                    if *to_trash {
                        let paths: Vec<PathBuf> = valid.iter().map(|f| f.path.clone()).collect();
                        let sizes: HashMap<PathBuf, u64> = valid.iter().map(|f| (f.path.clone(), f.size)).collect();
                        let (ok, failed) = trash_paths(&paths);
                        for p in &ok {
                            r.freed += sizes.get(p).copied().unwrap_or(0);
                        }
                        r.deleted = ok.len() as u64;
                        r.failed = failed.len() as u64;
                        done_files += valid.len() as u64;
                        done_bytes += r.freed;
                    } else {
                        for (i, f) in valid.iter().enumerate() {
                            if progress.cancelled() {
                                report.cancelled = true;
                                break;
                            }
                            match remove_all(&f.path) {
                                Ok(()) => {
                                    r.freed += f.size;
                                    r.deleted += 1;
                                }
                                Err(_) => r.failed += 1,
                            }
                            done_files += 1;
                            done_bytes += f.size;
                            if i % 64 == 0 {
                                progress.report(ProgressUpdate {
                                    phase: format!("Limpando: {}", t.name),
                                    done: done_files,
                                    total: total_files,
                                    bytes_done: done_bytes,
                                    bytes_total: total_bytes,
                                    current: f.path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
                                });
                            }
                        }
                        if *remove_empty_dirs {
                            for root in roots {
                                remove_empty_subdirs(root);
                            }
                        }
                    }
                    if r.failed > 0 && r.deleted == 0 && t.needs_admin && !platform::is_elevated() {
                        r.error = Some("Exige o Organizador como administrador.".into());
                    }
                }
                Kind::EmptyFolders { .. } => {
                    for f in &found {
                        if std::fs::remove_dir(&f.path).is_ok() {
                            r.deleted += 1;
                        } else {
                            r.failed += 1;
                        }
                    }
                }
            }
            report.freed += r.freed;
            report.deleted += r.deleted;
            report.failed += r.failed;
            report.targets.push(r);
        }
        progress.report(ProgressUpdate { phase: "Concluído".into(), done: total_files, total: total_files, bytes_done: done_bytes, bytes_total: total_bytes, current: String::new() });
        report
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::progress::NoProgress;
    use std::fs;

    fn target_files(root: &Path, min_age: u64) -> Target {
        Target {
            id: "teste",
            name: "Teste",
            description: "",
            group: "sistema",
            icon: "clock",
            risk: Risk::Seguro,
            needs_admin: false,
            kind: Kind::Files { roots: vec![root.to_path_buf()], min_age_hours: min_age, exts: None, prefixes: None, recursive: true, remove_empty_dirs: true, by_last_use: false, to_trash: false },
        }
    }

    #[test]
    fn analisa_e_limpa_temporarios() {
        let d = tempfile::tempdir().unwrap();
        fs::create_dir_all(d.path().join("sub")).unwrap();
        fs::write(d.path().join("a.tmp"), vec![0u8; 1000]).unwrap();
        fs::write(d.path().join("sub").join("b.tmp"), vec![0u8; 500]).unwrap();
        let prot = Protection::new();
        let c = Cleaner::default();
        let t = target_files(d.path(), 0);
        let r = c.analyze_one(&t, &prot, &NoProgress);
        assert_eq!(r.files, 2);
        assert_eq!(r.bytes, 1500);
        assert_eq!(c.items("teste", 10).len(), 2);

        // Arquivos recentes são poupados quando há idade mínima.
        let t24 = target_files(d.path(), 24);
        assert_eq!(c.analyze_one(&t24, &prot, &NoProgress).files, 0);

        // Remove o que foi analisado e as subpastas que ficaram vazias.
        c.analyze_one(&t, &prot, &NoProgress);
        let (_, found) = c.last.lock().unwrap().remove("teste").unwrap();
        for f in &found {
            remove_all(&f.path).unwrap();
        }
        remove_empty_subdirs(d.path());
        assert!(!d.path().join("sub").exists());
        assert!(d.path().exists(), "a pasta raiz do alvo nunca é removida");
    }

    #[test]
    fn respeita_pastas_protegidas() {
        let d = tempfile::tempdir().unwrap();
        fs::create_dir_all(d.path().join("guardar")).unwrap();
        fs::write(d.path().join("guardar").join("x.tmp"), b"1").unwrap();
        fs::write(d.path().join("y.tmp"), b"1").unwrap();
        let prot = Protection::new();
        prot.set_user_paths(&[d.path().join("guardar").to_string_lossy().into_owned()]);
        let c = Cleaner::default();
        let r = c.analyze_one(&target_files(d.path(), 0), &prot, &NoProgress);
        assert_eq!(r.files, 1);
    }

    #[test]
    fn encontra_pastas_vazias() {
        let d = tempfile::tempdir().unwrap();
        fs::create_dir_all(d.path().join("vazia/dentro")).unwrap();
        fs::create_dir_all(d.path().join("cheia")).unwrap();
        fs::write(d.path().join("cheia/f.txt"), b"1").unwrap();
        let prot = Protection::new();
        let found = collect_empty_dirs(&[d.path().to_path_buf()], &prot);
        let names: Vec<String> = found.iter().map(|f| f.path.file_name().unwrap().to_string_lossy().into_owned()).collect();
        assert!(names.contains(&"vazia".to_string()) && names.contains(&"dentro".to_string()));
        assert!(!names.contains(&"cheia".to_string()));
    }

    #[test]
    fn lista_alvos() {
        let c = Cleaner::default();
        let t = c.targets(&CleanOptions::default());
        assert!(t.iter().any(|x| x.id == "lixeira"));
        assert!(t.iter().any(|x| x.id == "temp-usuario"));
        assert!(t.iter().all(|x| !x.name.is_empty()));
    }
}
