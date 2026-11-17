import { create } from 'zustand';
import { api, errorText } from '../lib/api';
import { dirname, samePath } from '../lib/format';
import { EMPTY_EXPLORER_FILTER, type ExplorerFilter } from '../lib/filters';
import { EMPTY_SEL, type SelState } from '../lib/selection';
import type { FileEntry, SortKey, SortSpec } from '../lib/types';
import { settings } from './settings';

/** Estado do Explorador (mantido ao trocar de página). "" = Este computador. */
interface ExplorerState {
  path: string;
  back: string[];
  forward: string[];
  entries: FileEntry[];
  loading: boolean;
  error: string | null;
  sort: SortSpec;
  filter: ExplorerFilter;
  sel: SelState;
  renaming: string | null;
  /** Incrementa quando a listagem é recarregada (para animações). */
  version: number;
  navigate: (path: string, opts?: { push?: boolean; select?: string[] }) => Promise<void>;
  reload: (opts?: { select?: string[]; rename?: string | null; quiet?: boolean }) => Promise<void>;
  goBack: () => void;
  goForward: () => void;
  goUp: () => void;
  setSort: (key: SortKey, desc?: boolean) => void;
  setFilter: (patch: Partial<ExplorerFilter>) => void;
  clearFilters: () => void;
  setSel: (sel: SelState) => void;
  setRenaming: (key: string | null) => void;
}

let loadSeq = 0;

export const useExplorer = create<ExplorerState>((set, get) => ({
  path: '',
  back: [],
  forward: [],
  entries: [],
  loading: false,
  error: null,
  sort: { key: 'name', desc: false },
  filter: EMPTY_EXPLORER_FILTER,
  sel: EMPTY_SEL,
  renaming: null,
  version: 0,

  navigate: async (path, opts = {}) => {
    const cur = get().path;
    const push = opts.push ?? true;
    if (push && !samePath(cur, path)) set({ back: [...get().back, cur].slice(-50), forward: [] });
    const seq = ++loadSeq;
    set({ path, loading: path !== '', error: null, renaming: null, filter: { ...get().filter, text: '' } });
    if (!samePath(cur, path)) set({ entries: [], sel: EMPTY_SEL });
    if (path) settings().set({ lastPath: path });
    if (!path) {
      set({ entries: [], loading: false, version: get().version + 1 });
      return;
    }
    try {
      const entries = await api.listDir(path, settings().showHidden);
      if (seq !== loadSeq) return;
      const select = opts.select ?? [];
      set({
        entries,
        loading: false,
        version: get().version + 1,
        sel: select.length ? { selected: new Set(select), anchor: select[0], focus: select[0] } : EMPTY_SEL,
      });
    } catch (e) {
      if (seq !== loadSeq) return;
      set({ entries: [], loading: false, error: errorText(e) });
    }
  },

  reload: async (opts = {}) => {
    const { path } = get();
    if (!path) return;
    const seq = ++loadSeq;
    if (!opts.quiet) set({ loading: true });
    try {
      const entries = await api.listDir(path, settings().showHidden);
      if (seq !== loadSeq) return;
      const existing = new Set(entries.map((e) => e.path));
      const prev = get().sel;
      const select = opts.select?.length ? opts.select : [...prev.selected].filter((k) => existing.has(k));
      set({
        entries,
        loading: false,
        error: null,
        version: get().version + 1,
        renaming: opts.rename ?? null,
        sel: {
          selected: new Set(select),
          anchor: opts.select?.[0] ?? (prev.anchor && existing.has(prev.anchor) ? prev.anchor : (select[0] ?? null)),
          focus: opts.select?.[0] ?? (prev.focus && existing.has(prev.focus) ? prev.focus : (select[0] ?? null)),
        },
      });
    } catch (e) {
      if (seq !== loadSeq) return;
      set({ loading: false, error: errorText(e) });
    }
  },

  goBack: () => {
    const { back, path, forward } = get();
    if (!back.length) return;
    const prev = back[back.length - 1];
    set({ back: back.slice(0, -1), forward: [path, ...forward] });
    void get().navigate(prev, { push: false, select: path && samePath(dirname(path), prev) ? [path] : undefined });
  },

  goForward: () => {
    const { forward, path, back } = get();
    if (!forward.length) return;
    const next = forward[0];
    set({ forward: forward.slice(1), back: [...back, path] });
    void get().navigate(next, { push: false });
  },

  goUp: () => {
    const { path } = get();
    if (!path) return;
    const parent = dirname(path);
    void get().navigate(parent && !samePath(parent, path) ? parent : '', { select: [path] });
  },

  setSort: (key, desc) => {
    const cur = get().sort;
    set({ sort: { key, desc: desc ?? (cur.key === key ? !cur.desc : key === 'modified' || key === 'size') } });
  },
  setFilter: (patch) => set({ filter: { ...get().filter, ...patch } }),
  clearFilters: () => set({ filter: { ...EMPTY_EXPLORER_FILTER, text: get().filter.text } }),
  setSel: (sel) => set({ sel }),
  setRenaming: (renaming) => set({ renaming }),
}));
