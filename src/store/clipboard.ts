import { create } from 'zustand';

/** Espelho da área de transferência de arquivos (para esmaecer itens recortados). */
interface ClipboardState {
  paths: string[];
  cut: boolean;
  set: (paths: string[], cut: boolean) => void;
  clear: () => void;
}

export const useClipboard = create<ClipboardState>((set) => ({
  paths: [],
  cut: false,
  set: (paths, cut) => set({ paths, cut }),
  clear: () => set({ paths: [], cut: false }),
}));
