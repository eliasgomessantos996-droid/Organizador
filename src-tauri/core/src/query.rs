//! Filtros, ordenação, paginação e resumos sobre o índice da varredura.

use crate::model::{Category, FileEntry};
use crate::natural::{fold, natural_cmp, wildcard_match};
use crate::safety::normalize;
use crate::scan::{FileRec, ScanIndex, NO_PARENT};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;

#[derive(Deserialize, Serialize, Default, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct FileFilter {
    /// Parte do nome ou coringas (*.pdf).
    pub text: String,
    pub categories: Vec<Category>,
    pub extensions: Vec<String>,
    pub size_min: Option<u64>,
    pub size_max: Option<u64>,
    pub modified_after: Option<i64>,
    pub modified_before: Option<i64>,
    /// Arquivos cujo último uso é anterior a esta data (ms).
    pub unused_before: Option<i64>,
    /// Restringe a uma subpasta.
    pub folder: Option<String>,
    pub hide_hidden: bool,
}

#[derive(Deserialize, Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SortKey {
    Name,
    Modified,
    Size,
    Type,
    Folder,
    Created,
    Accessed,
    Used,
}

#[derive(Deserialize, Serialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SortSpec {
    pub key: SortKey,
    pub desc: bool,
}

impl Default for SortSpec {
    fn default() -> Self {
        SortSpec { key: SortKey::Name, desc: false }
    }
}

enum TextMatch {
    None,
    Contains(String),
    Wildcard(String),
}

struct Matcher {
    text: TextMatch,
    cats: [bool; 17],
    any_cat: bool,
    exts: Vec<String>,
    dir_mask: Option<Vec<bool>>,
    f: FileFilter,
}

fn cat_index(c: Category) -> usize {
    c as usize
}

impl Matcher {
    fn new(index: &ScanIndex, f: &FileFilter) -> Matcher {
        let t = fold(f.text.trim());
        let text = if t.is_empty() {
            TextMatch::None
        } else if t.contains('*') || t.contains('?') {
            TextMatch::Wildcard(t)
        } else {
            TextMatch::Contains(t)
        };
        let mut cats = [false; 17];
        for c in &f.categories {
            cats[cat_index(*c)] = true;
        }
        let dir_mask = f.folder.as_ref().filter(|s| !s.is_empty()).map(|folder| {
            let target = normalize(Path::new(folder));
            let mut mask = vec![false; index.dirs.len()];
            for (i, d) in index.dirs.iter().enumerate() {
                let inherited = d.parent != NO_PARENT && mask[d.parent as usize];
                mask[i] = inherited || normalize(Path::new(&d.path)) == target;
            }
            mask
        });
        Matcher {
            text,
            cats,
            any_cat: f.categories.is_empty(),
            exts: f.extensions.iter().map(|e| e.trim_start_matches('.').to_ascii_lowercase()).filter(|e| !e.is_empty()).collect(),
            dir_mask,
            f: f.clone(),
        }
    }

    fn matches(&self, r: &FileRec) -> bool {
        if r.removed() {
            return false;
        }
        if self.f.hide_hidden && r.hidden() {
            return false;
        }
        if !self.any_cat && !self.cats[cat_index(r.category)] {
            return false;
        }
        if !self.exts.is_empty() {
            let e = r.ext();
            if !self.exts.iter().any(|x| x.eq_ignore_ascii_case(e)) {
                return false;
            }
        }
        if let Some(min) = self.f.size_min {
            if r.size < min {
                return false;
            }
        }
        if let Some(max) = self.f.size_max {
            if r.size > max {
                return false;
            }
        }
        if let Some(a) = self.f.modified_after {
            if r.modified < a {
                return false;
            }
        }
        if let Some(b) = self.f.modified_before {
            if r.modified >= b {
                return false;
            }
        }
        if let Some(u) = self.f.unused_before {
            if r.last_used() >= u {
                return false;
            }
        }
        if let Some(mask) = &self.dir_mask {
            if !mask.get(r.dir as usize).copied().unwrap_or(false) {
                return false;
            }
        }
        match &self.text {
            TextMatch::None => true,
            TextMatch::Contains(t) => fold(&r.name).contains(t.as_str()),
            TextMatch::Wildcard(t) => wildcard_match(t, &fold(&r.name)),
        }
    }
}

/// Resultado filtrado e ordenado (índices dos arquivos).
#[derive(Clone)]
pub struct QueryResult {
    pub filter: FileFilter,
    pub sort: SortSpec,
    pub ids: Arc<Vec<u32>>,
    pub total_size: u64,
}

pub fn run(index: &ScanIndex, filter: &FileFilter, sort: SortSpec) -> QueryResult {
    let m = Matcher::new(index, filter);
    let mut ids: Vec<u32> = (0..index.files.len() as u32).into_par_iter().filter(|&i| m.matches(&index.files[i as usize])).collect();
    sort_ids(index, &mut ids, sort);
    let total_size = ids.par_iter().map(|&i| index.files[i as usize].size).sum();
    QueryResult { filter: filter.clone(), sort, ids: Arc::new(ids), total_size }
}

/// Reaproveita o resultado anterior quando o filtro e a ordenação não mudaram.
pub fn run_cached(index: &ScanIndex, filter: &FileFilter, sort: SortSpec, cache: &mut Option<QueryResult>) -> QueryResult {
    if let Some(c) = cache {
        if c.filter == *filter && c.sort == sort {
            return c.clone();
        }
    }
    let r = run(index, filter, sort);
    *cache = Some(r.clone());
    r
}

fn sort_ids(index: &ScanIndex, ids: &mut [u32], sort: SortSpec) {
    let f = &index.files;
    let by_name = |a: u32, b: u32| natural_cmp(&f[a as usize].name, &f[b as usize].name);
    match sort.key {
        SortKey::Name => ids.par_sort_by(|&a, &b| by_name(a, b)),
        SortKey::Size => ids.par_sort_by(|&a, &b| f[a as usize].size.cmp(&f[b as usize].size).then_with(|| by_name(a, b))),
        SortKey::Modified => ids.par_sort_by(|&a, &b| f[a as usize].modified.cmp(&f[b as usize].modified).then_with(|| by_name(a, b))),
        SortKey::Created => ids.par_sort_by(|&a, &b| f[a as usize].created.cmp(&f[b as usize].created).then_with(|| by_name(a, b))),
        SortKey::Accessed => ids.par_sort_by(|&a, &b| f[a as usize].accessed.cmp(&f[b as usize].accessed).then_with(|| by_name(a, b))),
        SortKey::Used => {
            ids.par_sort_by(|&a, &b| f[a as usize].last_used().cmp(&f[b as usize].last_used()).then_with(|| by_name(a, b)))
        }
        SortKey::Type => ids.par_sort_by(|&a, &b| {
            let (x, y) = (&f[a as usize], &f[b as usize]);
            x.category
                .type_rank()
                .cmp(&y.category.type_rank())
                .then_with(|| x.ext().to_ascii_lowercase().cmp(&y.ext().to_ascii_lowercase()))
                .then_with(|| by_name(a, b))
        }),
        SortKey::Folder => {
            // Classifica as pastas uma única vez e compara pela posição.
            let mut order: Vec<u32> = (0..index.dirs.len() as u32).collect();
            order.par_sort_by(|&a, &b| natural_cmp(&index.dirs[a as usize].path, &index.dirs[b as usize].path));
            let mut rank = vec![0u32; index.dirs.len()];
            for (pos, &d) in order.iter().enumerate() {
                rank[d as usize] = pos as u32;
            }
            ids.par_sort_by(|&a, &b| rank[f[a as usize].dir as usize].cmp(&rank[f[b as usize].dir as usize]).then_with(|| by_name(a, b)))
        }
    }
    if sort.desc {
        ids.reverse();
    }
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct QueryPage {
    pub total: u64,
    pub total_size: u64,
    pub offset: u64,
    pub items: Vec<FileEntry>,
}

pub fn page(index: &ScanIndex, q: &QueryResult, offset: usize, limit: usize) -> QueryPage {
    let end = (offset + limit).min(q.ids.len());
    let items = if offset < end { q.ids[offset..end].iter().map(|&i| index.entry(i)).collect() } else { Vec::new() };
    QueryPage { total: q.ids.len() as u64, total_size: q.total_size, offset: offset as u64, items }
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CategoryStat {
    pub category: Category,
    pub count: u64,
    pub size: u64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AgeStat {
    pub id: &'static str,
    pub label: &'static str,
    /// Limites em dias [de, até) contados a partir de hoje.
    pub from_days: u32,
    pub to_days: Option<u32>,
    pub count: u64,
    pub size: u64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FolderStat {
    pub path: String,
    pub name: String,
    pub count: u64,
    pub size: u64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ExtStat {
    pub ext: String,
    pub count: u64,
    pub size: u64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    pub count: u64,
    pub size: u64,
    pub categories: Vec<CategoryStat>,
    pub ages: Vec<AgeStat>,
    pub folders: Vec<FolderStat>,
    pub extensions: Vec<ExtStat>,
    pub largest: Vec<FileEntry>,
}

const AGES: [(&str, &str, u32, Option<u32>); 6] = [
    ("recentes", "Últimos 30 dias", 0, Some(30)),
    ("meses", "1 a 6 meses", 30, Some(182)),
    ("semestre", "6 a 12 meses", 182, Some(365)),
    ("ano", "1 a 2 anos", 365, Some(730)),
    ("anos", "2 a 5 anos", 730, Some(1825)),
    ("antigos", "Mais de 5 anos", 1825, None),
];

/// Resumo do resultado: por categoria, idade (modificação), pasta e extensão.
pub fn summarize(index: &ScanIndex, ids: &[u32], now_ms: i64) -> Summary {
    let day = 86_400_000i64;
    let mut cats: HashMap<Category, (u64, u64)> = HashMap::new();
    let mut ages = [(0u64, 0u64); 6];
    let mut exts: HashMap<String, (u64, u64)> = HashMap::new();
    let mut folders: HashMap<u32, (u64, u64)> = HashMap::new();

    // Pasta de primeiro nível (filha da raiz) de cada pasta.
    let mut top = vec![0u32; index.dirs.len()];
    for (i, d) in index.dirs.iter().enumerate() {
        top[i] = if d.parent == NO_PARENT || index.dirs[d.parent as usize].parent == NO_PARENT {
            i as u32
        } else {
            top[d.parent as usize]
        };
    }

    let mut size = 0u64;
    for &i in ids {
        let f = &index.files[i as usize];
        size += f.size;
        let c = cats.entry(f.category).or_default();
        c.0 += 1;
        c.1 += f.size;
        let age_days = ((now_ms - f.modified).max(0) / day) as u32;
        let slot = AGES.iter().position(|(_, _, from, to)| age_days >= *from && to.map(|t| age_days < t).unwrap_or(true)).unwrap_or(5);
        ages[slot].0 += 1;
        ages[slot].1 += f.size;
        let e = exts.entry(f.ext().to_ascii_lowercase()).or_default();
        e.0 += 1;
        e.1 += f.size;
        let fo = folders.entry(top[f.dir as usize]).or_default();
        fo.0 += 1;
        fo.1 += f.size;
    }

    let mut categories: Vec<CategoryStat> = cats.into_iter().map(|(category, (count, size))| CategoryStat { category, count, size }).collect();
    categories.sort_by(|a, b| b.size.cmp(&a.size));

    let mut extensions: Vec<ExtStat> = exts.into_iter().map(|(ext, (count, size))| ExtStat { ext, count, size }).collect();
    extensions.sort_by(|a, b| b.size.cmp(&a.size));
    extensions.truncate(12);

    let mut folder_stats: Vec<FolderStat> = folders
        .into_iter()
        .map(|(d, (count, size))| {
            let path = index.dirs[d as usize].path.clone();
            let name = Path::new(&path).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| path.clone());
            FolderStat { path, name, count, size }
        })
        .collect();
    folder_stats.sort_by(|a, b| b.size.cmp(&a.size));
    folder_stats.truncate(12);

    let mut by_size: Vec<u32> = ids.to_vec();
    let k = 10.min(by_size.len());
    if k > 0 && by_size.len() > k {
        by_size.select_nth_unstable_by(k - 1, |&a, &b| index.files[b as usize].size.cmp(&index.files[a as usize].size));
        by_size.truncate(k);
    }
    by_size.sort_by(|&a, &b| index.files[b as usize].size.cmp(&index.files[a as usize].size).then(Ordering::Equal));
    let largest = by_size.into_iter().take(10).map(|i| index.entry(i)).collect();

    Summary {
        count: ids.len() as u64,
        size,
        categories,
        ages: AGES
            .iter()
            .zip(ages.iter())
            .map(|((id, label, from, to), (count, size))| AgeStat { id, label, from_days: *from, to_days: *to, count: *count, size: *size })
            .collect(),
        folders: folder_stats,
        extensions,
        largest,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::progress::NoProgress;
    use crate::scan::{scan, tests::sample_tree, ScanOptions};

    #[test]
    fn filtra_e_ordena() {
        let d = sample_tree();
        let idx = scan(&[d.path().to_path_buf()], &ScanOptions::default(), &NoProgress);
        let names = |q: &QueryResult| q.ids.iter().map(|&i| idx.files[i as usize].name.to_string()).collect::<Vec<_>>();

        let q = run(&idx, &FileFilter { text: "praia".into(), ..Default::default() }, SortSpec::default());
        assert_eq!(names(&q), vec!["praia1.jpg", "praia2.jpg", "praia10.jpg"]);

        let q = run(&idx, &FileFilter::default(), SortSpec { key: SortKey::Size, desc: true });
        assert_eq!(names(&q)[0], "instalador.exe");
        assert_eq!(q.total_size, idx.stats().bytes);

        let q = run(&idx, &FileFilter { categories: vec![Category::Image], ..Default::default() }, SortSpec::default());
        assert_eq!(q.ids.len(), 4);

        let q = run(&idx, &FileFilter { text: "*.pdf".into(), ..Default::default() }, SortSpec::default());
        assert_eq!(names(&q), vec!["contrato.pdf"]);

        let q = run(&idx, &FileFilter { size_min: Some(4000), size_max: Some(8000), ..Default::default() }, SortSpec::default());
        assert_eq!(q.ids.len(), 3);

        let folder = d.path().join("fotos").to_string_lossy().into_owned();
        let q = run(&idx, &FileFilter { folder: Some(folder), ..Default::default() }, SortSpec::default());
        assert_eq!(q.ids.len(), 4);

        let q = run(&idx, &FileFilter { extensions: vec![".TXT".into()], ..Default::default() }, SortSpec::default());
        assert_eq!(names(&q), vec!["notas.txt"]);

        let q = run(&idx, &FileFilter::default(), SortSpec { key: SortKey::Type, desc: false });
        assert_eq!(q.ids.len(), 9);
    }

    #[test]
    fn resumo_e_paginas() {
        let d = sample_tree();
        let mut idx = scan(&[d.path().to_path_buf()], &ScanOptions::default(), &NoProgress);
        let q = run(&idx, &FileFilter::default(), SortSpec::default());
        let s = summarize(&idx, &q.ids, crate::model::now_ms());
        assert_eq!(s.count, 9);
        assert_eq!(s.ages[0].count, 9, "todos foram criados agora");
        assert_eq!(s.largest[0].name, "instalador.exe");
        assert!(s.folders.iter().any(|f| f.name == "fotos" && f.count == 4));

        let p = page(&idx, &q, 0, 4);
        assert_eq!(p.items.len(), 4);
        assert_eq!(p.total, 9);
        let p = page(&idx, &q, 8, 4);
        assert_eq!(p.items.len(), 1);

        // Itens removidos somem das consultas.
        let first = q.ids[0];
        idx.mark_removed(&[first]);
        let q2 = run(&idx, &FileFilter::default(), SortSpec::default());
        assert_eq!(q2.ids.len(), 8);
        let mut cache = None;
        let a = run_cached(&idx, &FileFilter::default(), SortSpec::default(), &mut cache);
        let b = run_cached(&idx, &FileFilter::default(), SortSpec::default(), &mut cache);
        assert!(Arc::ptr_eq(&a.ids, &b.ids));
    }
}
