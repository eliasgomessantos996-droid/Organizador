//! Arquivos duplicados: mesmo tamanho → mesmo início/fim → mesmo conteúdo (BLAKE3).

use crate::model::{Category, FileEntry};
use crate::progress::{Progress, ProgressUpdate};
use crate::scan::ScanIndex;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering::Relaxed};
use std::time::{Duration, Instant};

const EDGE: usize = 16 * 1024;

#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DupOptions {
    /// Ignora arquivos menores que isso (bytes).
    pub min_size: u64,
    /// Só estas categorias (vazio = todas).
    pub categories: Vec<Category>,
    pub include_hidden: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DupGroup {
    pub id: u32,
    pub size: u64,
    pub hash: String,
    pub files: Vec<FileEntry>,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct DupResult {
    pub groups: Vec<DupGroup>,
    /// Espaço que pode ser recuperado mantendo uma cópia de cada.
    pub wasted: u64,
    pub duplicate_files: u64,
    pub scanned_files: u64,
    pub hashed_bytes: u64,
    pub elapsed_ms: u64,
    pub cancelled: bool,
}

/// Hash do início e do fim do arquivo (rápido para descartar diferentes).
/// Arquivos pequenos (até 32 KB) são lidos por inteiro, então o hash já é definitivo.
fn edge_hash(path: &Path, size: u64) -> Option<[u8; 32]> {
    let mut f = File::open(path).ok()?;
    let mut h = blake3::Hasher::new();
    if size <= (EDGE * 2) as u64 {
        let mut buf = vec![0u8; size as usize];
        let n = read_full(&mut f, &mut buf).ok()?;
        h.update(&buf[..n]);
        return Some(*h.finalize().as_bytes());
    }
    let mut buf = vec![0u8; EDGE];
    let n = read_full(&mut f, &mut buf).ok()?;
    h.update(&buf[..n]);
    f.seek(SeekFrom::End(-(EDGE as i64))).ok()?;
    let n = read_full(&mut f, &mut buf).ok()?;
    h.update(&buf[..n]);
    Some(*h.finalize().as_bytes())
}

fn read_full(f: &mut File, buf: &mut [u8]) -> std::io::Result<usize> {
    let mut total = 0;
    while total < buf.len() {
        let n = f.read(&mut buf[total..])?;
        if n == 0 {
            break;
        }
        total += n;
    }
    Ok(total)
}

/// Hash do conteúdo inteiro.
fn full_hash(path: &Path, counter: &AtomicU64, stop: &dyn Fn() -> bool) -> Option<[u8; 32]> {
    let mut f = File::open(path).ok()?;
    let mut h = blake3::Hasher::new();
    let mut buf = vec![0u8; 1024 * 1024];
    loop {
        if stop() {
            return None;
        }
        let n = f.read(&mut buf).ok()?;
        if n == 0 {
            break;
        }
        h.update(&buf[..n]);
        counter.fetch_add(n as u64, Relaxed);
    }
    Some(*h.finalize().as_bytes())
}

fn regroup(groups: Vec<Vec<u32>>, keys: &HashMap<u32, [u8; 32]>) -> Vec<Vec<u32>> {
    let mut out = Vec::new();
    for g in groups {
        let mut by: HashMap<[u8; 32], Vec<u32>> = HashMap::new();
        for i in g {
            if let Some(k) = keys.get(&i) {
                by.entry(*k).or_default().push(i);
            }
        }
        out.extend(by.into_values().filter(|v| v.len() > 1));
    }
    out
}

pub fn find_duplicates(index: &ScanIndex, opts: &DupOptions, progress: &dyn Progress) -> DupResult {
    let start = Instant::now();
    let min = opts.min_size.max(1);
    let mut by_size: HashMap<u64, Vec<u32>> = HashMap::new();
    let mut scanned = 0u64;
    for (i, f) in index.files.iter().enumerate() {
        if f.removed() || f.size < min {
            continue;
        }
        if !opts.include_hidden && f.hidden() {
            continue;
        }
        if !opts.categories.is_empty() && !opts.categories.contains(&f.category) {
            continue;
        }
        scanned += 1;
        by_size.entry(f.size).or_default().push(i as u32);
    }
    let groups: Vec<Vec<u32>> = by_size.into_values().filter(|v| v.len() > 1).collect();

    // Passo 2: início e fim.
    let candidates: Vec<u32> = groups.iter().flatten().copied().collect();
    let total = candidates.len() as u64;
    let done = AtomicU64::new(0);
    progress.report(ProgressUpdate { phase: "Comparando tamanhos e começos".into(), total, ..Default::default() });
    let pool = rayon::ThreadPoolBuilder::new().num_threads(6).build();
    let edge_keys: HashMap<u32, [u8; 32]> = {
        let run = || {
            candidates
                .par_iter()
                .filter_map(|&i| {
                    if progress.cancelled() {
                        return None;
                    }
                    let f = &index.files[i as usize];
                    let r = edge_hash(&index.file_path(i as usize), f.size).map(|h| (i, h));
                    let d = done.fetch_add(1, Relaxed) + 1;
                    if d % 256 == 0 {
                        progress.report(ProgressUpdate { phase: "Comparando tamanhos e começos".into(), done: d, total, ..Default::default() });
                    }
                    r
                })
                .collect()
        };
        match &pool {
            Ok(p) => p.install(run),
            Err(_) => run(),
        }
    };
    let groups = regroup(groups, &edge_keys);

    // Passo 3: conteúdo completo (só para arquivos maiores que as bordas lidas).
    let needs_full: Vec<u32> = groups.iter().flatten().copied().filter(|&i| index.files[i as usize].size > (EDGE * 2) as u64).collect();
    let bytes_total: u64 = needs_full.iter().map(|&i| index.files[i as usize].size).sum();
    let hashed = AtomicU64::new(0);
    let finished = AtomicBool::new(false);
    let full_keys: HashMap<u32, [u8; 32]> = std::thread::scope(|s| {
        s.spawn(|| {
            while !finished.load(Relaxed) {
                std::thread::sleep(Duration::from_millis(150));
                progress.report(ProgressUpdate {
                    phase: "Comparando o conteúdo".into(),
                    done: 0,
                    total: 0,
                    bytes_done: hashed.load(Relaxed),
                    bytes_total,
                    current: String::new(),
                });
            }
        });
        let run = || {
            needs_full
                .par_iter()
                .filter_map(|&i| full_hash(&index.file_path(i as usize), &hashed, &|| progress.cancelled()).map(|h| (i, h)))
                .collect::<HashMap<u32, [u8; 32]>>()
        };
        let r = match &pool {
            Ok(p) => p.install(run),
            Err(_) => run(),
        };
        finished.store(true, Relaxed);
        r
    });

    // Pequenos: o hash do passo 2 já é do arquivo inteiro. Grandes: só valem com o
    // hash completo (se a leitura falhou, o arquivo fica de fora).
    let mut final_keys: HashMap<u32, [u8; 32]> = HashMap::new();
    for (&i, &k) in &edge_keys {
        if index.files[i as usize].size <= (EDGE * 2) as u64 {
            final_keys.insert(i, k);
        }
    }
    final_keys.extend(full_keys);
    let groups: Vec<Vec<u32>> = regroup(groups, &final_keys);

    let mut out: Vec<DupGroup> = groups
        .into_iter()
        .map(|g| {
            let size = index.files[g[0] as usize].size;
            let hash = final_keys.get(&g[0]).map(|h| h.iter().take(8).map(|b| format!("{b:02x}")).collect::<String>()).unwrap_or_default();
            let mut files: Vec<FileEntry> = g.iter().map(|&i| index.entry(i)).collect();
            files.sort_by(|a, b| a.path.len().cmp(&b.path.len()).then_with(|| a.path.cmp(&b.path)));
            DupGroup { id: 0, size, hash, files }
        })
        .collect();
    out.sort_by(|a, b| (b.size * (b.files.len() as u64 - 1)).cmp(&(a.size * (a.files.len() as u64 - 1))));
    for (i, g) in out.iter_mut().enumerate() {
        g.id = i as u32;
    }
    let wasted = out.iter().map(|g| g.size * (g.files.len() as u64 - 1)).sum();
    let duplicate_files = out.iter().map(|g| g.files.len() as u64 - 1).sum();
    DupResult {
        groups: out,
        wasted,
        duplicate_files,
        scanned_files: scanned,
        hashed_bytes: hashed.load(Relaxed),
        elapsed_ms: start.elapsed().as_millis() as u64,
        cancelled: progress.cancelled(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::progress::NoProgress;
    use crate::scan::{scan, ScanOptions};
    use std::fs;

    #[test]
    fn encontra_duplicados_reais() {
        let d = tempfile::tempdir().unwrap();
        let big: Vec<u8> = (0..200_000u32).map(|i| (i % 251) as u8).collect();
        let mut big2 = big.clone();
        big2[100_000] ^= 1; // mesmo tamanho, início e fim iguais, meio diferente
        fs::create_dir_all(d.path().join("a")).unwrap();
        fs::create_dir_all(d.path().join("b")).unwrap();
        fs::write(d.path().join("a/foto.jpg"), &big).unwrap();
        fs::write(d.path().join("b/foto (cópia).jpg"), &big).unwrap();
        fs::write(d.path().join("b/quase.jpg"), &big2).unwrap();
        fs::write(d.path().join("a/nota.txt"), b"igual").unwrap();
        fs::write(d.path().join("b/nota2.txt"), b"igual").unwrap();
        fs::write(d.path().join("b/outra.txt"), b"difer").unwrap();
        let idx = scan(&[d.path().to_path_buf()], &ScanOptions::default(), &NoProgress);
        let r = find_duplicates(&idx, &DupOptions::default(), &NoProgress);
        assert_eq!(r.groups.len(), 2, "{:?}", r.groups.iter().map(|g| g.files.iter().map(|f| f.name.clone()).collect::<Vec<_>>()).collect::<Vec<_>>());
        assert_eq!(r.groups[0].size, 200_000);
        assert_eq!(r.groups[0].files.len(), 2);
        assert_eq!(r.wasted, 200_000 + 5);
        assert_eq!(r.duplicate_files, 2);

        let only_big = find_duplicates(&idx, &DupOptions { min_size: 1000, ..Default::default() }, &NoProgress);
        assert_eq!(only_big.groups.len(), 1);
        let only_text = find_duplicates(&idx, &DupOptions { categories: vec![Category::Text], ..Default::default() }, &NoProgress);
        assert_eq!(only_text.groups.len(), 1);
    }

    #[test]
    fn arquivos_medios_com_final_diferente_nao_sao_duplicados() {
        let d = tempfile::tempdir().unwrap();
        let a = vec![7u8; 20_000];
        let mut b = a.clone();
        b[19_999] = 8; // difere só depois dos primeiros 16 KB
        fs::write(d.path().join("a.bin"), &a).unwrap();
        fs::write(d.path().join("b.bin"), &b).unwrap();
        let idx = scan(&[d.path().to_path_buf()], &ScanOptions::default(), &NoProgress);
        assert!(find_duplicates(&idx, &DupOptions::default(), &NoProgress).groups.is_empty());
    }
}
