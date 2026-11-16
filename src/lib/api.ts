import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { isTauri } from './platform';
import type {
  AppInfo,
  ApplyResult,
  DupOptions,
  DupResult,
  MapNode,
  PlannedAction,
  Rule,
  CleanItem,
  CleanOptions,
  CleanReport,
  TargetInfo,
  TargetReport,
  BatteryInfo,
  HealthSnapshot,
  InstalledProgram,
  JunkInfo,
  ProcessInfo,
  RecycleInfo,
  StartupItem,
  TrimReport,
  ClipboardFiles,
  Conflict,
  DeleteReport,
  DriveInfo,
  FileEntry,
  FileFilter,
  OpReport,
  ProgressEvent,
  QueryPage,
  ScanOptions,
  ScanStats,
  SizeInfo,
  SortSpec,
  SpecialFolders,
  Summary,
  TrashActionReport,
  TrashEntry,
} from './types';

type Handler = (cmd: string, args: Record<string, unknown>) => Promise<unknown>;
let mock: { handle: Handler; setEmitter: (fn: (e: ProgressEvent) => void) => void } | null = null;

async function loadMock() {
  if (!mock) {
    mock = await import('./mock');
    await import('./mockSystem');
    await import('./mockCleanup');
    await import('./mockTools');
  }
  return mock;
}

/** Chama um comando do backend (Tauri) ou do backend simulado (navegador). */
export async function call<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  if (isTauri) return invoke<T>(cmd, args);
  return (await loadMock()).handle(cmd, args) as Promise<T>;
}

/* ───────────── Progresso das tarefas ───────────── */
const listeners = new Set<(e: ProgressEvent) => void>();
let listening = false;

async function startListening() {
  if (listening) return;
  listening = true;
  const dispatch = (e: ProgressEvent) => listeners.forEach((l) => l(e));
  if (isTauri) {
    const { listen } = await import('@tauri-apps/api/event');
    await listen<ProgressEvent>('task-progress', (e) => dispatch(e.payload));
  } else {
    (await loadMock()).setEmitter(dispatch);
  }
}

export function onProgress(fn: (e: ProgressEvent) => void): () => void {
  listeners.add(fn);
  void startListening();
  return () => listeners.delete(fn);
}

export const newTaskId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `t-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** URL para mostrar um arquivo local (miniaturas de imagens). */
export function fileUrl(path: string): string | null {
  return isTauri ? convertFileSrc(path) : null;
}

export const api = {
  appInfo: () => call<AppInfo>('app_info'),
  specialFolders: () => call<SpecialFolders>('special_folders'),
  listDrives: () => call<DriveInfo[]>('list_drives'),
  listDir: (path: string, showHidden: boolean) => call<FileEntry[]>('list_dir', { path, showHidden }),
  statPath: (path: string) => call<FileEntry>('stat_path', { path }),
  pathExists: (path: string) => call<boolean>('path_exists', { path }),
  isDir: (path: string) => call<boolean>('is_dir', { path }),
  folderSize: (taskId: string, path: string) => call<SizeInfo>('folder_size', { taskId, path }),
  readTextPreview: (path: string) => call<string>('read_text_preview', { path }),
  openPath: (path: string) => call<void>('open_path', { path }),
  revealPath: (path: string) => call<void>('reveal_path', { path }),
  checkConflicts: (sources: string[], dest: string) => call<string[]>('check_conflicts', { sources, dest }),
  copyItems: (taskId: string, sources: string[], dest: string, conflict: Conflict) =>
    call<OpReport>('copy_items', { taskId, sources, dest, conflict }),
  moveItems: (taskId: string, sources: string[], dest: string, conflict: Conflict) =>
    call<OpReport>('move_items', { taskId, sources, dest, conflict }),
  deleteItems: (taskId: string, paths: string[], permanent: boolean) => call<DeleteReport>('delete_items', { taskId, paths, permanent }),
  renameItem: (path: string, newName: string) => call<string>('rename_item', { path, newName }),
  createFolder: (parent: string, name?: string) => call<string>('create_folder', { parent, name: name ?? null }),
  createTextFile: (parent: string, name?: string) => call<string>('create_text_file', { parent, name: name ?? null }),
  clipboardWrite: (paths: string[], cut: boolean) => call<void>('clipboard_write', { paths, cut }),
  clipboardRead: () => call<ClipboardFiles | null>('clipboard_read'),
  clipboardClear: () => call<void>('clipboard_clear'),
  setProtectedPaths: (paths: string[]) => call<void>('set_protected_paths', { paths }),
  checkProtected: (path: string) => call<string | null>('check_protected', { path }),
  cancelTask: (taskId: string) => call<boolean>('cancel_task', { taskId }),
  saveTextFile: (path: string, contents: string) => call<void>('save_text_file', { path, contents }),
  readTextFile: (path: string) => call<string>('read_text_file', { path }),

  scanStart: (taskId: string, slot: string, roots: string[], options: ScanOptions) =>
    call<ScanStats>('scan_start', { taskId, slot, roots, options }),
  scanQuery: (slot: string, filter: FileFilter, sort: SortSpec, offset: number, limit: number) =>
    call<QueryPage>('scan_query', { slot, filter, sort, offset, limit }),
  scanSummary: (slot: string, filter: FileFilter, sort: SortSpec) => call<Summary>('scan_summary', { slot, filter, sort }),
  scanIds: (slot: string, filter: FileFilter, sort: SortSpec) => call<number[]>('scan_ids', { slot, filter, sort }),
  scanPaths: (slot: string, ids: number[]) => call<string[]>('scan_paths', { slot, ids }),
  scanRemove: (slot: string, ids: number[]) => call<ScanStats>('scan_remove', { slot, ids }),
  scanStats: (slot: string) => call<ScanStats | null>('scan_stats', { slot }),
  scanDispose: (slot: string) => call<void>('scan_dispose', { slot }),

  trashList: (withSizes: boolean) => call<TrashEntry[]>('trash_list', { withSizes }),
  trashRestore: (ids: string[]) => call<TrashActionReport>('trash_restore', { ids }),
  trashPurge: (ids: string[]) => call<TrashActionReport>('trash_purge', { ids }),
  trashRestorePaths: (paths: string[], since: number) => call<TrashActionReport>('trash_restore_paths', { paths, since }),
  undoMoves: (pairs: [string, string][]) => call<OpReport>('undo_moves', { pairs }),

  healthSnapshot: () => call<HealthSnapshot>('health_snapshot'),
  topProcesses: (limit: number) => call<ProcessInfo[]>('top_processes', { limit }),
  killProcess: (pid: number) => call<void>('kill_process', { pid }),
  trimMemory: () => call<TrimReport>('trim_memory'),
  junkEstimate: (force: boolean) => call<JunkInfo>('junk_estimate', { force }),
  batteryInfo: () => call<BatteryInfo | null>('battery_info'),
  startupList: () => call<StartupItem[]>('startup_list'),
  startupSetEnabled: (id: string, enabled: boolean) => call<void>('startup_set_enabled', { id, enabled }),
  programsList: () => call<InstalledProgram[]>('programs_list'),
  programUninstall: (id: string) => call<void>('program_uninstall', { id }),
  launchTool: (id: string) => call<void>('launch_tool', { id }),
  isElevated: () => call<boolean>('is_elevated'),
  relaunchAdmin: () => call<void>('relaunch_admin'),
  selfAutostartGet: () => call<boolean>('self_autostart_get'),
  selfAutostartSet: (enabled: boolean) => call<void>('self_autostart_set', { enabled }),
  recycleInfo: () => call<RecycleInfo>('recycle_info'),
  emptyRecycleBin: () => call<RecycleInfo>('empty_recycle_bin'),

  cleanupTargets: (options: CleanOptions) => call<TargetInfo[]>('cleanup_targets', { options }),
  cleanupAnalyze: (taskId: string, ids: string[], options: CleanOptions) => call<TargetReport[]>('cleanup_analyze', { taskId, ids, options }),
  cleanupItems: (id: string, limit: number) => call<CleanItem[]>('cleanup_items', { id, limit }),
  cleanupExclude: (id: string, paths: string[]) => call<void>('cleanup_exclude', { id, paths }),
  cleanupRun: (taskId: string, ids: string[], options: CleanOptions) => call<CleanReport>('cleanup_run', { taskId, ids, options }),

  dupFind: (taskId: string, roots: string[], options: DupOptions) => call<DupResult>('dup_find', { taskId, roots, options }),
  mapNode: (path: string | null, depth: number, maxChildren: number) => call<MapNode>('map_node', { path, depth, maxChildren }),
  scanRemoveDir: (slot: string, path: string) => call<ScanStats>('scan_remove_dir', { slot, path }),
  rulesPreview: (rules: Rule[]) => call<PlannedAction[]>('rules_preview', { rules }),
  rulesApply: (taskId: string, plan: PlannedAction[]) => call<ApplyResult>('rules_apply', { taskId, plan }),
};

/** Mensagem legível de um erro vindo do backend. */
export function errorText(e: unknown): string {
  if (typeof e === 'string') return e;
  if (e instanceof Error) return e.message;
  return 'Ocorreu um erro inesperado.';
}
