import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Histórico de limpezas (quanto espaço foi liberado e quando). */
export type CleanSource = 'oneclick' | 'limpeza' | 'auto' | 'lixeira' | 'duplicados' | 'esquecidos';

export interface CleanRecord {
  id: number;
  at: number;
  source: CleanSource;
  freed: number;
  items: number;
  targets: { id: string; name: string; freed: number }[];
}

export const SOURCE_LABEL: Record<CleanSource, string> = {
  oneclick: 'One Click Optimize',
  limpeza: 'Limpeza manual',
  auto: 'Limpeza automática',
  lixeira: 'Lixeira',
  duplicados: 'Duplicados',
  esquecidos: 'Arquivos esquecidos',
};

interface HistoryState {
  records: CleanRecord[];
  add: (r: Omit<CleanRecord, 'id' | 'at'>) => void;
  clear: () => void;
}

export const useHistory = create<HistoryState>()(
  persist(
    (set, get) => ({
      records: [],
      add: (r) => {
        if (r.freed <= 0 && r.items <= 0) return;
        set({ records: [{ ...r, id: Date.now() + Math.random(), at: Date.now() }, ...get().records].slice(0, 500) });
      },
      clear: () => set({ records: [] }),
    }),
    { name: 'organizador-historico', storage: createJSONStorage(() => localStorage), version: 1 },
  ),
);

export function totalFreed(records: CleanRecord[]) {
  return records.reduce((s, r) => s + r.freed, 0);
}

/** Total liberado por mês (últimos `months` meses, do mais antigo ao atual). */
export function freedByMonth(records: CleanRecord[], months = 6, now = new Date()): { key: string; start: number; freed: number }[] {
  const out: { key: string; start: number; freed: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ key: `${d.getFullYear()}-${d.getMonth()}`, start: d.getTime(), freed: 0 });
  }
  for (const r of records) {
    const d = new Date(r.at);
    const slot = out.find((m) => m.key === `${d.getFullYear()}-${d.getMonth()}`);
    if (slot) slot.freed += r.freed;
  }
  return out;
}
