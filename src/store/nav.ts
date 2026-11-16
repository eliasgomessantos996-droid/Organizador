import { create } from 'zustand';

export type PageId =
  | 'inicio'
  | 'explorador'
  | 'organizador'
  | 'duplicados'
  | 'mapa'
  | 'regras'
  | 'otimizar'
  | 'limpeza'
  | 'saude'
  | 'inicializacao'
  | 'historico'
  | 'configuracoes';

/** Parâmetros opcionais passados entre páginas (ex.: abrir uma pasta no Organizador). */
export interface NavParams {
  path?: string;
  paths?: string[];
  tab?: string;
  autoStart?: boolean;
  /** Muda a cada navegação para que a página reaja mesmo com os mesmos parâmetros. */
  nonce?: number;
}

interface NavState {
  page: PageId;
  params: NavParams;
  go: (page: PageId, params?: Omit<NavParams, 'nonce'>) => void;
}

export const useNav = create<NavState>((set) => ({
  page: 'inicio',
  params: {},
  go: (page, params = {}) => set({ page, params: { ...params, nonce: Date.now() } }),
}));

export const go = (page: PageId, params?: Omit<NavParams, 'nonce'>) => useNav.getState().go(page, params);
