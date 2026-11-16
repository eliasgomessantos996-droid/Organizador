import { create } from 'zustand';
import { api } from '../lib/api';
import { isInside, samePath } from '../lib/format';
import type { DriveInfo, SpecialFolders } from '../lib/types';
import type { SpecialFolder } from '../components/FileIcon';

/** Pastas especiais e unidades do computador (Área de Trabalho, Downloads, C:\...). */
interface PlacesState {
  special: SpecialFolders | null;
  drives: DriveInfo[];
  loaded: boolean;
  load: () => Promise<void>;
  refreshDrives: () => Promise<void>;
}

export const usePlaces = create<PlacesState>((set, get) => ({
  special: null,
  drives: [],
  loaded: false,
  load: async () => {
    if (get().loaded) return;
    const [special, drives] = await Promise.all([api.specialFolders().catch(() => null), api.listDrives().catch(() => [])]);
    set({ special, drives, loaded: true });
  },
  refreshDrives: async () => {
    const drives = await api.listDrives().catch(() => get().drives);
    set({ drives });
  },
}));

export interface QuickPlace {
  key: SpecialFolder;
  label: string;
  path: string;
}

export function quickPlaces(sp: SpecialFolders | null): QuickPlace[] {
  if (!sp) return [];
  const list: [SpecialFolder, string, string | null | undefined][] = [
    ['desktop', 'Área de Trabalho', sp.desktop],
    ['downloads', 'Downloads', sp.downloads],
    ['documents', 'Documentos', sp.documents],
    ['pictures', 'Imagens', sp.pictures],
    ['music', 'Músicas', sp.music],
    ['videos', 'Vídeos', sp.videos],
  ];
  return list.filter((x): x is [SpecialFolder, string, string] => !!x[2]).map(([key, label, path]) => ({ key, label, path }));
}

/** Qual pasta especial corresponde a um caminho (para mostrar o símbolo certo). */
export function specialOf(path: string): SpecialFolder | null {
  const sp = usePlaces.getState().special;
  if (!sp) return null;
  if (sp.home && samePath(path, sp.home)) return 'home';
  for (const q of quickPlaces(sp)) if (samePath(q.path, path)) return q.key;
  return null;
}

/** Nome amigável de uma pasta especial ("Downloads" em vez do caminho). */
export function friendlyName(path: string): string | null {
  const sp = usePlaces.getState().special;
  for (const q of quickPlaces(sp)) if (samePath(q.path, path)) return q.label;
  if (sp?.home && samePath(path, sp.home)) return 'Pasta pessoal';
  return null;
}

/** Unidade que contém o caminho. */
export function driveOf(path: string): DriveInfo | null {
  const drives = usePlaces.getState().drives;
  let best: DriveInfo | null = null;
  for (const d of drives) if (isInside(path, d.mount) && (!best || d.mount.length > best.mount.length)) best = d;
  return best;
}
