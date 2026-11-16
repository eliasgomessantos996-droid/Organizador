import { useEffect } from 'react';
import { api } from './api';
import { useCommandPalette } from '../components/CommandPalette';
import { quickPlaces, usePlaces } from '../store/places';
import { go } from '../store/nav';
import { useSettings } from '../store/settings';
import { undoLast } from './fileops';

/** Registra na paleta de comandos as pastas especiais e unidades. */
export function usePlaceCommands() {
  const special = usePlaces((s) => s.special);
  const drives = usePlaces((s) => s.drives);
  const load = usePlaces((s) => s.load);
  const register = useCommandPalette((s) => s.register);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    register('places', [
      ...quickPlaces(special).map((q) => ({
        id: `place:${q.key}`,
        label: `Abrir ${q.label}`,
        group: 'Pastas',
        icon: 'folder-open' as const,
        keywords: q.path,
        run: () => go('explorador', { path: q.path }),
      })),
      ...drives.map((d) => ({
        id: `drive:${d.mount}`,
        label: `Abrir ${d.label || 'Disco'} (${d.mount.replace(/\\$/, '')})`,
        group: 'Unidades',
        icon: d.removable ? ('usb' as const) : ('hard-drive' as const),
        run: () => go('explorador', { path: d.mount }),
      })),
      { id: 'action:undo', label: 'Desfazer a última operação', group: 'Ações', icon: 'undo', keywords: 'ctrl z voltar', run: () => void undoLast() },
    ]);
  }, [special, drives, register]);
}

/** Envia as pastas protegidas das Configurações para o backend. */
export function useProtectedSync() {
  const protectedPaths = useSettings((s) => s.protectedPaths);
  useEffect(() => {
    void api.setProtectedPaths(protectedPaths).catch(() => {});
  }, [protectedPaths]);
}
