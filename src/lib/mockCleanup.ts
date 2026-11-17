/** Limpeza simulada (modo navegador). */

import { extraHandlers, mockInternals } from './mock';
import type { CleanItem, CleanReport, TargetInfo, TargetReport } from './types';

const MB = 1024 ** 2;
const GB = 1024 ** 3;

const TARGETS: (TargetInfo & { bytes: number; files: number })[] = [
  ['lixeira', 'Lixeira', 'Itens que você já excluiu e ainda ocupam espaço no disco.', 'sistema', 'trash', 'moderado', false, false, 3.4 * GB, 182],
  ['temp-usuario', 'Arquivos temporários', 'Sobras de instalações e programas na pasta Temp do seu usuário.', 'sistema', 'clock', 'seguro', false, false, 2.1 * GB, 4830],
  ['temp-windows', 'Temporários do Windows', 'Arquivos temporários do sistema em Windows\\Temp.', 'sistema', 'clock', 'seguro', true, false, 640 * MB, 912],
  ['miniaturas', 'Cache de miniaturas', 'Miniaturas de imagens e ícones; o Windows recria quando precisar.', 'sistema', 'image', 'seguro', false, false, 380 * MB, 14],
  ['cache-internet', 'Cache de internet do Windows', 'Arquivos temporários de internet usados por apps do Windows.', 'sistema', 'globe', 'seguro', false, false, 96 * MB, 2210],
  ['relatorios-erro', 'Relatórios de erro', 'Despejos de falhas de programas e relatórios do Windows Error Reporting.', 'sistema', 'alert-triangle', 'seguro', false, false, 210 * MB, 37],
  ['despejos-memoria', 'Despejos de memória do sistema', 'Arquivos gerados quando o Windows travou (tela azul). Podem ser enormes.', 'sistema', 'memory', 'seguro', true, false, 1.2 * GB, 3],
  ['windows-update', 'Cache do Windows Update', 'Atualizações já baixadas e instaladas. O Windows baixa de novo se precisar.', 'sistema', 'refresh', 'moderado', true, false, 2.8 * GB, 340],
  ['otimizacao-entrega', 'Otimização de Entrega', 'Cópias de atualizações compartilhadas com outros computadores.', 'sistema', 'download', 'seguro', true, false, 520 * MB, 41],
  ['logs', 'Logs antigos do sistema', 'Registros de instalação e diagnóstico com mais de 30 dias.', 'sistema', 'file-text', 'seguro', true, false, 160 * MB, 120],
  ['chrome', 'Google Chrome', 'Cache de páginas e imagens. Você continua conectado nos sites.', 'navegadores', 'globe', 'seguro', false, false, 1.1 * GB, 8900],
  ['edge', 'Microsoft Edge', 'Cache de páginas e imagens. Você continua conectado nos sites.', 'navegadores', 'globe', 'seguro', false, false, 430 * MB, 3200],
  ['firefox', 'Mozilla Firefox', 'Cache de páginas e imagens. Você continua conectado nos sites.', 'navegadores', 'globe', 'seguro', false, false, 0, 0],
  ['apps', 'Cache de aplicativos', 'Caches de Discord, Teams, Slack, VS Code, Spotify e Steam.', 'aplicativos', 'app-window', 'seguro', false, false, 1.6 * GB, 6100],
  ['downloads-incompletos', 'Downloads incompletos', 'Downloads interrompidos (.crdownload, .part) com mais de um dia.', 'arquivos', 'download', 'seguro', false, true, 140 * MB, 1],
  ['instaladores', 'Instaladores antigos', 'Arquivos .exe e .msi na pasta Downloads que você provavelmente já instalou.', 'arquivos', 'package', 'moderado', false, true, 252 * MB, 4],
  ['downloads-antigos', 'Downloads esquecidos', 'Arquivos da pasta Downloads que você não abre há muito tempo (vão para a Lixeira).', 'arquivos', 'inbox', 'moderado', false, true, 8.7 * GB, 23],
  ['pastas-vazias', 'Pastas vazias', 'Pastas sem nenhum arquivo dentro das suas pastas pessoais.', 'arquivos', 'folder', 'moderado', false, false, 0, 12],
].map(([id, name, description, group, icon, risk, needsAdmin, toTrash, bytes, files]) => ({
  id: id as string,
  name: name as string,
  description: description as string,
  group: group as TargetInfo['group'],
  icon: icon as string,
  risk: risk as TargetInfo['risk'],
  needsAdmin: needsAdmin as boolean,
  toTrash: toTrash as boolean,
  available: true,
  bytes: bytes as number,
  files: files as number,
}));

function sample(t: (typeof TARGETS)[number], n: number): CleanItem[] {
  const base = t.group === 'navegadores' ? `C:\\Users\\Ana\\AppData\\Local\\${t.name}\\Cache` : t.id === 'lixeira' ? 'C:\\$Recycle.Bin' : `C:\\Users\\Ana\\AppData\\Local\\Temp`;
  return Array.from({ length: Math.min(n, t.files) }, (_, i) => ({
    path: `${base}\\${t.id}-${(i + 1).toString(16).padStart(4, '0')}.${t.id === 'miniaturas' ? 'db' : 'tmp'}`,
    size: Math.round((t.bytes / Math.max(1, t.files)) * (1.8 - i * 0.05)),
    modified: Date.now() - (5 + i) * 86_400_000,
    isDir: t.id === 'pastas-vazias',
  }));
}

Object.assign(extraHandlers, {
  cleanup_targets: () => TARGETS.map(({ bytes: _b, files: _f, ...t }) => t),
  cleanup_analyze: async (a: Record<string, unknown>): Promise<TargetReport[]> => {
    const ids = a.ids as string[];
    const out: TargetReport[] = [];
    for (let i = 0; i < ids.length; i++) {
      const t = TARGETS.find((x) => x.id === ids[i]);
      mockInternals.emit({ taskId: a.taskId as string, phase: `Analisando: ${t?.name ?? ids[i]}`, done: i, total: ids.length, bytesDone: 0, bytesTotal: 0, current: '' });
      await mockInternals.sleep(140);
      if (t) out.push({ id: t.id, files: t.files, bytes: t.bytes, denied: t.needsAdmin ? 3 : 0, sample: sample(t, 8) });
    }
    return out;
  },
  cleanup_items: (a: Record<string, unknown>) => {
    const t = TARGETS.find((x) => x.id === a.id);
    return t ? sample(t, 40) : [];
  },
  cleanup_exclude: () => undefined,
  cleanup_run: async (a: Record<string, unknown>): Promise<CleanReport> => {
    const ids = a.ids as string[];
    const chosen = TARGETS.filter((t) => ids.includes(t.id));
    const total = chosen.reduce((s, t) => s + t.bytes, 0);
    let done = 0;
    const report: CleanReport = { freed: 0, deleted: 0, failed: 0, targets: [], cancelled: false };
    for (const t of chosen) {
      mockInternals.emit({ taskId: a.taskId as string, phase: `Limpando: ${t.name}`, done: report.deleted, total: chosen.reduce((s, x) => s + x.files, 0), bytesDone: done, bytesTotal: total, current: t.name });
      await mockInternals.sleep(220);
      const freed = t.needsAdmin ? Math.round(t.bytes * 0.15) : t.bytes;
      done += t.bytes;
      report.targets.push({ id: t.id, name: t.name, freed, deleted: t.files, failed: t.needsAdmin ? 4 : 0, error: t.needsAdmin ? 'Exige o Organizador como administrador.' : null });
      report.freed += freed;
      report.deleted += t.files;
      t.bytes -= freed;
      t.files = t.needsAdmin ? 4 : 0;
    }
    return report;
  },
});
