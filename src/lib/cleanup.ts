/** Perfis do One Click, execução da limpeza e registro no histórico. */

import { api, errorText } from './api';
import { formatBytes, plural } from './format';
import type { CleanOptions, CleanReport, TargetReport } from './types';
import type { IconName } from '../components/Icon';
import { useHealth } from '../store/health';
import { useHistory, type CleanSource } from '../store/history';
import { settings, type OneClickProfile } from '../store/settings';
import { runTask } from '../store/tasks';
import { toast } from '../store/toasts';

export const SAFE_TARGETS = [
  'temp-usuario',
  'miniaturas',
  'cache-internet',
  'relatorios-erro',
  'chrome',
  'edge',
  'brave',
  'opera',
  'firefox',
  'apps',
  'downloads-incompletos',
];

export const PROFILE_TARGETS: Record<Exclude<OneClickProfile, 'personalizado'>, string[]> = {
  seguro: SAFE_TARGETS,
  equilibrado: [...SAFE_TARGETS, 'lixeira', 'temp-windows', 'despejos-memoria', 'windows-update', 'otimizacao-entrega', 'logs'],
  completo: [...SAFE_TARGETS, 'lixeira', 'temp-windows', 'despejos-memoria', 'windows-update', 'otimizacao-entrega', 'logs', 'instaladores', 'downloads-antigos', 'pastas-vazias'],
};

export const PROFILES: { id: OneClickProfile; label: string; description: string; icon: IconName }[] = [
  { id: 'seguro', label: 'Seguro', description: 'Só caches e temporários. Nenhum arquivo seu é tocado.', icon: 'shield-check' },
  { id: 'equilibrado', label: 'Equilibrado', description: 'Seguro + Lixeira, temporários do Windows e cache de atualizações.', icon: 'sparkles' },
  { id: 'completo', label: 'Completo', description: 'Equilibrado + downloads esquecidos, instaladores antigos e pastas vazias (para a Lixeira).', icon: 'bolt' },
  { id: 'personalizado', label: 'Personalizado', description: 'Os itens que você escolheu nas Configurações.', icon: 'settings' },
];

export const GROUPS: { id: string; label: string; icon: IconName }[] = [
  { id: 'sistema', label: 'Sistema', icon: 'monitor' },
  { id: 'navegadores', label: 'Navegadores', icon: 'globe' },
  { id: 'aplicativos', label: 'Aplicativos', icon: 'app-window' },
  { id: 'arquivos', label: 'Seus arquivos', icon: 'folder' },
];

export function profileTargets(profile: OneClickProfile): string[] {
  if (profile === 'personalizado') {
    const custom = settings().customTargets;
    return custom.length ? custom : PROFILE_TARGETS.equilibrado;
  }
  return PROFILE_TARGETS[profile];
}

export function cleanOptions(): CleanOptions {
  const s = settings();
  return { tempMinAgeHours: s.tempMinAgeHours, oldDownloadsDays: s.oldDownloadsDays, oldInstallersDays: 30 };
}

export async function analyzeTargets(ids: string[], title = 'Analisando o que pode ser limpo'): Promise<TargetReport[]> {
  return runTask(title, 'scan', (id) => api.cleanupAnalyze(id, ids, cleanOptions()));
}

/** Limpa os alvos, registra no histórico e atualiza a saúde. */
export async function runCleanup(ids: string[], source: CleanSource, opts: { silent?: boolean; taskId?: string } = {}): Promise<CleanReport | null> {
  try {
    const exec = (taskId: string) => api.cleanupRun(taskId, ids, cleanOptions());
    const report = opts.taskId ? await exec(opts.taskId) : await runTask('Limpando', 'broom', exec);
    useHistory.getState().add({
      source,
      freed: report.freed,
      items: report.deleted,
      targets: report.targets.filter((t) => t.freed > 0 || t.deleted > 0).map((t) => ({ id: t.id, name: t.name, freed: t.freed })),
    });
    void useHealth.getState().loadExtras(true);
    if (!opts.silent) {
      if (report.freed > 0 || report.deleted > 0)
        toast.good(`${formatBytes(report.freed)} liberados`, `${plural(report.deleted, 'item removido', 'itens removidos')}${report.failed ? ` · ${report.failed} em uso ou protegidos` : ''}.`);
      else toast.info('Nada para limpar', 'Os itens escolhidos já estavam limpos.');
    }
    return report;
  } catch (e) {
    if (!opts.silent) toast.error('A limpeza não pôde ser concluída', errorText(e));
    return null;
  }
}

export function sumReports(reports: TargetReport[], ids?: string[]) {
  const list = ids ? reports.filter((r) => ids.includes(r.id)) : reports;
  return { bytes: list.reduce((s, r) => s + r.bytes, 0), files: list.reduce((s, r) => s + r.files, 0) };
}
