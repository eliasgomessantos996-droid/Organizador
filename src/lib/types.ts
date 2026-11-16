import type { Category } from './categories';

/** Tipos espelhados do backend em Rust (serde camelCase). */

export interface FileEntry {
  id?: number;
  name: string;
  path: string;
  parent: string;
  isDir: boolean;
  size: number;
  modified: number;
  created: number;
  accessed: number;
  ext: string;
  category: Category;
  hidden: boolean;
  system: boolean;
  readonly: boolean;
  isLink: boolean;
}

export interface DriveInfo {
  mount: string;
  label: string;
  fileSystem: string;
  total: number;
  free: number;
  removable: boolean;
  kind: 'ssd' | 'hdd' | 'desconhecido';
  isSystem: boolean;
}

export interface SpecialFolders {
  home?: string | null;
  desktop?: string | null;
  documents?: string | null;
  downloads?: string | null;
  pictures?: string | null;
  music?: string | null;
  videos?: string | null;
  temp: string;
}

export interface AppInfo {
  version: string;
  platform: string;
  os: string;
}

export type Conflict = 'rename' | 'overwrite' | 'skip';

export interface DoneItem {
  from: string;
  to: string;
}

export interface FailedItem {
  path: string;
  error: string;
}

export interface OpReport {
  done: DoneItem[];
  failed: FailedItem[];
  skipped: string[];
  bytes: number;
  cancelled: boolean;
}

export interface DeleteReport {
  deleted: string[];
  failed: FailedItem[];
  bytes: number;
  cancelled: boolean;
}

export interface SizeInfo {
  size: number;
  files: number;
  dirs: number;
}

export interface ClipboardFiles {
  paths: string[];
  cut: boolean;
}

export interface ProgressEvent {
  taskId: string;
  phase: string;
  done: number;
  total: number;
  bytesDone: number;
  bytesTotal: number;
  current: string;
}

export interface ScanOptions {
  includeHidden?: boolean;
  skipSystem?: boolean;
  exclude?: string[];
}

export interface ScanStats {
  roots: string[];
  files: number;
  dirs: number;
  bytes: number;
  errors: number;
  elapsedMs: number;
  cancelled: boolean;
}

export type SortKey = 'name' | 'modified' | 'size' | 'type' | 'folder' | 'created' | 'accessed' | 'used';

export interface SortSpec {
  key: SortKey;
  desc: boolean;
}

/** Filtro aceito pelo backend (campos opcionais usam null). */
export interface FileFilter {
  text: string;
  categories: Category[];
  extensions: string[];
  sizeMin: number | null;
  sizeMax: number | null;
  modifiedAfter: number | null;
  modifiedBefore: number | null;
  unusedBefore: number | null;
  folder: string | null;
  hideHidden: boolean;
}

export const EMPTY_FILTER: FileFilter = {
  text: '',
  categories: [],
  extensions: [],
  sizeMin: null,
  sizeMax: null,
  modifiedAfter: null,
  modifiedBefore: null,
  unusedBefore: null,
  folder: null,
  hideHidden: false,
};

export interface QueryPage {
  total: number;
  totalSize: number;
  offset: number;
  items: FileEntry[];
}

export interface CategoryStat {
  category: Category;
  count: number;
  size: number;
}

export interface AgeStat {
  id: string;
  label: string;
  fromDays: number;
  toDays: number | null;
  count: number;
  size: number;
}

export interface FolderStat {
  path: string;
  name: string;
  count: number;
  size: number;
}

export interface ExtStat {
  ext: string;
  count: number;
  size: number;
}

export interface Summary {
  count: number;
  size: number;
  categories: CategoryStat[];
  ages: AgeStat[];
  folders: FolderStat[];
  extensions: ExtStat[];
  largest: FileEntry[];
}

export interface TrashEntry {
  id: string;
  name: string;
  originalPath: string;
  originalParent: string;
  deletedAt: number;
  size: number | null;
  isDir: boolean;
  category: Category;
}

export interface TrashActionReport {
  done: number;
  failed: string[];
}
