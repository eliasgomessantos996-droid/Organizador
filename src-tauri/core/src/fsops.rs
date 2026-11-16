//! Operações de arquivo do Explorador: listar, copiar, mover, excluir,
//! renomear e criar, com tratamento de conflitos e progresso.

use crate::model::FileEntry;
use crate::progress::{Progress, ProgressUpdate};
use crate::safety::{is_within, Protection};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

/// O que fazer quando o destino já existe.
#[derive(Deserialize, Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Conflict {
    /// Mantém os dois ("nome (2).ext").
    Rename,
    /// Substitui o destino.
    Overwrite,
    /// Ignora o item.
    Skip,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DoneItem {
    pub from: String,
    pub to: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FailedItem {
    pub path: String,
    pub error: String,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct OpReport {
    pub done: Vec<DoneItem>,
    pub failed: Vec<FailedItem>,
    pub skipped: Vec<String>,
    pub bytes: u64,
    pub cancelled: bool,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct DeleteReport {
    pub deleted: Vec<String>,
    pub failed: Vec<FailedItem>,
    pub bytes: u64,
    pub cancelled: bool,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct SizeInfo {
    pub size: u64,
    pub files: u64,
    pub dirs: u64,
}

/// Mensagem de erro em português a partir de um erro de E/S.
pub fn io_msg(e: &io::Error) -> String {
    match e.kind() {
        io::ErrorKind::NotFound => "O item não foi encontrado (pode ter sido movido ou excluído).".into(),
        io::ErrorKind::PermissionDenied => "Acesso negado. O item pode estar em uso ou exigir permissão de administrador.".into(),
        io::ErrorKind::AlreadyExists => "Já existe um item com esse nome.".into(),
        _ => match e.raw_os_error() {
            Some(32) | Some(33) => "O arquivo está em uso por outro programa.".into(),
            Some(112) | Some(28) => "Não há espaço suficiente no disco.".into(),
            Some(206) | Some(36) => "O caminho é longo demais.".into(),
            Some(145) | Some(39) => "A pasta não está vazia.".into(),
            _ => format!("Erro: {e}"),
        },
    }
}

/// Lista o conteúdo de uma pasta (sem recursão).
pub fn list_dir(path: &Path, show_hidden: bool) -> Result<Vec<FileEntry>, String> {
    let rd = fs::read_dir(path).map_err(|e| io_msg(&e))?;
    let mut out = Vec::new();
    for entry in rd.flatten() {
        let p = entry.path();
        let ft = match entry.file_type() {
            Ok(ft) => ft,
            Err(_) => continue,
        };
        let item = if ft.is_symlink() {
            match FileEntry::from_path(&p) {
                Ok(e) => e,
                Err(_) => continue,
            }
        } else {
            match entry.metadata() {
                Ok(md) => FileEntry::from_metadata(&p, &md, false),
                Err(_) => continue,
            }
        };
        if !show_hidden && (item.hidden || item.system) {
            continue;
        }
        out.push(item);
    }
    Ok(out)
}

/// Valida um nome de arquivo segundo as regras do Windows.
pub fn validate_name(name: &str) -> Result<(), String> {
    let n = name.trim();
    if n.is_empty() {
        return Err("O nome não pode ficar vazio.".into());
    }
    if n == "." || n == ".." {
        return Err("Nome inválido.".into());
    }
    if let Some(c) = n.chars().find(|c| matches!(c, '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|') || (*c as u32) < 32) {
        return Err(format!("O nome não pode conter o caractere “{c}”. Evite \\ / : * ? \" < > |"));
    }
    if name.ends_with('.') || name.ends_with(' ') {
        return Err("O nome não pode terminar com ponto ou espaço.".into());
    }
    let stem = n.split('.').next().unwrap_or("").to_ascii_uppercase();
    let reserved = ["CON", "PRN", "AUX", "NUL"];
    let is_com_lpt = (stem.starts_with("COM") || stem.starts_with("LPT")) && stem.len() == 4 && stem.as_bytes()[3].is_ascii_digit();
    if reserved.contains(&stem.as_str()) || is_com_lpt {
        return Err(format!("“{stem}” é um nome reservado do Windows."));
    }
    if n.chars().count() > 240 {
        return Err("O nome é longo demais.".into());
    }
    Ok(())
}

fn split_name(name: &str, is_dir: bool) -> (&str, &str) {
    if is_dir {
        return (name, "");
    }
    match name.rfind('.') {
        Some(i) if i > 0 => (&name[..i], &name[i..]),
        _ => (name, ""),
    }
}

/// Caminho livre: "nome.ext", "nome (2).ext", "nome (3).ext"...
pub fn unique_path(dir: &Path, name: &str, is_dir: bool, reserved: &HashSet<PathBuf>) -> PathBuf {
    let first = dir.join(name);
    if !first.exists() && !reserved.contains(&first) {
        return first;
    }
    let (stem, ext) = split_name(name, is_dir);
    for i in 2..100_000 {
        let p = dir.join(format!("{stem} ({i}){ext}"));
        if !p.exists() && !reserved.contains(&p) {
            return p;
        }
    }
    dir.join(format!("{stem} ({}){ext}", crate::model::now_ms()))
}

/// Nome de cópia na mesma pasta, como o Explorer: "nome - Cópia.ext", "nome - Cópia (2).ext".
pub fn copy_name(dir: &Path, name: &str, is_dir: bool) -> PathBuf {
    let (stem, ext) = split_name(name, is_dir);
    let first = dir.join(format!("{stem} - Cópia{ext}"));
    if !first.exists() {
        return first;
    }
    for i in 2..100_000 {
        let p = dir.join(format!("{stem} - Cópia ({i}){ext}"));
        if !p.exists() {
            return p;
        }
    }
    dir.join(format!("{stem} - Cópia {}{ext}", crate::model::now_ms()))
}

pub fn create_folder(parent: &Path, name: Option<&str>) -> Result<PathBuf, String> {
    let name = name.unwrap_or("Nova pasta");
    validate_name(name)?;
    let p = unique_path(parent, name, true, &HashSet::new());
    fs::create_dir(&p).map_err(|e| io_msg(&e))?;
    Ok(p)
}

pub fn create_text_file(parent: &Path, name: Option<&str>) -> Result<PathBuf, String> {
    let name = name.unwrap_or("Novo documento de texto.txt");
    validate_name(name)?;
    let p = unique_path(parent, name, false, &HashSet::new());
    fs::OpenOptions::new().write(true).create_new(true).open(&p).map_err(|e| io_msg(&e))?;
    Ok(p)
}

pub fn rename(path: &Path, new_name: &str, prot: &Protection) -> Result<PathBuf, String> {
    prot.check(path)?;
    validate_name(new_name)?;
    let parent = path.parent().ok_or("Não é possível renomear este item.")?;
    let target = parent.join(new_name.trim());
    if target == path {
        return Ok(target);
    }
    // Permite mudar só maiúsculas/minúsculas ("foto.JPG" → "foto.jpg").
    let same_ignoring_case = target.to_string_lossy().to_lowercase() == path.to_string_lossy().to_lowercase();
    if target.exists() && !same_ignoring_case {
        return Err(format!("Já existe um item chamado “{}” nesta pasta.", new_name.trim()));
    }
    fs::rename(path, &target).map_err(|e| io_msg(&e))?;
    Ok(target)
}

/// Tamanho total de um arquivo ou pasta (recursivo, sem seguir links).
pub fn size_of(path: &Path, progress: &dyn Progress) -> SizeInfo {
    let mut info = SizeInfo::default();
    let md = match fs::symlink_metadata(path) {
        Ok(m) => m,
        Err(_) => return info,
    };
    if !md.is_dir() {
        info.size = md.len();
        info.files = 1;
        return info;
    }
    let mut stack = vec![path.to_path_buf()];
    let mut last = 0u64;
    while let Some(dir) = stack.pop() {
        if progress.cancelled() {
            break;
        }
        let Ok(rd) = fs::read_dir(&dir) else { continue };
        for entry in rd.flatten() {
            let Ok(ft) = entry.file_type() else { continue };
            if ft.is_symlink() {
                continue;
            }
            if ft.is_dir() {
                info.dirs += 1;
                stack.push(entry.path());
            } else if let Ok(m) = entry.metadata() {
                info.files += 1;
                info.size += m.len();
            }
        }
        if info.files - last > 2000 {
            last = info.files;
            progress.report(ProgressUpdate {
                phase: "Calculando tamanho".into(),
                done: info.files,
                bytes_done: info.size,
                ..Default::default()
            });
        }
    }
    info
}

/// Itens que já existem no destino (para perguntar antes de colar).
pub fn conflicts(sources: &[PathBuf], dest: &Path) -> Vec<String> {
    sources
        .iter()
        .filter(|s| s.parent().map(|p| p != dest).unwrap_or(true))
        .filter_map(|s| s.file_name())
        .filter(|n| dest.join(n).exists())
        .map(|n| n.to_string_lossy().into_owned())
        .collect()
}

struct Copier<'a> {
    progress: &'a dyn Progress,
    bytes_total: u64,
    bytes_done: u64,
    files_done: u64,
    files_total: u64,
    phase: &'static str,
}

impl Copier<'_> {
    fn tick(&mut self, current: &Path) {
        self.progress.report(ProgressUpdate {
            phase: self.phase.into(),
            done: self.files_done,
            total: self.files_total,
            bytes_done: self.bytes_done,
            bytes_total: self.bytes_total,
            current: current.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
        });
    }

    fn copy_file(&mut self, src: &Path, dst: &Path) -> io::Result<u64> {
        let n = fs::copy(src, dst)?;
        self.bytes_done += n;
        self.files_done += 1;
        self.tick(src);
        Ok(n)
    }

    /// Copia uma pasta recursivamente (mescla se o destino já existir).
    fn copy_dir(&mut self, src: &Path, dst: &Path) -> io::Result<()> {
        fs::create_dir_all(dst)?;
        for entry in fs::read_dir(src)? {
            if self.progress.cancelled() {
                return Err(io::Error::new(io::ErrorKind::Interrupted, "cancelado"));
            }
            let entry = entry?;
            let ft = entry.file_type()?;
            let from = entry.path();
            let to = dst.join(entry.file_name());
            if ft.is_symlink() {
                continue;
            } else if ft.is_dir() {
                self.copy_dir(&from, &to)?;
            } else {
                self.copy_file(&from, &to)?;
            }
        }
        Ok(())
    }
}

fn is_cross_device(e: &io::Error) -> bool {
    // ERROR_NOT_SAME_DEVICE (Windows) / EXDEV (Unix)
    matches!(e.raw_os_error(), Some(17) if cfg!(windows)) || matches!(e.raw_os_error(), Some(18) if !cfg!(windows))
}

/// Decide o caminho de destino conforme a política de conflito.
fn resolve_target(src: &Path, dest: &Path, conflict: Conflict, copying: bool, reserved: &HashSet<PathBuf>) -> Option<PathBuf> {
    let name = src.file_name()?.to_string_lossy().into_owned();
    let is_dir = src.is_dir();
    let same_dir = src.parent().map(|p| p == dest).unwrap_or(false);
    if same_dir {
        // Copiar para a mesma pasta cria "- Cópia"; mover para a mesma pasta não faz nada.
        return if copying { Some(copy_name(dest, &name, is_dir)) } else { None };
    }
    let target = dest.join(&name);
    if !target.exists() && !reserved.contains(&target) {
        return Some(target);
    }
    match conflict {
        Conflict::Rename => Some(unique_path(dest, &name, is_dir, reserved)),
        Conflict::Overwrite => Some(target),
        Conflict::Skip => None,
    }
}

fn pre_count(sources: &[PathBuf], progress: &dyn Progress) -> (u64, u64) {
    let mut bytes = 0;
    let mut files = 0;
    for s in sources {
        let info = size_of(s, progress);
        bytes += info.size;
        files += info.files;
    }
    (bytes, files)
}

/// Copia itens para uma pasta.
pub fn copy_items(sources: &[PathBuf], dest: &Path, conflict: Conflict, progress: &dyn Progress) -> OpReport {
    let mut report = OpReport::default();
    if !dest.is_dir() {
        report.failed.push(FailedItem { path: dest.to_string_lossy().into(), error: "A pasta de destino não existe.".into() });
        return report;
    }
    let (bytes_total, files_total) = pre_count(sources, progress);
    let mut c = Copier { progress, bytes_total, bytes_done: 0, files_done: 0, files_total, phase: "Copiando" };
    let mut reserved = HashSet::new();
    for src in sources {
        if progress.cancelled() {
            report.cancelled = true;
            break;
        }
        let s = src.to_string_lossy().into_owned();
        if !src.exists() {
            report.failed.push(FailedItem { path: s, error: "O item não foi encontrado.".into() });
            continue;
        }
        if src.is_dir() && is_within(dest, src) {
            report.failed.push(FailedItem { path: s, error: "Não é possível copiar uma pasta para dentro dela mesma.".into() });
            continue;
        }
        let Some(target) = resolve_target(src, dest, conflict, true, &reserved) else {
            report.skipped.push(s);
            continue;
        };
        reserved.insert(target.clone());
        let before = c.bytes_done;
        let res = if src.is_dir() {
            c.copy_dir(src, &target)
        } else {
            c.copy_file(src, &target).map(|_| ())
        };
        match res {
            Ok(()) => {
                report.bytes += c.bytes_done - before;
                report.done.push(DoneItem { from: s, to: target.to_string_lossy().into() });
            }
            Err(e) if e.kind() == io::ErrorKind::Interrupted => {
                report.cancelled = true;
                // Remove a cópia parcial para não deixar lixo.
                let _ = remove_all(&target);
                break;
            }
            Err(e) => report.failed.push(FailedItem { path: s, error: io_msg(&e) }),
        }
    }
    report
}

/// Move itens para uma pasta (renomeia; entre unidades, copia e apaga a origem).
pub fn move_items(sources: &[PathBuf], dest: &Path, conflict: Conflict, prot: &Protection, progress: &dyn Progress) -> OpReport {
    let mut report = OpReport::default();
    if !dest.is_dir() {
        report.failed.push(FailedItem { path: dest.to_string_lossy().into(), error: "A pasta de destino não existe.".into() });
        return report;
    }
    let total = sources.len() as u64;
    let mut reserved = HashSet::new();
    for (i, src) in sources.iter().enumerate() {
        if progress.cancelled() {
            report.cancelled = true;
            break;
        }
        let s = src.to_string_lossy().into_owned();
        if let Err(e) = prot.check(src) {
            report.failed.push(FailedItem { path: s, error: e });
            continue;
        }
        if !src.exists() {
            report.failed.push(FailedItem { path: s, error: "O item não foi encontrado.".into() });
            continue;
        }
        if src.is_dir() && is_within(dest, src) {
            report.failed.push(FailedItem { path: s, error: "Não é possível mover uma pasta para dentro dela mesma.".into() });
            continue;
        }
        let Some(target) = resolve_target(src, dest, conflict, false, &reserved) else {
            report.skipped.push(s);
            continue;
        };
        reserved.insert(target.clone());
        progress.report(ProgressUpdate {
            phase: "Movendo".into(),
            done: i as u64,
            total,
            current: src.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
            ..Default::default()
        });
        let size = size_of(src, &crate::progress::NoProgress).size;
        match move_one(src, &target, progress) {
            Ok(()) => {
                report.bytes += size;
                report.done.push(DoneItem { from: s, to: target.to_string_lossy().into() });
            }
            Err(e) if e.kind() == io::ErrorKind::Interrupted => {
                report.cancelled = true;
                break;
            }
            Err(e) => report.failed.push(FailedItem { path: s, error: io_msg(&e) }),
        }
    }
    report
}

/// Move um único item para `target` (que pode existir quando a política é substituir).
pub fn move_one(src: &Path, target: &Path, progress: &dyn Progress) -> io::Result<()> {
    if target.exists() {
        if src.is_dir() && target.is_dir() {
            // Mescla pastas: move o conteúdo e remove a origem vazia.
            for entry in fs::read_dir(src)? {
                let entry = entry?;
                move_one(&entry.path(), &target.join(entry.file_name()), progress)?;
            }
            return fs::remove_dir(src);
        }
        remove_all(target)?;
    }
    match fs::rename(src, target) {
        Ok(()) => Ok(()),
        Err(e) if is_cross_device(&e) => {
            let mut c = Copier { progress, bytes_total: 0, bytes_done: 0, files_done: 0, files_total: 0, phase: "Movendo" };
            if src.is_dir() {
                if let Err(err) = c.copy_dir(src, target) {
                    let _ = remove_all(target);
                    return Err(err);
                }
            } else {
                c.copy_file(src, target)?;
            }
            remove_all(src)
        }
        Err(e) => Err(e),
    }
}

/// Remove um arquivo ou pasta permanentemente, limpando "somente leitura" se preciso.
pub fn remove_all(path: &Path) -> io::Result<()> {
    let md = fs::symlink_metadata(path)?;
    let ft = md.file_type();
    if ft.is_symlink() {
        // Remove só o link (nunca o destino).
        return fs::remove_file(path).or_else(|_| fs::remove_dir(path));
    }
    if md.is_dir() {
        for entry in fs::read_dir(path)? {
            remove_all(&entry?.path())?;
        }
        return fs::remove_dir(path).or_else(|e| {
            clear_readonly(path);
            fs::remove_dir(path).map_err(|_| e)
        });
    }
    fs::remove_file(path).or_else(|e| {
        if e.kind() == io::ErrorKind::PermissionDenied {
            clear_readonly(path);
            fs::remove_file(path)
        } else {
            Err(e)
        }
    })
}

fn clear_readonly(path: &Path) {
    if let Ok(md) = fs::metadata(path) {
        let mut perm = md.permissions();
        if perm.readonly() {
            #[allow(clippy::permissions_set_readonly_false)]
            perm.set_readonly(false);
            let _ = fs::set_permissions(path, perm);
        }
    }
}

/// Envia itens para a Lixeira em lotes (mais rápido); se um lote falhar, tenta um a um.
pub fn trash_paths(paths: &[PathBuf]) -> (Vec<PathBuf>, Vec<(PathBuf, String)>) {
    let mut ok = Vec::new();
    let mut failed = Vec::new();
    for chunk in paths.chunks(100) {
        match trash::delete_all(chunk) {
            Ok(()) => ok.extend(chunk.iter().cloned()),
            Err(_) => {
                for p in chunk {
                    match trash::delete(p) {
                        Ok(()) => ok.push(p.clone()),
                        Err(e) => {
                            let msg = if p.exists() { format!("Não foi possível enviar para a Lixeira: {e}") } else { "O item não foi encontrado.".into() };
                            failed.push((p.clone(), msg));
                        }
                    }
                }
            }
        }
    }
    (ok, failed)
}

/// Exclui itens (para a Lixeira ou permanentemente).
pub fn delete_items(paths: &[PathBuf], permanent: bool, prot: &Protection, progress: &dyn Progress) -> DeleteReport {
    let mut report = DeleteReport::default();
    let mut allowed = Vec::new();
    let mut sizes = Vec::new();
    for p in paths {
        match prot.check(p) {
            Ok(()) => {
                sizes.push(size_of(p, &crate::progress::NoProgress).size);
                allowed.push(p.clone());
            }
            Err(e) => report.failed.push(FailedItem { path: p.to_string_lossy().into(), error: e }),
        }
    }
    let total = allowed.len() as u64;
    if !permanent {
        progress.report(ProgressUpdate { phase: "Enviando para a Lixeira".into(), total, ..Default::default() });
        let size_of_path: std::collections::HashMap<&PathBuf, u64> = allowed.iter().zip(sizes.iter().copied()).collect();
        let (ok, failed) = trash_paths(&allowed);
        for p in &ok {
            report.bytes += size_of_path.get(p).copied().unwrap_or(0);
            report.deleted.push(p.to_string_lossy().into());
        }
        for (p, e) in failed {
            report.failed.push(FailedItem { path: p.to_string_lossy().into(), error: e });
        }
        return report;
    }
    for (i, (p, size)) in allowed.iter().zip(sizes).enumerate() {
        if progress.cancelled() {
            report.cancelled = true;
            break;
        }
        progress.report(ProgressUpdate {
            phase: "Excluindo".into(),
            done: i as u64,
            total,
            current: p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
            ..Default::default()
        });
        match remove_all(p) {
            Ok(()) => {
                report.bytes += size;
                report.deleted.push(p.to_string_lossy().into());
            }
            Err(e) => report.failed.push(FailedItem { path: p.to_string_lossy().into(), error: io_msg(&e) }),
        }
    }
    report
}

/// Desfaz movimentações: leva cada item de volta ao caminho original.
pub fn move_back(pairs: &[(String, String)], prot: &Protection) -> OpReport {
    let mut report = OpReport::default();
    for (original, current) in pairs {
        let cur = Path::new(current);
        let orig = Path::new(original);
        if !cur.exists() {
            report.failed.push(FailedItem { path: current.clone(), error: "O item não foi encontrado.".into() });
            continue;
        }
        if let Err(e) = prot.check(cur) {
            report.failed.push(FailedItem { path: current.clone(), error: e });
            continue;
        }
        let parent = match orig.parent() {
            Some(p) => p,
            None => continue,
        };
        if !parent.exists() {
            if let Err(e) = fs::create_dir_all(parent) {
                report.failed.push(FailedItem { path: current.clone(), error: io_msg(&e) });
                continue;
            }
        }
        let target = if orig.exists() {
            let name = orig.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
            unique_path(parent, &name, cur.is_dir(), &HashSet::new())
        } else {
            orig.to_path_buf()
        };
        match move_one(cur, &target, &crate::progress::NoProgress) {
            Ok(()) => report.done.push(DoneItem { from: current.clone(), to: target.to_string_lossy().into() }),
            Err(e) => report.failed.push(FailedItem { path: current.clone(), error: io_msg(&e) }),
        }
    }
    report
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::progress::NoProgress;

    fn write(p: &Path, content: &str) {
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, content).unwrap();
    }

    #[test]
    fn nomes_unicos_e_copias() {
        let d = tempfile::tempdir().unwrap();
        write(&d.path().join("a.txt"), "1");
        assert_eq!(unique_path(d.path(), "a.txt", false, &HashSet::new()), d.path().join("a (2).txt"));
        assert_eq!(copy_name(d.path(), "a.txt", false), d.path().join("a - Cópia.txt"));
        write(&d.path().join("a - Cópia.txt"), "1");
        assert_eq!(copy_name(d.path(), "a.txt", false), d.path().join("a - Cópia (2).txt"));
        assert_eq!(unique_path(d.path(), "pasta.v2", true, &HashSet::new()), d.path().join("pasta.v2"));
    }

    #[test]
    fn valida_nomes() {
        assert!(validate_name("relatório final.docx").is_ok());
        assert!(validate_name("a/b").is_err());
        assert!(validate_name("CON").is_err());
        assert!(validate_name("com1.txt").is_err());
        assert!(validate_name("nome.").is_err());
        assert!(validate_name("   ").is_err());
    }

    #[test]
    fn copia_move_renomeia_exclui() {
        let d = tempfile::tempdir().unwrap();
        let prot = Protection::new();
        let src = d.path().join("origem");
        let dst = d.path().join("destino");
        write(&src.join("x.txt"), "olá");
        write(&src.join("sub").join("y.txt"), "mundo");
        fs::create_dir_all(&dst).unwrap();

        // Copiar pasta
        let r = copy_items(&[src.clone()], &dst, Conflict::Rename, &NoProgress);
        assert!(r.failed.is_empty(), "{:?}", r.failed);
        assert!(dst.join("origem").join("sub").join("y.txt").exists());
        assert_eq!(r.bytes, 9); // "olá" (4 bytes) + "mundo" (5 bytes)

        // Copiar de novo → mantém os dois
        let r = copy_items(&[src.clone()], &dst, Conflict::Rename, &NoProgress);
        assert!(dst.join("origem (2)").exists(), "{:?}", r);

        // Copiar na mesma pasta → " - Cópia"
        copy_items(&[src.join("x.txt")], &src, Conflict::Rename, &NoProgress);
        assert!(src.join("x - Cópia.txt").exists());

        // Pasta para dentro dela mesma
        let r = copy_items(&[src.clone()], &src.join("sub"), Conflict::Rename, &NoProgress);
        assert_eq!(r.failed.len(), 1);

        // Mover com conflito "ignorar"
        write(&dst.join("x.txt"), "antigo");
        let r = move_items(&[src.join("x.txt")], &dst, Conflict::Skip, &prot, &NoProgress);
        assert_eq!(r.skipped.len(), 1);
        assert_eq!(fs::read_to_string(dst.join("x.txt")).unwrap(), "antigo");

        // Mover substituindo
        let r = move_items(&[src.join("x.txt")], &dst, Conflict::Overwrite, &prot, &NoProgress);
        assert_eq!(r.done.len(), 1);
        assert_eq!(fs::read_to_string(dst.join("x.txt")).unwrap(), "olá");
        assert!(!src.join("x.txt").exists());

        // Renomear
        let p = rename(&dst.join("x.txt"), "novo.txt", &prot).unwrap();
        assert!(p.ends_with("novo.txt"));
        assert!(rename(&p, "a|b.txt", &prot).is_err());

        // Excluir permanentemente
        let r = delete_items(&[dst.join("origem")], true, &prot, &NoProgress);
        assert_eq!(r.deleted.len(), 1);
        assert!(!dst.join("origem").exists());
        assert_eq!(r.bytes, 9);

        // Desfazer movimentação
        write(&src.join("volta.txt"), "v");
        let r = move_items(&[src.join("volta.txt")], &dst, Conflict::Rename, &prot, &NoProgress);
        let pair = (r.done[0].from.clone(), r.done[0].to.clone());
        let back = move_back(&[pair], &prot);
        assert!(back.failed.is_empty());
        assert!(src.join("volta.txt").exists());
    }

    #[test]
    fn conflitos_e_listagem() {
        let d = tempfile::tempdir().unwrap();
        write(&d.path().join("a").join("f.txt"), "1");
        write(&d.path().join("b").join("f.txt"), "2");
        let c = conflicts(&[d.path().join("a").join("f.txt")], &d.path().join("b"));
        assert_eq!(c, vec!["f.txt".to_string()]);
        let list = list_dir(&d.path().join("a"), false).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].ext, "txt");
        let p = create_folder(d.path(), None).unwrap();
        assert!(p.ends_with("Nova pasta"));
        let p2 = create_folder(d.path(), None).unwrap();
        assert!(p2.ends_with("Nova pasta (2)"));
        let t = create_text_file(d.path(), None).unwrap();
        assert!(t.exists());
    }
}
