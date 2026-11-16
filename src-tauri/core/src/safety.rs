//! Proteção contra operações perigosas: pastas do sistema, raízes de unidades
//! e pastas protegidas pelo usuário nunca são excluídas, movidas ou renomeadas.

use std::path::{Path, PathBuf};
use std::sync::RwLock;

/// Normaliza um caminho para comparação (minúsculas e "\" no Windows, sem barra final).
pub fn normalize(p: &Path) -> String {
    let mut s = p.to_string_lossy().into_owned();
    if cfg!(windows) {
        s = s.replace('/', "\\");
        if let Some(rest) = s.strip_prefix(r"\\?\UNC\") {
            s = format!(r"\\{rest}");
        } else if let Some(rest) = s.strip_prefix(r"\\?\") {
            s = rest.to_string();
        }
        while s.len() > 3 && s.ends_with('\\') {
            s.pop();
        }
        // "C:" vira "c:\"
        if s.len() == 2 && s.as_bytes()[1] == b':' {
            s.push('\\');
        }
        s.to_lowercase()
    } else {
        while s.len() > 1 && s.ends_with('/') {
            s.pop();
        }
        s
    }
}

fn sep() -> char {
    if cfg!(windows) {
        '\\'
    } else {
        '/'
    }
}

/// `child` é igual a `parent` ou está dentro dele (caminhos já normalizados).
pub fn is_within_norm(child: &str, parent: &str) -> bool {
    if child == parent {
        return true;
    }
    if parent.ends_with(sep()) {
        return child.starts_with(parent);
    }
    child.len() > parent.len() && child.starts_with(parent) && child[parent.len()..].starts_with(sep())
}

pub fn is_within(child: &Path, parent: &Path) -> bool {
    is_within_norm(&normalize(child), &normalize(parent))
}

/// É a raiz de uma unidade (C:\, D:\ ou /).
pub fn is_drive_root(p: &Path) -> bool {
    let n = normalize(p);
    if cfg!(windows) {
        (n.len() == 3 && n.ends_with(":\\")) || (n.starts_with(r"\\") && n.matches('\\').count() <= 3)
    } else {
        n == "/"
    }
}

fn env_path(var: &str) -> Option<PathBuf> {
    std::env::var_os(var).filter(|v| !v.is_empty()).map(PathBuf::from)
}

/// Pasta do Windows (C:\Windows).
pub fn windows_dir() -> PathBuf {
    env_path("SystemRoot").or_else(|| env_path("windir")).unwrap_or_else(|| PathBuf::from(r"C:\Windows"))
}

pub fn system_drive() -> PathBuf {
    env_path("SystemDrive").map(|d| PathBuf::from(format!("{}\\", d.to_string_lossy()))).unwrap_or_else(|| PathBuf::from(r"C:\"))
}

/// Caminhos que nunca podem ser alterados (iguais ou dentro deles).
fn protected_trees() -> Vec<PathBuf> {
    if cfg!(windows) {
        let sd = system_drive();
        vec![
            windows_dir(),
            sd.join("System Volume Information"),
            sd.join("$Recycle.Bin"),
            sd.join("Recovery"),
            sd.join("Boot"),
            sd.join("EFI"),
            sd.join("$WinREAgent"),
            sd.join("$Windows.~BT"),
            sd.join("$Windows.~WS"),
        ]
    } else {
        ["/bin", "/boot", "/dev", "/etc", "/lib", "/lib32", "/lib64", "/proc", "/sbin", "/sys", "/usr", "/var/lib"]
            .iter()
            .map(PathBuf::from)
            .collect()
    }
}

/// Caminhos protegidos somente como item exato (o conteúdo pode ser alterado).
fn protected_exact() -> Vec<PathBuf> {
    let mut v = Vec::new();
    if let Some(home) = dirs::home_dir() {
        if let Some(users) = home.parent() {
            v.push(users.to_path_buf());
        }
        v.push(home.clone());
        for sub in ["AppData", "Desktop", "Documents", "Downloads", "Pictures", "Music", "Videos", ".config", ".local"] {
            v.push(home.join(sub));
        }
    }
    if cfg!(windows) {
        let sd = system_drive();
        for var in ["ProgramFiles", "ProgramFiles(x86)", "ProgramData", "ProgramW6432", "PUBLIC"] {
            if let Some(p) = env_path(var) {
                v.push(p);
            }
        }
        for f in ["pagefile.sys", "hiberfil.sys", "swapfile.sys", "bootmgr", "BOOTNXT", "DumpStack.log.tmp"] {
            v.push(sd.join(f));
        }
    } else {
        for p in ["/home", "/root", "/opt", "/srv", "/tmp", "/var", "/mnt", "/media"] {
            v.push(PathBuf::from(p));
        }
    }
    v
}

/// Lista de pastas protegidas definidas pelo usuário nas configurações.
#[derive(Default)]
pub struct Protection {
    user: RwLock<Vec<String>>,
}

impl Protection {
    pub fn new() -> Protection {
        Protection::default()
    }

    pub fn set_user_paths(&self, paths: &[String]) {
        let norm = paths.iter().filter(|p| !p.trim().is_empty()).map(|p| normalize(Path::new(p))).collect();
        *self.user.write().unwrap_or_else(|e| e.into_inner()) = norm;
    }

    /// Verifica se o item pode ser excluído, movido ou renomeado.
    pub fn check(&self, path: &Path) -> Result<(), String> {
        let n = normalize(path);
        if is_drive_root(path) {
            return Err("Não é possível alterar a raiz de uma unidade.".into());
        }
        for t in protected_trees() {
            if is_within_norm(&n, &normalize(&t)) {
                return Err(format!("“{}” é uma pasta protegida do sistema.", display_name(path)));
            }
        }
        for e in protected_exact() {
            if n == normalize(&e) {
                return Err(format!("“{}” é uma pasta essencial e não pode ser alterada.", display_name(path)));
            }
        }
        let user = self.user.read().unwrap_or_else(|e| e.into_inner());
        for u in user.iter() {
            if is_within_norm(&n, u) {
                return Err(format!("“{}” está em uma pasta protegida nas Configurações.", display_name(path)));
            }
        }
        Ok(())
    }

    /// Versão para a limpeza automática: só respeita as pastas do usuário
    /// (os alvos de limpeza do sistema já são caminhos conhecidos e seguros).
    pub fn check_user_only(&self, path: &Path) -> Result<(), String> {
        let n = normalize(path);
        let user = self.user.read().unwrap_or_else(|e| e.into_inner());
        if user.iter().any(|u| is_within_norm(&n, u)) {
            return Err("Item em pasta protegida nas Configurações.".into());
        }
        Ok(())
    }
}

fn display_name(p: &Path) -> String {
    p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| p.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dentro_de_pasta() {
        if cfg!(windows) {
            assert!(is_within_norm(r"c:\a\b", r"c:\a"));
            assert!(!is_within_norm(r"c:\ab", r"c:\a"));
            assert!(is_within_norm(r"c:\a", r"c:\"));
        } else {
            assert!(is_within_norm("/a/b", "/a"));
            assert!(!is_within_norm("/ab", "/a"));
            assert!(is_within_norm("/a", "/"));
        }
    }

    #[test]
    fn protege_raiz_e_sistema() {
        let p = Protection::new();
        if cfg!(windows) {
            assert!(p.check(Path::new(r"C:\")).is_err());
            assert!(p.check(&windows_dir().join("System32")).is_err());
        } else {
            assert!(p.check(Path::new("/")).is_err());
            assert!(p.check(Path::new("/usr/bin/ls")).is_err());
        }
        if let Some(home) = dirs::home_dir() {
            assert!(p.check(&home).is_err());
            assert!(p.check(&home.join("Downloads")).is_err());
            assert!(p.check(&home.join("Downloads").join("arquivo.zip")).is_ok());
        }
    }

    #[test]
    fn protege_pastas_do_usuario() {
        let dir = tempfile::tempdir().unwrap();
        let p = Protection::new();
        let file = dir.path().join("importante").join("a.txt");
        assert!(p.check(&file).is_ok());
        p.set_user_paths(&[dir.path().join("importante").to_string_lossy().into_owned()]);
        assert!(p.check(&file).is_err());
        assert!(p.check(&dir.path().join("outro.txt")).is_ok());
    }
}
