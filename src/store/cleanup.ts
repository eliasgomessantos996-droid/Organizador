import { create } from 'zustand';
import { api } from '../lib/api';
import { analyzeTargets, cleanOptions, PROFILE_TARGETS, runCleanup } from '../lib/cleanup';
import type { CleanReport, TargetInfo, TargetReport } from '../lib/types';

/** Estado da tela de Limpeza (mantido ao trocar de página). */
interface CleanupState {
  targets: TargetInfo[];
  reports: Record<string, TargetReport>;
  selected: Set<string>;
  analyzing: boolean;
  cleaning: boolean;
  analyzedAt: number;
  lastReport: CleanReport | null;
  load: () => Promise<void>;
  analyze: () => Promise<void>;
  toggle: (id: string) => void;
  setSelected: (ids: string[]) => void;
  clean: () => Promise<CleanReport | null>;
}

export const useCleanup = create<CleanupState>((set, get) => ({
  targets: [],
  reports: {},
  selected: new Set(PROFILE_TARGETS.equilibrado),
  analyzing: false,
  cleaning: false,
  analyzedAt: 0,
  lastReport: null,

  load: async () => {
    if (get().targets.length) return;
    const targets = await api.cleanupTargets(cleanOptions()).catch(() => []);
    set({ targets });
  },

  analyze: async () => {
    if (get().analyzing) return;
    await get().load();
    const ids = get()
      .targets.filter((t) => t.available)
      .map((t) => t.id);
    set({ analyzing: true });
    try {
      const list = await analyzeTargets(ids);
      set({ reports: Object.fromEntries(list.map((r) => [r.id, r])), analyzedAt: Date.now() });
    } finally {
      set({ analyzing: false });
    }
  },

  toggle: (id) => {
    const s = new Set(get().selected);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    set({ selected: s });
  },

  setSelected: (ids) => set({ selected: new Set(ids) }),

  clean: async () => {
    const ids = [...get().selected].filter((id) => (get().reports[id]?.files ?? 0) > 0 || id === 'lixeira');
    if (!ids.length) return null;
    set({ cleaning: true });
    try {
      const report = await runCleanup(ids, 'limpeza');
      set({ lastReport: report });
      await get().analyze();
      return report;
    } finally {
      set({ cleaning: false });
    }
  },
}));
