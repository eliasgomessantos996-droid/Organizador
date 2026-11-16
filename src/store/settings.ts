import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Density, MotionPref, ThemeId } from '../lib/theme';

export type ViewMode = 'detalhes' | 'icones';
export type ExplorerStart = 'computador' | 'downloads' | 'ultima';
export type OneClickProfile = 'seguro' | 'equilibrado' | 'completo' | 'personalizado';
export type AutoClean = 'desligada' | 'diaria' | 'semanal' | 'mensal';

export interface Settings {
  // Aparência
  theme: ThemeId;
  motion: MotionPref;
  density: Density;
  sidebarCollapsed: boolean;

  // Explorador
  showHidden: boolean;
  showExtensions: boolean;
  foldersFirst: boolean;
  confirmDelete: boolean;
  /** Tecla Delete envia para a Lixeira (Shift+Delete sempre exclui permanentemente). */
  deleteToTrash: boolean;
  explorerStart: ExplorerStart;
  lastPath: string;
  viewMode: ViewMode;
  detailsPane: boolean;
  columnWidths: Record<string, number>;
  favorites: string[];
  thumbnails: boolean;

  // Limpeza e otimização
  oneClickProfile: OneClickProfile;
  customTargets: string[];
  confirmBeforeClean: boolean;
  trimMemoryOnOneClick: boolean;
  tempMinAgeHours: number;
  oldDownloadsDays: number;
  unusedDays: number;
  autoClean: AutoClean;
  lastAutoClean: number;

  // Proteção
  protectedPaths: string[];

  // Regras
  runRulesOnStart: boolean;

  // Geral
  welcomeSeen: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'sistema',
  motion: 'auto',
  density: 'confortavel',
  sidebarCollapsed: false,

  showHidden: false,
  showExtensions: true,
  foldersFirst: true,
  confirmDelete: true,
  deleteToTrash: true,
  explorerStart: 'computador',
  lastPath: '',
  viewMode: 'detalhes',
  detailsPane: true,
  columnWidths: {},
  favorites: [],
  thumbnails: true,

  oneClickProfile: 'equilibrado',
  customTargets: [],
  confirmBeforeClean: true,
  trimMemoryOnOneClick: true,
  tempMinAgeHours: 24,
  oldDownloadsDays: 90,
  unusedDays: 365,
  autoClean: 'desligada',
  lastAutoClean: 0,

  protectedPaths: [],

  runRulesOnStart: false,

  welcomeSeen: false,
};

interface SettingsStore extends Settings {
  set: (patch: Partial<Settings>) => void;
  toggleFavorite: (path: string) => void;
  reset: () => void;
}

export const useSettings = create<SettingsStore>()(
  persist(
    (set, get) => ({
      ...DEFAULT_SETTINGS,
      set: (patch) => set(patch),
      toggleFavorite: (path) => {
        const favs = get().favorites;
        set({ favorites: favs.includes(path) ? favs.filter((p) => p !== path) : [...favs, path] });
      },
      reset: () => set({ ...DEFAULT_SETTINGS, welcomeSeen: true }),
    }),
    {
      name: 'organizador-configuracoes',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => {
        // Persiste apenas os dados (sem as funções).
        const { set: _set, toggleFavorite: _tf, reset: _r, ...data } = s;
        return data;
      },
      merge: (persisted, current) => ({ ...current, ...DEFAULT_SETTINGS, ...(persisted as Partial<Settings>) }),
    },
  ),
);

/** Lê as configurações fora de componentes React. */
export const settings = () => useSettings.getState();
