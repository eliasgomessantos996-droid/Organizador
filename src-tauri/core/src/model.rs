//! Tipos compartilhados: categorias de arquivo e a entrada de arquivo enviada à interface.

use serde::{Deserialize, Serialize};
use std::fs::Metadata;
use std::io;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
pub enum Category {
    Folder,
    Image,
    Video,
    Audio,
    Document,
    Spreadsheet,
    Presentation,
    Pdf,
    Text,
    Code,
    Archive,
    Executable,
    Diskimage,
    Font,
    Temporary,
    System,
    Other,
}

impl Category {
    pub const ALL_FILES: [Category; 16] = [
        Category::Image,
        Category::Video,
        Category::Audio,
        Category::Document,
        Category::Spreadsheet,
        Category::Presentation,
        Category::Pdf,
        Category::Text,
        Category::Code,
        Category::Archive,
        Category::Executable,
        Category::Diskimage,
        Category::Font,
        Category::Temporary,
        Category::System,
        Category::Other,
    ];

    /// Ordem usada ao ordenar por "Tipo" (rótulos em ordem alfabética, pastas primeiro).
    pub fn type_rank(self) -> u8 {
        match self {
            Category::Folder => 0,
            Category::Presentation => 1,
            Category::Audio => 2,
            Category::Code => 3,
            Category::Archive => 4,
            Category::Document => 5,
            Category::Font => 6,
            Category::Image => 7,
            Category::Diskimage => 8,
            Category::Other => 9,
            Category::Pdf => 10,
            Category::Spreadsheet => 11,
            Category::Executable => 12,
            Category::System => 13,
            Category::Temporary => 14,
            Category::Text => 15,
            Category::Video => 16,
        }
    }

    /// Nome da pasta usado pelas regras de organização ({categoria}).
    pub fn folder_name(self) -> &'static str {
        match self {
            Category::Folder => "Pastas",
            Category::Image => "Imagens",
            Category::Video => "Vídeos",
            Category::Audio => "Músicas",
            Category::Document => "Documentos",
            Category::Spreadsheet => "Planilhas",
            Category::Presentation => "Apresentações",
            Category::Pdf => "PDFs",
            Category::Text => "Textos",
            Category::Code => "Códigos",
            Category::Archive => "Compactados",
            Category::Executable => "Instaladores",
            Category::Diskimage => "Imagens de disco",
            Category::Font => "Fontes",
            Category::Temporary => "Temporários",
            Category::System => "Sistema",
            Category::Other => "Outros",
        }
    }
}

/// Categoria a partir da extensão (mesma tabela da interface).
pub fn category_from_ext(ext: &str) -> Category {
    let e = ext.to_ascii_lowercase();
    match e.as_str() {
        "jpg" | "jpeg" | "png" | "gif" | "bmp" | "webp" | "tif" | "tiff" | "heic" | "heif" | "svg" | "ico" | "raw" | "cr2"
        | "cr3" | "nef" | "arw" | "dng" | "orf" | "rw2" | "psd" | "ai" | "avif" | "jfif" | "jxl" | "eps" => Category::Image,
        "mp4" | "mkv" | "avi" | "mov" | "wmv" | "flv" | "webm" | "m4v" | "mpg" | "mpeg" | "3gp" | "ts" | "mts" | "m2ts"
        | "vob" | "ogv" => Category::Video,
        "mp3" | "wav" | "flac" | "aac" | "ogg" | "oga" | "wma" | "m4a" | "opus" | "aiff" | "aif" | "mid" | "midi" | "amr"
        | "ape" => Category::Audio,
        "doc" | "docx" | "docm" | "odt" | "rtf" | "pages" | "wpd" | "tex" | "epub" | "mobi" | "azw3" | "one" | "xps"
        | "oxps" => Category::Document,
        "xls" | "xlsx" | "xlsm" | "xlsb" | "ods" | "csv" | "tsv" | "numbers" => Category::Spreadsheet,
        "ppt" | "pptx" | "pptm" | "pps" | "ppsx" | "odp" | "key" => Category::Presentation,
        "pdf" => Category::Pdf,
        "txt" | "md" | "markdown" | "log" | "nfo" => Category::Text,
        "js" | "mjs" | "cjs" | "tsx" | "jsx" | "py" | "pyw" | "java" | "c" | "cc" | "cpp" | "h" | "hpp" | "cs" | "go"
        | "rs" | "rb" | "php" | "html" | "htm" | "css" | "scss" | "sass" | "less" | "json" | "xml" | "yml" | "yaml"
        | "toml" | "sh" | "bash" | "bat" | "cmd" | "ps1" | "psm1" | "sql" | "kt" | "kts" | "swift" | "lua" | "vue"
        | "svelte" | "dart" | "r" | "ipynb" | "gradle" | "cfg" | "conf" | "ini" => Category::Code,
        "zip" | "rar" | "7z" | "tar" | "gz" | "tgz" | "bz2" | "tbz2" | "xz" | "txz" | "zst" | "lz" | "lzma" | "cab"
        | "arj" | "z" => Category::Archive,
        "exe" | "msi" | "msix" | "msixbundle" | "appx" | "appxbundle" | "com" | "scr" | "jar" | "apk" => {
            Category::Executable
        }
        "iso" | "img" | "vhd" | "vhdx" | "vmdk" | "dmg" | "wim" | "esd" => Category::Diskimage,
        "ttf" | "otf" | "woff" | "woff2" | "fon" | "fnt" => Category::Font,
        "tmp" | "temp" | "bak" | "old" | "crdownload" | "part" | "partial" | "download" | "dmp" | "chk" | "gid" | "~" => {
            Category::Temporary
        }
        "dll" | "sys" | "drv" | "lnk" | "url" | "cat" | "inf" | "reg" | "msp" | "mui" | "ocx" | "cpl" | "efi" => {
            Category::System
        }
        _ => Category::Other,
    }
}

/// Extensão em minúsculas, sem o ponto ("" se não houver).
pub fn ext_of(name: &str) -> &str {
    match name.rfind('.') {
        Some(i) if i > 0 && i + 1 < name.len() => &name[i + 1..],
        _ => "",
    }
}

/// Converte um horário do sistema em milissegundos desde 1970 (0 se indisponível).
pub fn to_ms(t: io::Result<SystemTime>) -> i64 {
    match t {
        Ok(t) => match t.duration_since(UNIX_EPOCH) {
            Ok(d) => d.as_millis() as i64,
            Err(e) => -(e.duration().as_millis() as i64),
        },
        Err(_) => 0,
    }
}

pub fn now_ms() -> i64 {
    to_ms(Ok(SystemTime::now()))
}

/// Atributos (oculto, sistema, somente leitura).
#[cfg(windows)]
pub fn attributes(_name: &str, md: &Metadata) -> (bool, bool, bool) {
    use std::os::windows::fs::MetadataExt;
    let a = md.file_attributes();
    (a & 0x2 != 0, a & 0x4 != 0, a & 0x1 != 0)
}

#[cfg(not(windows))]
pub fn attributes(name: &str, md: &Metadata) -> (bool, bool, bool) {
    (name.starts_with('.'), false, md.permissions().readonly())
}

/// Entrada de arquivo/pasta enviada para a interface.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    /// Índice na varredura (somente em resultados do Organizador).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<u32>,
    pub name: String,
    pub path: String,
    pub parent: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: i64,
    pub created: i64,
    pub accessed: i64,
    pub ext: String,
    pub category: Category,
    pub hidden: bool,
    pub system: bool,
    pub readonly: bool,
    pub is_link: bool,
}

impl FileEntry {
    pub fn from_metadata(path: &Path, md: &Metadata, is_link: bool) -> FileEntry {
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| path.to_string_lossy().into_owned());
        let is_dir = md.is_dir();
        let ext = if is_dir { String::new() } else { ext_of(&name).to_ascii_lowercase() };
        let category = if is_dir { Category::Folder } else { category_from_ext(&ext) };
        let (hidden, system, readonly) = attributes(&name, md);
        FileEntry {
            id: None,
            parent: path.parent().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default(),
            path: path.to_string_lossy().into_owned(),
            name,
            is_dir,
            size: if is_dir { 0 } else { md.len() },
            modified: to_ms(md.modified()),
            created: to_ms(md.created()),
            accessed: to_ms(md.accessed()),
            ext,
            category,
            hidden,
            system,
            readonly,
            is_link,
        }
    }

    /// Lê os metadados de um caminho (sem seguir atalhos simbólicos).
    pub fn from_path(path: &Path) -> io::Result<FileEntry> {
        let lmd = std::fs::symlink_metadata(path)?;
        if lmd.file_type().is_symlink() {
            // Para links, mostra os dados do destino quando possível.
            let md = std::fs::metadata(path).unwrap_or(lmd);
            Ok(FileEntry::from_metadata(path, &md, true))
        } else {
            Ok(FileEntry::from_metadata(path, &lmd, false))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn categorias_por_extensao() {
        assert_eq!(category_from_ext("JPG"), Category::Image);
        assert_eq!(category_from_ext("mp4"), Category::Video);
        assert_eq!(category_from_ext("pdf"), Category::Pdf);
        assert_eq!(category_from_ext("xlsx"), Category::Spreadsheet);
        assert_eq!(category_from_ext("exe"), Category::Executable);
        assert_eq!(category_from_ext("crdownload"), Category::Temporary);
        assert_eq!(category_from_ext("desconhecida"), Category::Other);
    }

    #[test]
    fn extensao() {
        assert_eq!(ext_of("foto.final.PNG"), "PNG");
        assert_eq!(ext_of(".gitignore"), "");
        assert_eq!(ext_of("sem_extensao"), "");
        assert_eq!(ext_of("arquivo."), "");
    }

    #[test]
    fn serializa_categoria_em_minusculas() {
        assert_eq!(serde_json::to_string(&Category::Diskimage).unwrap(), "\"diskimage\"");
    }
}
