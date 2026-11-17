//! Regras de organização automática: "mover PDFs de Downloads para Documentos\PDFs",
//! "organizar fotos por ano", "mandar instaladores antigos para a Lixeira"...

use crate::fsops::{copy_name, move_one, trash_paths, unique_path, DoneItem, FailedItem};
use crate::model::{category_from_ext, ext_of, now_ms, to_ms, Category};
use crate::natural::fold;
use crate::progress::{NoProgress, Progress, ProgressUpdate};
use crate::safety::{is_within, normalize, Protection};
use chrono::{DateTime, Datelike, Local};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};

#[derive(Deserialize, Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Conditions {
    pub categories: Vec<Category>,
    pub extensions: Vec<String>,
    pub name_contains: String,
    pub older_than_days: Option<u32>,
    pub min_size: Option<u64>,
    pub max_size: Option<u64>,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum RuleAction {
    Move { dest: String },
    Copy { dest: String },
    Trash,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Rule {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub source: String,
    #[serde(default)]
    pub recursive: bool,
    #[serde(default)]
    pub conditions: Conditions,
    pub action: RuleAction,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PlannedAction {
    pub rule_id: String,
    pub rule_name: String,
    pub from: String,
    pub to: Option<String>,
    /// "move", "copy" ou "trash".
    pub action: String,
    pub size: u64,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ApplyResult {
    pub moved: Vec<DoneItem>,
    pub copied: Vec<DoneItem>,
    pub trashed: Vec<String>,
    pub failed: Vec<FailedItem>,
    pub bytes: u64,
}

const MONTHS: [&str; 12] = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

/// Expande o destino: {categoria}, {ano}, {mes}, {mes_nome}, {dia}, {ext}. Relativo = dentro da origem.
pub fn expand_dest(template: &str, source: &Path, name: &str, modified_ms: i64) -> PathBuf {
    let ext = ext_of(name).to_ascii_lowercase();
    let cat = category_from_ext(&ext);
    let dt: DateTime<Local> = DateTime::from_timestamp_millis(modified_ms).map(|d| d.with_timezone(&Local)).unwrap_or_else(Local::now);
    let s = template
        .replace("{categoria}", cat.folder_name())
        .replace("{ano}", &format!("{:04}", dt.year()))
        .replace("{mes_nome}", MONTHS[(dt.month0()) as usize])
        .replace("{mes}", &format!("{:02}", dt.month()))
        .replace("{dia}", &format!("{:02}", dt.day()))
        .replace("{ext}", if ext.is_empty() { "sem extensão" } else { &ext })
        .replace("{EXT}", &if ext.is_empty() { "SEM EXTENSÃO".to_string() } else { ext.to_uppercase() });
    let p = PathBuf::from(s.trim());
    if p.is_absolute() {
        p
    } else {
        source.join(p)
    }
}

/// Parte fixa do destino (antes do primeiro {token}): arquivos lá dentro já estão organizados.
fn dest_base(template: &str, source: &Path) -> PathBuf {
    let fixed = template.split('{').next().unwrap_or("").trim_end_matches(['\\', '/']);
    if fixed.is_empty() {
        return source.to_path_buf();
    }
    let p = PathBuf::from(fixed);
    if p.is_absolute() {
        p
    } else {
        source.join(p)
    }
}

fn matches(c: &Conditions, name: &str, size: u64, modified: i64) -> bool {
    let ext = ext_of(name).to_ascii_lowercase();
    if !c.categories.is_empty() && !c.categories.contains(&category_from_ext(&ext)) {
        return false;
    }
    if !c.extensions.is_empty() && !c.extensions.iter().any(|e| e.trim_start_matches('.').eq_ignore_ascii_case(&ext)) {
        return false;
    }
    if !c.name_contains.trim().is_empty() && !fold(name).contains(&fold(c.name_contains.trim())) {
        return false;
    }
    if let Some(days) = c.older_than_days {
        if modified > now_ms() - days as i64 * 86_400_000 {
            return false;
        }
    }
    if let Some(min) = c.min_size {
        if size < min {
            return false;
        }
    }
    if let Some(max) = c.max_size {
        if size > max {
            return false;
        }
    }
    true
}

fn list_files(dir: &Path, recursive: bool, skip: &[PathBuf], out: &mut Vec<(PathBuf, u64, i64)>, limit: usize) {
    let mut stack = vec![dir.to_path_buf()];
    while let Some(d) = stack.pop() {
        let Ok(rd) = std::fs::read_dir(&d) else { continue };
        for e in rd.flatten() {
            if out.len() >= limit {
                return;
            }
            let Ok(ft) = e.file_type() else { continue };
            if ft.is_symlink() {
                continue;
            }
            let p = e.path();
            if ft.is_dir() {
                if recursive && !skip.iter().any(|s| is_within(&p, s)) {
                    stack.push(p);
                }
                continue;
            }
            let Ok(md) = e.metadata() else { continue };
            let (hidden, system, _) = crate::model::attributes(&e.file_name().to_string_lossy(), &md);
            if hidden || system {
                continue;
            }
            out.push((p, md.len(), to_ms(md.modified())));
        }
    }
}

/// Calcula o que cada regra faria, sem mexer em nada (prévia).
pub fn preview(rules: &[Rule], prot: &Protection) -> Result<Vec<PlannedAction>, String> {
    let mut plan = Vec::new();
    let mut claimed: HashSet<String> = HashSet::new();
    let mut reserved: HashSet<PathBuf> = HashSet::new();
    for rule in rules.iter().filter(|r| r.enabled) {
        let source = PathBuf::from(&rule.source);
        if !source.is_dir() {
            return Err(format!("A pasta de origem da regra “{}” não existe: {}", rule.name, rule.source));
        }
        // Não reprocessa o que já está nas pastas de destino das regras.
        let skip: Vec<PathBuf> = rules
            .iter()
            .filter_map(|r| match &r.action {
                RuleAction::Move { dest } | RuleAction::Copy { dest } => Some(dest_base(dest, &PathBuf::from(&r.source))),
                RuleAction::Trash => None,
            })
            .filter(|b| *b != source)
            .collect();
        let mut files = Vec::new();
        list_files(&source, rule.recursive, &skip, &mut files, 50_000);
        for (path, size, modified) in files {
            let key = normalize(&path);
            if claimed.contains(&key) {
                continue;
            }
            let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
            if !matches(&rule.conditions, &name, size, modified) {
                continue;
            }
            if prot.check(&path).is_err() {
                continue;
            }
            let (action, to) = match &rule.action {
                RuleAction::Trash => ("trash", None),
                RuleAction::Move { dest } | RuleAction::Copy { dest } => {
                    let dir = expand_dest(dest, &source, &name, modified);
                    if path.parent().map(|p| normalize(p) == normalize(&dir)).unwrap_or(false) {
                        continue; // já está no lugar
                    }
                    let mut target = dir.join(&name);
                    if target.exists() || reserved.contains(&target) {
                        target = unique_path(&dir, &name, false, &reserved);
                    }
                    reserved.insert(target.clone());
                    (if matches!(rule.action, RuleAction::Move { .. }) { "move" } else { "copy" }, Some(target.to_string_lossy().into_owned()))
                }
            };
            claimed.insert(key);
            plan.push(PlannedAction { rule_id: rule.id.clone(), rule_name: rule.name.clone(), from: path.to_string_lossy().into_owned(), to, action: action.into(), size });
            if plan.len() >= 20_000 {
                return Ok(plan);
            }
        }
    }
    Ok(plan)
}

/// Executa a prévia aprovada pelo usuário.
pub fn apply(plan: &[PlannedAction], prot: &Protection, progress: &dyn Progress) -> ApplyResult {
    let mut r = ApplyResult::default();
    let total = plan.len() as u64;
    let mut to_trash: Vec<(PathBuf, u64)> = Vec::new();
    for (i, a) in plan.iter().enumerate() {
        if progress.cancelled() {
            break;
        }
        progress.report(ProgressUpdate {
            phase: "Organizando".into(),
            done: i as u64,
            total,
            current: Path::new(&a.from).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
            ..Default::default()
        });
        let from = PathBuf::from(&a.from);
        if !from.exists() {
            r.failed.push(FailedItem { path: a.from.clone(), error: "O item não foi encontrado.".into() });
            continue;
        }
        if let Err(e) = prot.check(&from) {
            r.failed.push(FailedItem { path: a.from.clone(), error: e });
            continue;
        }
        match (a.action.as_str(), &a.to) {
            ("trash", _) => to_trash.push((from, a.size)),
            (kind, Some(to)) => {
                let mut target = PathBuf::from(to);
                let Some(dir) = target.parent().map(|p| p.to_path_buf()) else { continue };
                if let Err(e) = std::fs::create_dir_all(&dir) {
                    r.failed.push(FailedItem { path: a.from.clone(), error: crate::fsops::io_msg(&e) });
                    continue;
                }
                if target.exists() {
                    let name = target.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
                    target = if kind == "copy" && dir == from.parent().unwrap_or(Path::new("")) { copy_name(&dir, &name, false) } else { unique_path(&dir, &name, false, &HashSet::new()) };
                }
                let res = if kind == "move" { move_one(&from, &target, &NoProgress) } else { std::fs::copy(&from, &target).map(|_| ()) };
                match res {
                    Ok(()) => {
                        r.bytes += a.size;
                        let done = DoneItem { from: a.from.clone(), to: target.to_string_lossy().into_owned() };
                        if kind == "move" {
                            r.moved.push(done);
                        } else {
                            r.copied.push(done);
                        }
                    }
                    Err(e) => r.failed.push(FailedItem { path: a.from.clone(), error: crate::fsops::io_msg(&e) }),
                }
            }
            _ => {}
        }
    }
    if !to_trash.is_empty() {
        let paths: Vec<PathBuf> = to_trash.iter().map(|x| x.0.clone()).collect();
        let (ok, failed) = trash_paths(&paths);
        for p in ok {
            r.bytes += to_trash.iter().find(|x| x.0 == p).map(|x| x.1).unwrap_or(0);
            r.trashed.push(p.to_string_lossy().into_owned());
        }
        for (p, e) in failed {
            r.failed.push(FailedItem { path: p.to_string_lossy().into_owned(), error: e });
        }
    }
    r
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn rule(source: &Path, conditions: Conditions, dest: &str) -> Rule {
        Rule {
            id: "r1".into(),
            name: "Organizar".into(),
            enabled: true,
            source: source.to_string_lossy().into_owned(),
            recursive: false,
            conditions,
            action: RuleAction::Move { dest: dest.into() },
        }
    }

    #[test]
    fn expande_tokens() {
        let src = Path::new("/base");
        // 15/03/2024 12:00 UTC
        let p = expand_dest("{categoria}/{ano}/{mes}", src, "foto.JPG", 1_710_504_000_000);
        // Compara por componentes (no Windows o separador é "\").
        assert!(p.starts_with(src.join("Imagens").join("2024")), "{p:?}");
        assert!(p.ends_with("03"), "{p:?}");
        assert_eq!(expand_dest("Arquivos {EXT}", src, "a.pdf", 0), src.join("Arquivos PDF"));
    }

    #[test]
    fn organiza_downloads_por_tipo_e_desfaz() {
        let d = tempfile::tempdir().unwrap();
        fs::write(d.path().join("contrato.pdf"), b"pdf").unwrap();
        fs::write(d.path().join("foto.jpg"), b"jpg").unwrap();
        fs::write(d.path().join("musica.mp3"), b"mp3").unwrap();
        let prot = Protection::new();
        let rules = vec![rule(d.path(), Conditions::default(), "{categoria}")];
        let plan = preview(&rules, &prot).unwrap();
        assert_eq!(plan.len(), 3);
        let res = apply(&plan, &prot, &NoProgress);
        assert_eq!(res.moved.len(), 3, "{:?}", res.failed);
        assert!(d.path().join("PDFs").join("contrato.pdf").exists());
        assert!(d.path().join("Imagens").join("foto.jpg").exists());
        assert!(d.path().join("Músicas").join("musica.mp3").exists());
        // Rodar de novo não move nada (já organizado).
        let again = preview(&[Rule { recursive: true, ..rules[0].clone() }], &prot).unwrap();
        assert!(again.is_empty(), "{again:?}");
        // Desfazer
        let pairs: Vec<(String, String)> = res.moved.iter().map(|m| (m.from.clone(), m.to.clone())).collect();
        let back = crate::fsops::move_back(&pairs, &prot);
        assert!(back.failed.is_empty());
        assert!(d.path().join("foto.jpg").exists());
    }

    #[test]
    fn filtra_por_condicoes_e_primeira_regra_vence() {
        let d = tempfile::tempdir().unwrap();
        fs::write(d.path().join("Captura de tela 1.png"), b"x").unwrap();
        fs::write(d.path().join("foto.png"), b"x").unwrap();
        fs::write(d.path().join("doc.txt"), b"x").unwrap();
        let prot = Protection::new();
        let r1 = Rule { id: "a".into(), ..rule(d.path(), Conditions { name_contains: "captura".into(), ..Default::default() }, "Capturas") };
        let r2 = Rule { id: "b".into(), ..rule(d.path(), Conditions { extensions: vec![".PNG".into()], ..Default::default() }, "Imagens") };
        let plan = preview(&[r1, r2], &prot).unwrap();
        assert_eq!(plan.len(), 2);
        assert_eq!(plan.iter().find(|p| p.from.contains("Captura")).unwrap().rule_id, "a");
        assert_eq!(plan.iter().find(|p| p.from.ends_with("foto.png")).unwrap().rule_id, "b");
        let old = rule(d.path(), Conditions { older_than_days: Some(30), ..Default::default() }, "Antigos");
        assert!(preview(&[old], &prot).unwrap().is_empty(), "arquivos recém-criados não são antigos");
    }
}
