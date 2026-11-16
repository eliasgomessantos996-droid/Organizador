import { create } from 'zustand';

/** Estado compartilhado da saúde do PC (preenchido pela página Saúde e pelo Início). */
interface HealthState {
  score: number | null;
  setScore: (score: number | null) => void;
}

export const useHealth = create<HealthState>((set) => ({
  score: null,
  setScore: (score) => set({ score }),
}));
