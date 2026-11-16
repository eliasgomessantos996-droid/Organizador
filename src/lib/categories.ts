/**
 * Categorias de arquivo e famílias usadas nos gráficos.
 *
 * As famílias ocupam os 7 matizes categóricos em ordem fixa (a cor segue a
 * entidade, nunca a posição) e "Outros" fica em cinza.
 */

export type Category =
  | 'folder'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'spreadsheet'
  | 'presentation'
  | 'pdf'
  | 'text'
  | 'code'
  | 'archive'
  | 'executable'
  | 'diskimage'
  | 'font'
  | 'temporary'
  | 'system'
  | 'other';

export type Family = 'documentos' | 'imagens' | 'videos' | 'audio' | 'compactados' | 'programas' | 'codigo' | 'outros';

export interface FamilyInfo {
  id: Family;
  label: string;
  /** Variável CSS da cor (paleta validada). */
  color: string;
}

/** Ordem fixa = ordem dos slots da paleta. */
export const FAMILIES: FamilyInfo[] = [
  { id: 'documentos', label: 'Documentos', color: 'var(--series-1)' },
  { id: 'imagens', label: 'Imagens', color: 'var(--series-2)' },
  { id: 'videos', label: 'Vídeos', color: 'var(--series-3)' },
  { id: 'audio', label: 'Áudio', color: 'var(--series-4)' },
  { id: 'compactados', label: 'Compactados', color: 'var(--series-5)' },
  { id: 'programas', label: 'Programas', color: 'var(--series-6)' },
  { id: 'codigo', label: 'Código', color: 'var(--series-7)' },
  { id: 'outros', label: 'Outros', color: 'var(--series-other)' },
];

export const FAMILY_BY_ID: Record<Family, FamilyInfo> = Object.fromEntries(FAMILIES.map((f) => [f.id, f])) as Record<
  Family,
  FamilyInfo
>;

export interface CategoryInfo {
  id: Category;
  label: string;
  plural: string;
  family: Family | null;
  /** Nome da pasta usado pelas regras de organização ({categoria}). */
  folder: string;
}

export const CATEGORIES: CategoryInfo[] = [
  { id: 'folder', label: 'Pasta', plural: 'Pastas', family: null, folder: 'Pastas' },
  { id: 'image', label: 'Imagem', plural: 'Imagens', family: 'imagens', folder: 'Imagens' },
  { id: 'video', label: 'Vídeo', plural: 'Vídeos', family: 'videos', folder: 'Vídeos' },
  { id: 'audio', label: 'Áudio', plural: 'Áudios', family: 'audio', folder: 'Músicas' },
  { id: 'document', label: 'Documento', plural: 'Documentos', family: 'documentos', folder: 'Documentos' },
  { id: 'spreadsheet', label: 'Planilha', plural: 'Planilhas', family: 'documentos', folder: 'Planilhas' },
  { id: 'presentation', label: 'Apresentação', plural: 'Apresentações', family: 'documentos', folder: 'Apresentações' },
  { id: 'pdf', label: 'PDF', plural: 'PDFs', family: 'documentos', folder: 'PDFs' },
  { id: 'text', label: 'Texto', plural: 'Textos', family: 'documentos', folder: 'Textos' },
  { id: 'code', label: 'Código', plural: 'Códigos', family: 'codigo', folder: 'Códigos' },
  { id: 'archive', label: 'Compactado', plural: 'Compactados', family: 'compactados', folder: 'Compactados' },
  { id: 'executable', label: 'Programa', plural: 'Programas', family: 'programas', folder: 'Instaladores' },
  { id: 'diskimage', label: 'Imagem de disco', plural: 'Imagens de disco', family: 'compactados', folder: 'Imagens de disco' },
  { id: 'font', label: 'Fonte', plural: 'Fontes', family: 'outros', folder: 'Fontes' },
  { id: 'temporary', label: 'Temporário', plural: 'Temporários', family: 'outros', folder: 'Temporários' },
  { id: 'system', label: 'Sistema', plural: 'Arquivos de sistema', family: 'outros', folder: 'Sistema' },
  { id: 'other', label: 'Outro', plural: 'Outros', family: 'outros', folder: 'Outros' },
];

export const CATEGORY_BY_ID: Record<Category, CategoryInfo> = Object.fromEntries(CATEGORIES.map((c) => [c.id, c])) as Record<
  Category,
  CategoryInfo
>;

/** Categorias que o usuário pode filtrar (sem "pasta"). */
export const FILE_CATEGORIES = CATEGORIES.filter((c) => c.id !== 'folder');

export function familyOf(category: Category): Family {
  return CATEGORY_BY_ID[category]?.family ?? 'outros';
}

export function familyColor(category: Category): string {
  return FAMILY_BY_ID[familyOf(category)].color;
}

/** Categorias pertencentes a uma família (para filtros "Documentos" etc.). */
export function categoriesOfFamily(family: Family): Category[] {
  return CATEGORIES.filter((c) => c.family === family).map((c) => c.id);
}

const EXT: Record<string, Category> = {};
const add = (cat: Category, list: string) => list.split(' ').forEach((e) => (EXT[e] = cat));
add('image', 'jpg jpeg png gif bmp webp tif tiff heic heif svg ico raw cr2 cr3 nef arw dng orf rw2 psd ai avif jfif jxl eps');
add('video', 'mp4 mkv avi mov wmv flv webm m4v mpg mpeg 3gp ts mts m2ts vob ogv');
add('audio', 'mp3 wav flac aac ogg oga wma m4a opus aiff aif mid midi amr ape');
add('document', 'doc docx docm odt rtf pages wpd tex epub mobi azw3 one xps oxps');
add('spreadsheet', 'xls xlsx xlsm xlsb ods csv tsv numbers');
add('presentation', 'ppt pptx pptm pps ppsx odp key');
add('pdf', 'pdf');
add('text', 'txt md markdown log nfo');
add('code', 'js mjs cjs ts tsx jsx py pyw java c cc cpp h hpp cs go rs rb php html htm css scss sass less json xml yml yaml toml sh bash bat cmd ps1 psm1 sql kt kts swift lua vue svelte dart r ipynb gradle cfg conf ini');
add('archive', 'zip rar 7z tar gz tgz bz2 tbz2 xz txz zst lz lzma cab arj z');
add('executable', 'exe msi msix msixbundle appx appxbundle com scr jar apk');
add('diskimage', 'iso img vhd vhdx vmdk dmg wim esd');
add('font', 'ttf otf woff woff2 fon fnt');
add('temporary', 'tmp temp bak old crdownload part partial download dmp chk gid ~');
add('system', 'dll sys drv lnk url cat inf reg msp mui ocx cpl efi');

/** Categoria a partir da extensão (espelha a lógica do backend em Rust). */
export function categoryFromExt(ext: string, isDir = false): Category {
  if (isDir) return 'folder';
  return EXT[ext.toLowerCase()] ?? 'other';
}

export function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  if (i <= 0 || i === name.length - 1) return '';
  return name.slice(i + 1).toLowerCase();
}

/** Descrição do tipo, no estilo da coluna "Tipo" do Explorer. */
export function typeLabel(category: Category, ext: string): string {
  const E = ext.toUpperCase();
  switch (category) {
    case 'folder':
      return 'Pasta de arquivos';
    case 'image':
      return E ? `Imagem ${E}` : 'Imagem';
    case 'video':
      return E ? `Vídeo ${E}` : 'Vídeo';
    case 'audio':
      return E ? `Áudio ${E}` : 'Áudio';
    case 'document':
      return E ? `Documento ${E}` : 'Documento';
    case 'spreadsheet':
      return ext === 'csv' ? 'Valores separados por vírgula' : `Planilha ${E}`;
    case 'presentation':
      return `Apresentação ${E}`;
    case 'pdf':
      return 'Documento PDF';
    case 'text':
      return ext === 'txt' ? 'Documento de texto' : ext === 'log' ? 'Arquivo de log' : `Texto ${E}`;
    case 'code':
      return `Código ${E}`;
    case 'archive':
      return `Arquivo compactado ${E}`;
    case 'executable':
      if (ext === 'exe') return 'Aplicativo';
      if (ext === 'msi') return 'Pacote do Windows Installer';
      return `Instalador ${E}`;
    case 'diskimage':
      return `Imagem de disco ${E}`;
    case 'font':
      return `Fonte ${E}`;
    case 'temporary':
      return E ? `Arquivo temporário ${E}` : 'Arquivo temporário';
    case 'system':
      if (ext === 'lnk') return 'Atalho';
      if (ext === 'url') return 'Atalho da Internet';
      return `Arquivo de sistema ${E}`;
    default:
      return E ? `Arquivo ${E}` : 'Arquivo';
  }
}
