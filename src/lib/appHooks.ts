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

/**
 * Limpeza automática ao abrir o app (diária, semanal ou mensal, nas Configurações).
 * Por segurança, nunca usa o perfil Completo: arquivos pessoais não são tocados.
 */
export function useAutoClean() {
  useEffect(() => {
    const s = useSettings.getState();
    if (s.autoClean === 'desligada') return;
    const days = { diaria: 1, semanal: 7, mensal: 30 }[s.autoClean];
    if (Date.now() - s.lastAutoClean < days * 86_400_000) return;
    const t = window.setTimeout(async () => {
      const { profileTargets, cleanOptions, runCleanup } = await import('./cleanup');
      const { toast } = await import('../store/toasts');
      const { formatBytes } = await import('./format');
      const { newTaskId } = await import('./api');
      const profile = s.oneClickProfile === 'completo' ? 'equilibrado' : s.oneClickProfile;
      try {
        const reports = await api.cleanupAnalyze(newTaskId(), profileTargets(profile), cleanOptions());
        const ids = reports.filter((r) => r.files > 0 || r.id === 'lixeira').map((r) => r.id);
        const r = ids.length ? await runCleanup(ids, 'auto', { silent: true }) : null;
        useSettings.getState().set({ lastAutoClean: Date.now() });
        if (r && r.freed > 0) toast.good('Limpeza automática concluída', `${formatBytes(r.freed)} liberados sem você precisar fazer nada.`);
      } catch {
        /* tenta de novo na próxima abertura */
      }
    }, 8000);
    return () => window.clearTimeout(t);
  }, []);
}

/** Aplica as regras ativas ao abrir o app (opção nas Regras automáticas). */
export function useRulesOnStart() {
  useEffect(() => {
    if (!useSettings.getState().runRulesOnStart) return;
    const t = window.setTimeout(async () => {
      const { useRules } = await import('../store/rules');
      const rules = useRules.getState().rules.filter((r) => r.enabled);
      if (!rules.length) return;
      try {
        const plan = await api.rulesPreview(rules);
        if (!plan.length) return;
        const { applyPlan } = await import('../pages/rules/Rules');
        await applyPlan(plan, true);
      } catch {
        /* uma pasta de origem pode não existir mais; tenta na próxima abertura */
      }
    }, 5000);
    return () => window.clearTimeout(t);
  }, []);
}
