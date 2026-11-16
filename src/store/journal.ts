import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Registro das operações feitas pelo app (para Desfazer e para o Histórico). */
export type JournalKind = 'move' | 'copy' | 'rename' | 'create' | 'trash' | 'delete' | 'restore' | 'rules';

export interface JournalEntry {
  id: number;
  at: number;
  kind: JournalKind;
  label: string;
  /** Pares [original, atual] para mover/renomear/regras. */
  pairs?: [string, string][];
  /** Itens criados (cópias/novos) ou enviados à Lixeira. */
  paths?: string[];
  bytes?: number;
  undone?: boolean;
}

interface JournalState {
  entries: JournalEntry[];
  push: (e: Omit<JournalEntry, 'id' | 'at'> & { at?: number }) => JournalEntry;
  markUndone: (id: number) => void;
  clear: () => void;
}

export const UNDOABLE: JournalKind[] = ['move', 'copy', 'rename', 'create', 'trash', 'rules'];

export const useJournal = create<JournalState>()(
  persist(
    (set, get) => ({
      entries: [],
      push: (e) => {
        const entry: JournalEntry = { ...e, id: Date.now() + Math.random(), at: e.at ?? Date.now() };
        // Guarda no máximo 150 operações (as listas grandes ficam resumidas).
        const trimmed: JournalEntry = {
          ...entry,
          paths: entry.paths?.slice(0, 5000),
          pairs: entry.pairs?.slice(0, 5000),
        };
        set({ entries: [trimmed, ...get().entries].slice(0, 150) });
        return entry;
      },
      markUndone: (id) => set({ entries: get().entries.map((e) => (e.id === id ? { ...e, undone: true } : e)) }),
      clear: () => set({ entries: [] }),
    }),
    { name: 'organizador-operacoes', storage: createJSONStorage(() => localStorage), version: 1 },
  ),
);
