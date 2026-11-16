//! Mapa de espaço: árvore de pastas com tamanhos acumulados para o treemap.

use crate::model::Category;
use crate::safety::normalize;
use crate::scan::{ScanIndex, NO_PARENT};
use serde::Serialize;
use std::path::Path;

/// Índices de filhos por pasta, calculados uma vez por varredura.
pub struct Tree {
    pub child_dirs: Vec<Vec<u32>>,
    pub child_files: Vec<Vec<u32>>,
    pub size: Vec<u64>,
    pub count: Vec<u64>,
}

impl Tree {
    pub fn build(index: &ScanIndex) -> Tree {
        let n = index.dirs.len();
        let mut child_dirs = vec![Vec::new(); n];
        let mut child_files = vec![Vec::new(); n];
        for (i, d) in index.dirs.iter().enumerate() {
            if d.parent != NO_PARENT {
                child_dirs[d.parent as usize].push(i as u32);
            }
        }
        for (i, f) in index.files.iter().enumerate() {
            if !f.removed() {
                child_files[f.dir as usize].push(i as u32);
            }
        }
        let (size, count) = index.dir_totals();
        Tree { child_dirs, child_files, size, count }
    }
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MapNode {
    /// "d12" (pasta), "f34" (arquivo), "o12" (outros itens agrupados) ou "raiz".
    pub id: String,
    pub name: String,
    pub path: String,
    pub size: u64,
    pub files: u64,
    pub is_dir: bool,
    pub category: Option<Category>,
    pub children: Vec<MapNode>,
}

fn dir_name(path: &str) -> String {
    Path::new(path).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| path.to_string())
}

fn dir_node(index: &ScanIndex, tree: &Tree, d: u32, depth: u8, max_children: usize) -> MapNode {
    let path = index.dirs[d as usize].path.clone();
    let mut node = MapNode {
        id: format!("d{d}"),
        name: dir_name(&path),
        path,
        size: tree.size[d as usize],
        files: tree.count[d as usize],
        is_dir: true,
        category: None,
        children: Vec::new(),
    };
    if depth == 0 {
        return node;
    }
    // Filhos: pastas e arquivos, do maior para o menor.
    let mut items: Vec<(u64, bool, u32)> = tree.child_dirs[d as usize]
        .iter()
        .map(|&c| (tree.size[c as usize], true, c))
        .chain(tree.child_files[d as usize].iter().map(|&f| (index.files[f as usize].size, false, f)))
        .filter(|(s, _, _)| *s > 0)
        .collect();
    items.sort_by(|a, b| b.0.cmp(&a.0));
    let keep = max_children.max(1);
    let rest: Vec<(u64, bool, u32)> = if items.len() > keep { items.split_off(keep) } else { Vec::new() };
    for (_, is_dir, i) in items {
        if is_dir {
            node.children.push(dir_node(index, tree, i, depth - 1, (max_children / 3).max(6)));
        } else {
            let f = &index.files[i as usize];
            node.children.push(MapNode {
                id: format!("f{i}"),
                name: f.name.to_string(),
                path: index.file_path(i as usize).to_string_lossy().into_owned(),
                size: f.size,
                files: 1,
                is_dir: false,
                category: Some(f.category),
                children: Vec::new(),
            });
        }
    }
    if !rest.is_empty() {
        node.children.push(MapNode {
            id: format!("o{d}"),
            name: format!("Outros {} itens", rest.len()),
            path: node.path.clone(),
            size: rest.iter().map(|r| r.0).sum(),
            files: rest.iter().map(|r| if r.1 { tree.count[r.2 as usize] } else { 1 }).sum(),
            is_dir: false,
            category: None,
            children: Vec::new(),
        });
    }
    node
}

/// Nó do mapa para uma pasta (ou a visão geral de todas as raízes).
pub fn node(index: &ScanIndex, tree: &Tree, path: Option<&str>, depth: u8, max_children: usize) -> Option<MapNode> {
    let roots: Vec<u32> = index.dirs.iter().enumerate().filter(|(_, d)| d.parent == NO_PARENT).map(|(i, _)| i as u32).collect();
    match path {
        Some(p) if !p.is_empty() => {
            let target = normalize(Path::new(p));
            let d = index.dirs.iter().position(|x| normalize(Path::new(&x.path)) == target)? as u32;
            Some(dir_node(index, tree, d, depth, max_children))
        }
        _ if roots.len() == 1 => Some(dir_node(index, tree, roots[0], depth, max_children)),
        _ => Some(MapNode {
            id: "raiz".into(),
            name: "Pastas analisadas".into(),
            path: String::new(),
            size: roots.iter().map(|&r| tree.size[r as usize]).sum(),
            files: roots.iter().map(|&r| tree.count[r as usize]).sum(),
            is_dir: true,
            category: None,
            children: roots.iter().map(|&r| dir_node(index, tree, r, depth.saturating_sub(1), max_children)).collect(),
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::progress::NoProgress;
    use crate::scan::{scan, tests::sample_tree, ScanOptions};

    #[test]
    fn monta_arvore_com_tamanhos() {
        let d = sample_tree();
        let idx = scan(&[d.path().to_path_buf()], &ScanOptions::default(), &NoProgress);
        let tree = Tree::build(&idx);
        let root = node(&idx, &tree, None, 2, 30).unwrap();
        assert_eq!(root.size, idx.stats().bytes);
        let fotos = root.children.iter().find(|c| c.name == "fotos").unwrap();
        assert_eq!(fotos.size, 3000 + 5000 + 4000 + 1000);
        assert!(!fotos.children.is_empty(), "profundidade 2 traz os filhos das pastas");
        // O maior item vem primeiro.
        assert!(root.children.windows(2).all(|w| w[0].size >= w[1].size));
        let only = node(&idx, &tree, Some(&d.path().join("docs").to_string_lossy()), 1, 2).unwrap();
        assert_eq!(only.children.len(), 3, "2 itens + 'Outros'");
        assert!(only.children[2].id.starts_with('o'));
    }
}
