import { api } from './api';
import { emitFsChanged } from './events';
import { undoLast } from './fileops';
import { dirname, formatBytes, plural } from './format';
import type { PlannedAction } from './types';
import { useJournal } from '../store/journal';
import { runTask } from '../store/tasks';
import { toast } from '../store/toasts';

/** Aplica a prévia das regras e registra no histórico para o Desfazer. */
export async function applyPlan(plan: PlannedAction[], silent = false) {
  const res = await runTask(`Organizando ${plural(plan.length, 'arquivo', 'arquivos')}`, 'wand', (id) => api.rulesApply(id, plan));
  const j = useJournal.getState();
  if (res.moved.length) j.push({ kind: 'rules', label: `Regras: organizou ${plural(res.moved.length, 'arquivo', 'arquivos')}`, pairs: res.moved.map((m) => [m.from, m.to]), bytes: res.bytes });
  if (res.copied.length) j.push({ kind: 'copy', label: `Regras: copiou ${plural(res.copied.length, 'arquivo', 'arquivos')}`, paths: res.copied.map((m) => m.to) });
  if (res.trashed.length) j.push({ kind: 'trash', label: `Regras: enviou ${plural(res.trashed.length, 'arquivo', 'arquivos')} para a Lixeira`, paths: res.trashed });
  emitFsChanged([...new Set([...plan.map((p) => dirname(p.from)), ...plan.filter((p) => p.to).map((p) => dirname(p.to!))])]);
  const total = res.moved.length + res.copied.length + res.trashed.length;
  if (!silent || total) {
    if (res.failed.length) toast.warning(`${plural(total, 'arquivo organizado', 'arquivos organizados')}`, `${res.failed.length} não puderam ser processados: ${res.failed[0].error}`);
    else if (total) toast.good(`${plural(total, 'arquivo organizado', 'arquivos organizados')}`, `${formatBytes(res.bytes)} processados pelas regras.`, { label: 'Desfazer', run: () => void undoLast() });
  }
  return res;
}
