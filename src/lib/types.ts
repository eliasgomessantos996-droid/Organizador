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

/* ───────────── Saúde e sistema ───────────── */

export interface CpuInfo {
  usage: number;
  brand: string;
  cores: number;
  physicalCores: number | null;
  frequencyMhz: number;
  perCore: number[];
}

export interface MemoryInfo {
  total: number;
  used: number;
  available: number;
  swapTotal: number;
  swapUsed: number;
}

export interface SystemInfo {
  os: string;
  osVersion: string;
  hostName: string;
  arch: string;
  uptimeSecs: number;
  bootTime: number;
  processCount: number;
  elevated: boolean;
}

export interface HealthSnapshot {
  cpu: CpuInfo;
  memory: MemoryInfo;
  disks: DriveInfo[];
  system: SystemInfo;
  takenAt: number;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  cpu: number;
  memory: number;
  exe: string | null;
  protected: boolean;
}

export interface JunkInfo {
  recycleBytes: number;
  recycleItems: number;
  tempBytes: number;
  tempFiles: number;
}

export interface BatteryInfo {
  percent: number;
  charging: boolean;
  plugged: boolean;
  health: number | null;
  cycles: number | null;
  vendor: string | null;
  model: string | null;
  minutesLeft: number | null;
}

export interface TrimReport {
  processes: number;
  freedBytes: number;
  beforeAvailable: number;
  afterAvailable: number;
}

export interface StartupItem {
  id: string;
  name: string;
  command: string;
  path: string | null;
  location: string;
  scope: 'user' | 'machine';
  enabled: boolean;
  needsAdmin: boolean;
  publisher: string | null;
  description: string | null;
  exists: boolean;
}

export interface InstalledProgram {
  id: string;
  name: string;
  publisher: string | null;
  version: string | null;
  installDate: string | null;
  size: number | null;
  location: string | null;
  canUninstall: boolean;
  scope: 'user' | 'machine';
}

export interface RecycleInfo {
  bytes: number;
  items: number;
}

/* ───────────── Limpeza ───────────── */

export interface CleanOptions {
  tempMinAgeHours: number;
  oldDownloadsDays: number;
  oldInstallersDays: number;
}

export type CleanGroup = 'sistema' | 'navegadores' | 'aplicativos' | 'arquivos';

export interface TargetInfo {
  id: string;
  name: string;
  description: string;
  group: CleanGroup;
  icon: string;
  risk: 'seguro' | 'moderado';
  needsAdmin: boolean;
  toTrash: boolean;
  available: boolean;
}

export interface CleanItem {
  path: string;
  size: number;
  modified: number;
  isDir: boolean;
}

export interface TargetReport {
  id: string;
  files: number;
  bytes: number;
  denied: number;
  sample: CleanItem[];
}

export interface TargetResult {
  id: string;
  name: string;
  freed: number;
  deleted: number;
  failed: number;
  error: string | null;
}

export interface CleanReport {
  freed: number;
  deleted: number;
  failed: number;
  targets: TargetResult[];
  cancelled: boolean;
}

/* ───────────── Duplicados, Mapa e Regras ───────────── */

export interface DupOptions {
  minSize: number;
  categories: Category[];
  includeHidden: boolean;
}

export interface DupGroup {
  id: number;
  size: number;
  hash: string;
  files: FileEntry[];
}

export interface DupResult {
  groups: DupGroup[];
  wasted: number;
  duplicateFiles: number;
  scannedFiles: number;
  hashedBytes: number;
  elapsedMs: number;
  cancelled: boolean;
}

export interface MapNode {
  id: string;
  name: string;
  path: string;
  size: number;
  files: number;
  isDir: boolean;
  category: Category | null;
  children: MapNode[];
}

export interface RuleConditions {
  categories: Category[];
  extensions: string[];
  nameContains: string;
  olderThanDays: number | null;
  minSize: number | null;
  maxSize: number | null;
}

export type RuleAction = { type: 'move'; dest: string } | { type: 'copy'; dest: string } | { type: 'trash' };

export interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  source: string;
  recursive: boolean;
  conditions: RuleConditions;
  action: RuleAction;
}

export interface PlannedAction {
  ruleId: string;
  ruleName: string;
  from: string;
  to: string | null;
  action: 'move' | 'copy' | 'trash';
  size: number;
}

export interface ApplyResult {
  moved: DoneItem[];
  copied: DoneItem[];
  trashed: string[];
  failed: FailedItem[];
  bytes: number;
}
