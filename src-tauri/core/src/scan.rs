//! Varredura recursiva e paralela de pastas.
//!
//! Gera um índice compacto (pastas + arquivos) usado pelo Organizador
//! (lista "destrinchada"), pelo Mapa de espaço e pelos Duplicados.

use crate::model::{attributes, category_from_ext, ext_of, to_ms, Category, FileEntry};
use crate::progress::{Progress, ProgressUpdate};
use crate::safety::{is_within_norm, normalize};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering::Relaxed};
use std::sync::Mutex;
use std::time::{Duration, Instant};

pub const NO_PARENT: u32 = u32::MAX;
pub const F_HIDDEN: u8 = 1;
pub const F_SYSTEM: u8 = 2;
pub const F_READONLY: u8 = 4;
pub const F_REMOVED: u8 = 8;

#[derive(Debug, Clone)]
pub struct DirRec {
    pub path: String,
    pub parent: u32,
}

#[derive(Debug, Clone)]
pub struct FileRec {
    pub dir: u32,
    pub name: Box<str>,
    pub size: u64,
    pub modified: i64,
    pub created: i64,
    pub accessed: i64,
    pub category: Category,
    pub flags: u8,
}

impl FileRec {
    pub fn removed(&self) -> bool {
        self.flags & F_REMOVED != 0
    }
    pub fn hidden(&self) -> bool {
        self.flags & (F_HIDDEN | F_SYSTEM) != 0
    }
    /// Último uso conhecido (a maior data entre modificação e acesso).
    pub fn last_used(&self) -> i64 {
        self.modified.max(self.accessed)
    }
    pub fn ext(&self) -> &str {
        ext_of(&self.name)
    }
}

#[derive(Default, Debug)]
pub struct ScanIndex {
    pub roots: Vec<String>,
    pub dirs: Vec<DirRec>,
    pub files: Vec<FileRec>,
    pub errors: u64,
    pub elapsed_ms: u64,
    pub cancelled: bool,
}

#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ScanOptions {
    /// Inclui arquivos e pastas ocultos/de sistema.
    pub include_hidden: bool,
    /// Ignora pastas do Windows, Lixeira e similares.
    pub skip_system: bool,
    /// Pastas a ignorar.
    pub exclude: Vec<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ScanStats {
    pub roots: Vec<String>,
    pub files: u64,
    pub dirs: u64,
    pub bytes: u64,
    pub errors: u64,
    pub elapsed_ms: u64,
    pub cancelled: bool,
}

impl ScanIndex {
    pub fn file_path(&self, i: usize) -> PathBuf {
        let f = &self.files[i];
        Path::new(&self.dirs[f.dir as usize].path).join(&*f.name)
    }

    pub fn entry(&self, i: u32) -> FileEntry {
        let f = &self.files[i as usize];
        let dir = &self.dirs[f.dir as usize].path;
        FileEntry {
            id: Some(i),
            name: f.name.to_string(),
            path: Path::new(dir).join(&*f.name).to_string_lossy().into_owned(),
            parent: dir.clone(),
            is_dir: false,
            size: f.size,
            modified: f.modified,
            created: f.created,
            accessed: f.accessed,
            ext: f.ext().to_ascii_lowercase(),
            category: f.category,
            hidden: f.flags & F_HIDDEN != 0,
            system: f.flags & F_SYSTEM != 0,
            readonly: f.flags & F_READONLY != 0,
            is_link: false,
        }
    }

    pub fn stats(&self) -> ScanStats {
        let live = self.files.iter().filter(|f| !f.removed());
        let (files, bytes) = live.fold((0u64, 0u64), |(n, b), f| (n + 1, b + f.size));
        ScanStats {
            roots: self.roots.clone(),
            files,
            dirs: self.dirs.len() as u64,
            bytes,
            errors: self.errors,
            elapsed_ms: self.elapsed_ms,
            cancelled: self.cancelled,
        }
    }

    /// Tamanho e quantidade de arquivos de cada pasta (incluindo subpastas).
    pub fn dir_totals(&self) -> (Vec<u64>, Vec<u64>) {
        let mut size = vec![0u64; self.dirs.len()];
        let mut count = vec![0u64; self.dirs.len()];
        for f in self.files.iter().filter(|f| !f.removed()) {
            size[f.dir as usize] += f.size;
            count[f.dir as usize] += 1;
        }
        // Os filhos sempre têm índice maior que o pai.
        for i in (0..self.dirs.len()).rev() {
            let p = self.dirs[i].parent;
            if p != NO_PARENT {
                size[p as usize] += size[i];
                count[p as usize] += count[i];
            }
        }
        (size, count)
    }

    /// Marca arquivos como removidos (após excluir ou mover pela interface).
    pub fn mark_removed(&mut self, ids: &[u32]) {
        for &i in ids {
            if let Some(f) = self.files.get_mut(i as usize) {
                f.flags |= F_REMOVED;
            }
        }
    }

    /// Marca como removidos todos os arquivos de uma pasta (e subpastas).
    pub fn mark_removed_under(&mut self, folder: &Path) -> u64 {
        let target = normalize(folder);
        let mut mask = vec![false; self.dirs.len()];
        for i in 0..self.dirs.len() {
            let d = &self.dirs[i];
            mask[i] = (d.parent != NO_PARENT && mask[d.parent as usize]) || normalize(Path::new(&d.path)) == target;
        }
        let mut n = 0;
        for f in self.files.iter_mut() {
            if mask[f.dir as usize] && f.flags & F_REMOVED == 0 {
                f.flags |= F_REMOVED;
                n += 1;
            }
        }
        n
    }

    pub fn paths_of(&self, ids: &[u32]) -> Vec<String> {
        ids.iter()
            .filter(|&&i| (i as usize) < self.files.len())
            .map(|&i| self.file_path(i as usize).to_string_lossy().into_owned())
            .collect()
    }
}

/// Pastas de sistema que não interessam ao usuário (e nunca devem ser alteradas).
fn is_system_dir(path: &Path, name: &str) -> bool {
    if cfg!(windows) {
        let lower = name.to_ascii_lowercase();
        if lower.starts_with('$')
            || matches!(lower.as_str(), "system volume information" | "recovery" | "config.msi" | "windows.old" | "msocache")
        {
            return true;
        }
        let n = normalize(path);
        is_within_norm(&n, &normalize(&crate::safety::windows_dir()))
    } else {
        let n = normalize(path);
        ["/proc", "/sys", "/dev", "/run", "/snap"].iter().any(|p| is_within_norm(&n, p))
    }
}

/// Remove raízes repetidas ou contidas em outras (evita arquivos duplicados no índice).
pub fn dedupe_roots(roots: &[PathBuf]) -> Vec<PathBuf> {
    let mut list: Vec<(String, PathBuf)> = roots.iter().filter(|r| r.is_dir()).map(|r| (normalize(r), r.clone())).collect();
    list.sort_by_key(|(n, _)| n.len());
    let mut out: Vec<(String, PathBuf)> = Vec::new();
    for (n, p) in list {
        if !out.iter().any(|(o, _)| is_within_norm(&n, o)) {
            out.push((n, p));
        }
    }
    out.into_iter().map(|(_, p)| p).collect()
}

struct Walker<'a> {
    opts: &'a ScanOptions,
    excluded: Vec<String>,
    progress: &'a dyn Progress,
    dirs: Mutex<Vec<DirRec>>,
    files: Mutex<Vec<FileRec>>,
    n_files: AtomicU64,
    n_bytes: AtomicU64,
    n_dirs: AtomicU64,
    errors: AtomicU64,
    current: Mutex<String>,
}

impl Walker<'_> {
    fn skip_dir(&self, path: &Path, name: &str) -> bool {
        if self.opts.skip_system && is_system_dir(path, name) {
            return true;
        }
        if !self.excluded.is_empty() {
            let n = normalize(path);
            return self.excluded.iter().any(|e| is_within_norm(&n, e));
        }
        false
    }

    fn walk(&self, dir_id: u32, path: PathBuf) {
        if self.progress.cancelled() {
            return;
        }
        let rd = match fs::read_dir(&path) {
            Ok(r) => r,
            Err(_) => {
                self.errors.fetch_add(1, Relaxed);
                return;
            }
        };
        let mut local: Vec<FileRec> = Vec::new();
        let mut subdirs: Vec<PathBuf> = Vec::new();
        let mut bytes = 0u64;
        for entry in rd {
            let Ok(entry) = entry else {
                self.errors.fetch_add(1, Relaxed);
                continue;
            };
            let Ok(ft) = entry.file_type() else { continue };
            // Nunca segue links simbólicos ou junções (evita laços e duplicidade).
            if ft.is_symlink() {
                continue;
            }
            let name_os = entry.file_name();
            let name = name_os.to_string_lossy();
            let md = match entry.metadata() {
                Ok(m) => m,
                Err(_) => {
                    self.errors.fetch_add(1, Relaxed);
                    continue;
                }
            };
            let (hidden, system, readonly) = attributes(&name, &md);
            if (hidden || system) && !self.opts.include_hidden {
                continue;
            }
            if ft.is_dir() {
                let p = entry.path();
                if !self.skip_dir(&p, &name) {
                    subdirs.push(p);
                }
            } else {
                let size = md.len();
                bytes += size;
                local.push(FileRec {
                    dir: dir_id,
                    category: category_from_ext(ext_of(&name)),
                    name: name.into_owned().into_boxed_str(),
                    size,
                    modified: to_ms(md.modified()),
                    created: to_ms(md.created()),
                    accessed: to_ms(md.accessed()),
                    flags: ((hidden as u8) * F_HIDDEN) | ((system as u8) * F_SYSTEM) | ((readonly as u8) * F_READONLY),
                });
            }
        }
        self.n_files.fetch_add(local.len() as u64, Relaxed);
        self.n_bytes.fetch_add(bytes, Relaxed);
        self.n_dirs.fetch_add(1, Relaxed);
        if !local.is_empty() {
            self.files.lock().unwrap_or_else(|e| e.into_inner()).extend(local);
        }
        if let Ok(mut c) = self.current.try_lock() {
            *c = path.to_string_lossy().into_owned();
        }
        if subdirs.is_empty() {
            return;
        }
        let ids: Vec<u32> = {
            let mut d = self.dirs.lock().unwrap_or_else(|e| e.into_inner());
            subdirs
                .iter()
                .map(|p| {
                    d.push(DirRec { path: p.to_string_lossy().into_owned(), parent: dir_id });
                    (d.len() - 1) as u32
                })
                .collect()
        };
        subdirs.into_par_iter().zip(ids.into_par_iter()).for_each(|(p, id)| self.walk(id, p));
    }
}

/// Varre as pastas e devolve o índice de arquivos.
pub fn scan(roots: &[PathBuf], opts: &ScanOptions, progress: &dyn Progress) -> ScanIndex {
    let start = Instant::now();
    let roots = dedupe_roots(roots);
    let walker = Walker {
        opts,
        excluded: opts.exclude.iter().filter(|e| !e.is_empty()).map(|e| normalize(Path::new(e))).collect(),
        progress,
        dirs: Mutex::new(roots.iter().map(|r| DirRec { path: r.to_string_lossy().into_owned(), parent: NO_PARENT }).collect()),
        files: Mutex::new(Vec::new()),
        n_files: AtomicU64::new(0),
        n_bytes: AtomicU64::new(0),
        n_dirs: AtomicU64::new(0),
        errors: AtomicU64::new(0),
        current: Mutex::new(String::new()),
    };
    let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4).clamp(4, 16);
    let pool = rayon::ThreadPoolBuilder::new().num_threads(threads).build();
    let done = AtomicBool::new(false);

    std::thread::scope(|s| {
        s.spawn(|| {
            while !done.load(Relaxed) {
                std::thread::sleep(Duration::from_millis(140));
                progress.report(ProgressUpdate {
                    phase: "Lendo pastas".into(),
                    done: walker.n_files.load(Relaxed),
                    total: 0,
                    bytes_done: walker.n_bytes.load(Relaxed),
                    bytes_total: 0,
                    current: walker.current.lock().map(|c| c.clone()).unwrap_or_default(),
                });
            }
        });
        let work = || roots.par_iter().enumerate().for_each(|(i, r)| walker.walk(i as u32, r.clone()));
        match &pool {
            Ok(p) => p.install(work),
            Err(_) => work(),
        }
        done.store(true, Relaxed);
    });

    ScanIndex {
        roots: roots.iter().map(|r| r.to_string_lossy().into_owned()).collect(),
        dirs: walker.dirs.into_inner().unwrap_or_else(|e| e.into_inner()),
        files: walker.files.into_inner().unwrap_or_else(|e| e.into_inner()),
        errors: walker.errors.load(Relaxed),
        elapsed_ms: start.elapsed().as_millis() as u64,
        cancelled: progress.cancelled(),
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::progress::NoProgress;

    pub fn sample_tree() -> tempfile::TempDir {
        let d = tempfile::tempdir().unwrap();
        let w = |rel: &str, size: usize| {
            let p = d.path().join(rel);
            fs::create_dir_all(p.parent().unwrap()).unwrap();
            fs::write(p, vec![b'x'; size]).unwrap();
        };
        w("fotos/ferias/praia1.jpg", 3000);
        w("fotos/ferias/praia10.jpg", 5000);
        w("fotos/ferias/praia2.jpg", 4000);
        w("fotos/perfil.png", 1000);
        w("docs/contrato.pdf", 2000);
        w("docs/planilha.xlsx", 1500);
        w("docs/notas.txt", 10);
        w("musicas/faixa.mp3", 8000);
        w("instalador.exe", 9000);
        w(".oculto/segredo.txt", 50);
        d
    }

    #[test]
    fn varre_pastas_recursivamente() {
        let d = sample_tree();
        let idx = scan(&[d.path().to_path_buf()], &ScanOptions::default(), &NoProgress);
        assert_eq!(idx.files.len(), 9, "arquivos ocultos ficam de fora por padrão");
        assert_eq!(idx.stats().bytes, 3000 + 5000 + 4000 + 1000 + 2000 + 1500 + 10 + 8000 + 9000);
        let with_hidden = scan(&[d.path().to_path_buf()], &ScanOptions { include_hidden: true, ..Default::default() }, &NoProgress);
        assert_eq!(with_hidden.files.len(), 10);
        // Pais sempre antes dos filhos.
        for (i, dr) in idx.dirs.iter().enumerate() {
            assert!(dr.parent == NO_PARENT || (dr.parent as usize) < i);
        }
        let (sizes, counts) = idx.dir_totals();
        assert_eq!(sizes[0], idx.stats().bytes);
        assert_eq!(counts[0], 9);
    }

    #[test]
    fn ignora_raizes_repetidas_e_exclusoes() {
        let d = sample_tree();
        let roots = vec![d.path().to_path_buf(), d.path().join("fotos")];
        let idx = scan(&roots, &ScanOptions::default(), &NoProgress);
        assert_eq!(idx.roots.len(), 1);
        assert_eq!(idx.files.len(), 9);
        let opts = ScanOptions { exclude: vec![d.path().join("fotos").to_string_lossy().into_owned()], ..Default::default() };
        let idx = scan(&[d.path().to_path_buf()], &opts, &NoProgress);
        assert_eq!(idx.files.len(), 5);
    }
}
