import { create } from 'zustand';
import { api, errorText, newTaskId } from '../lib/api';
import { categoriesOfFamily, type Family } from '../lib/categories';
import { SIZE_BUCKETS } from '../lib/filters';
import { EMPTY_SEL, type SelState } from '../lib/selection';
import { EMPTY_FILTER, type FileEntry, type FileFilter, type ScanStats, type SortSpec, type Summary } from '../lib/types';
import { useTasks } from './tasks';
import { toast } from './toasts';

export const ORG_SLOT = 'organizador';
const PAGE = 300;
const DAY = 86_400_000;

export interface OrgFilterUi {
  text: string;
  families: Family[];
  size: string;
  modified: string;
  unused: string;
  folder: string | null;
  folderName: string | null;
  ext: string | null;
}

export const EMPTY_UI: OrgFilterUi = { text: '', families: [], size: '', modified: '', unused: '', folder: null, folderName: null, ext: null };

export const MODIFIED_OPTIONS = [
  { id: '', label: 'Qualquer data' },
  { id: '7d', label: 'Últimos 7 dias' },
  { id: '30d', label: 'Últimos 30 dias' },
  { id: '12m', label: 'Últimos 12 meses' },
  { id: 'gt1y', label: 'Há mais de 1 ano' },
  { id: 'gt2y', label: 'Há mais de 2 anos' },
  { id: 'gt5y', label: 'Há mais de 5 anos' },
];

export const UNUSED_OPTIONS = [
  { id: '', label: 'Qualquer uso' },
  { id: '6m', label: 'Sem uso há 6 meses' },
  { id: '1y', label: 'Sem uso há 1 ano' },
  { id: '2y', label: 'Sem uso há 2 anos' },
  { id: '3y', label: 'Sem uso há 3 anos' },
];

export const SIZE_OPTIONS = [
  { id: '', label: 'Qualquer tamanho' },
  ...SIZE_BUCKETS.map((b) => ({ id: b.id, label: `${b.label} (${b.hint})` })),
  { id: 'gt100m', label: 'Maior que 100 MB' },
  { id: 'gt1g', label: 'Maior que 1 GB' },
];

/** Faixas de idade do resumo (iguais às do backend). */
export const AGE_RANGES: Record<string, [number, number | null]> = {
  recentes: [0, 30],
  meses: [30, 182],
  semestre: [182, 365],
  ano: [365, 730],
  anos: [730, 1825],
  antigos: [1825, null],
};

/** Converte os filtros da interface para o formato do backend. */
export function toBackendFilter(ui: OrgFilterUi, now = Date.now()): FileFilter {
  const f: FileFilter = { ...EMPTY_FILTER, text: ui.text.trim() };
  if (ui.families.length) f.categories = ui.families.flatMap(categoriesOfFamily);
  const bucket = SIZE_BUCKETS.find((b) => b.id === ui.size);
  if (bucket) {
    f.sizeMin = bucket.min;
    f.sizeMax = bucket.max >= Number.MAX_SAFE_INTEGER ? null : bucket.max;
  } else if (ui.size === 'gt100m') f.sizeMin = 100 * 1024 * 1024;
  else if (ui.size === 'gt1g') f.sizeMin = 1024 * 1024 * 1024;
  const m = ui.modified;
  if (m === '7d') f.modifiedAfter = now - 7 * DAY;
  else if (m === '30d') f.modifiedAfter = now - 30 * DAY;
  else if (m === '12m') f.modifiedAfter = now - 365 * DAY;
  else if (m === 'gt1y') f.modifiedBefore = now - 365 * DAY;
  else if (m === 'gt2y') f.modifiedBefore = now - 730 * DAY;
  else if (m === 'gt5y') f.modifiedBefore = now - 1825 * DAY;
  else if (m.startsWith('age:')) {
    const r = AGE_RANGES[m.slice(4)];
    if (r) {
      f.modifiedBefore = now - r[0] * DAY + 1;
      if (r[1] !== null) f.modifiedAfter = now - r[1] * DAY;
    }
  }
  const u = { '6m': 182, '1y': 365, '2y': 730, '3y': 1095 }[ui.unused];
  if (u) f.unusedBefore = now - u * DAY;
  if (ui.folder) f.folder = ui.folder;
  if (ui.ext !== null) f.extensions = [ui.ext];
  return f;
}

interface OrganizerState {
  roots: string[];
  includeHidden: boolean;
  skipSystem: boolean;
  stats: ScanStats | null;
  scanning: boolean;
  taskId: string | null;
  ui: OrgFilterUi;
  sort: SortSpec;
  ids: number[];
  totalSize: number;
  summary: Summary | null;
  loadingQuery: boolean;
  queryError: string | null;
  sel: SelState;
  /** Muda a cada nova consulta (descarta páginas antigas). */
  queryVersion: number;
  pagesVersion: number;

  setRoots: (roots: string[]) => void;
  addRoots: (roots: string[]) => void;
  removeRoot: (root: string) => void;
  setOptions: (o: Partial<Pick<OrganizerState, 'includeHidden' | 'skipSystem'>>) => void;
  scan: () => Promise<void>;
  cancelScan: () => void;
  setUi: (patch: Partial<OrgFilterUi>) => void;
  resetUi: () => void;
  setSort: (key: SortSpec['key']) => void;
  refreshQuery: () => Promise<void>;
  ensureRange: (start: number, end: number) => void;
  getRow: (i: number) => FileEntry | undefined;
  setSel: (s: SelState) => void;
  removeIds: (ids: number[]) => Promise<void>;
}

// Páginas carregadas ficam fora do estado reativo (podem ser muitas).
let pages = new Map<number, FileEntry[]>();
const inflight = new Set<number>();
let querySeq = 0;

export const useOrganizer = create<OrganizerState>((set, get) => ({
  roots: [],
  includeHidden: false,
  skipSystem: true,
  stats: null,
  scanning: false,
  taskId: null,
  ui: EMPTY_UI,
  sort: { key: 'size', desc: true },
  ids: [],
  totalSize: 0,
  summary: null,
  loadingQuery: false,
  queryError: null,
  sel: EMPTY_SEL,
  queryVersion: 0,
  pagesVersion: 0,

  setRoots: (roots) => set({ roots: [...new Set(roots)] }),
  addRoots: (roots) => set({ roots: [...new Set([...get().roots, ...roots])] }),
  removeRoot: (root) => set({ roots: get().roots.filter((r) => r !== root) }),
  setOptions: (o) => set(o),

  scan: async () => {
    const { roots, includeHidden, skipSystem } = get();
    if (!roots.length || get().scanning) return;
    const taskId = newTaskId();
    set({ scanning: true, taskId, sel: EMPTY_SEL });
    useTasks.getState().start({ id: taskId, title: 'Destrinchando pastas', icon: 'layers', cancellable: true });
    try {
      const stats = await api.scanStart(taskId, ORG_SLOT, roots, { includeHidden, skipSystem });
      set({ stats });
      if (stats.cancelled) toast.warning('Análise interrompida', 'Os resultados mostram apenas o que foi lido até o cancelamento.');
      await get().refreshQuery();
    } catch (e) {
      toast.error('Não foi possível analisar as pastas', errorText(e));
    } finally {
      useTasks.getState().finish(taskId);
      set({ scanning: false, taskId: null });
    }
  },

  cancelScan: () => {
    const id = get().taskId;
    if (id) useTasks.getState().cancel(id);
  },

  setUi: (patch) => {
    set({ ui: { ...get().ui, ...patch }, sel: EMPTY_SEL });
    void get().refreshQuery();
  },
  resetUi: () => {
    set({ ui: EMPTY_UI, sel: EMPTY_SEL });
    void get().refreshQuery();
  },
  setSort: (key) => {
    const cur = get().sort;
    set({ sort: { key, desc: cur.key === key ? !cur.desc : key === 'size' || key === 'modified' || key === 'used' } });
    void get().refreshQuery();
  },

  refreshQuery: async () => {
    if (!get().stats) return;
    const seq = ++querySeq;
    set({ loadingQuery: true, queryError: null });
    const filter = toBackendFilter(get().ui);
    const sort = get().sort;
    try {
      const [ids, summary] = await Promise.all([api.scanIds(ORG_SLOT, filter, sort), api.scanSummary(ORG_SLOT, filter, sort)]);
      if (seq !== querySeq) return;
      pages = new Map();
      inflight.clear();
      set({ ids, summary, totalSize: summary.size, loadingQuery: false, queryVersion: get().queryVersion + 1, pagesVersion: 0 });
      get().ensureRange(0, 60);
    } catch (e) {
      if (seq !== querySeq) return;
      set({ loadingQuery: false, queryError: errorText(e) });
    }
  },

  ensureRange: (start, end) => {
    const version = get().queryVersion;
    const filter = toBackendFilter(get().ui);
    const sort = get().sort;
    const total = get().ids.length;
    for (let p = Math.floor(start / PAGE); p <= Math.floor(Math.min(end, total - 1) / PAGE); p++) {
      if (pages.has(p) || inflight.has(p)) continue;
      inflight.add(p);
      void api
        .scanQuery(ORG_SLOT, filter, sort, p * PAGE, PAGE)
        .then((res) => {
          if (version !== get().queryVersion) return;
          pages.set(p, res.items);
          set({ pagesVersion: get().pagesVersion + 1 });
        })
        .catch(() => {})
        .finally(() => inflight.delete(p));
    }
  },

  getRow: (i) => pages.get(Math.floor(i / PAGE))?.[i % PAGE],
  setSel: (sel) => set({ sel }),

  removeIds: async (ids) => {
    if (!ids.length) return;
    try {
      const stats = await api.scanRemove(ORG_SLOT, ids);
      set({ stats, sel: EMPTY_SEL });
      await get().refreshQuery();
    } catch {
      /* ignora */
    }
  },
}));

/** Entradas já carregadas para um conjunto de ids (para somar tamanhos etc.). */
export function loadedEntries(ids: Set<string>): FileEntry[] {
  const out: FileEntry[] = [];
  for (const list of pages.values()) for (const e of list) if (ids.has(String(e.id))) out.push(e);
  return out;
}
