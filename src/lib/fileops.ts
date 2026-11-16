/**
 * Operações de arquivo com interface: confirmações, conflitos, progresso,
 * notificações e registro para Desfazer (Ctrl+Z). Usadas pelo Explorador,
 * Organizador, Duplicados, Mapa de espaço e Limpeza.
 */

import { api, errorText } from './api';
import { basename, dirname, formatBytes, plural } from './format';
import { isTauri } from './platform';
import { emitFsChanged } from './events';
import type { Conflict, DeleteReport, DoneItem, FailedItem, OpReport } from './types';
import { useClipboard } from '../store/clipboard';
import { choose, confirm, prompt } from '../store/dialogs';
import { UNDOABLE, useJournal } from '../store/journal';
import { settings } from '../store/settings';
import { runTask } from '../store/tasks';
import { toast } from '../store/toasts';

const itemsLabel = (paths: string[]) => (paths.length === 1 ? `“${basename(paths[0])}”` : plural(paths.length, 'item', 'itens'));

function parentsOf(paths: string[]): string[] {
  return [...new Set(paths.map(dirname))];
}

function reportFailures(failed: FailedItem[], verb: string) {
  if (!failed.length) return;
  const first = failed[0];
  toast.error(
    failed.length === 1 ? `Não foi possível ${verb} “${basename(first.path)}”` : `${failed.length} itens não puderam ser ${verb === 'copiar' ? 'copiados' : verb === 'mover' ? 'movidos' : 'excluídos'}`,
    first.error,
  );
}

/* ───────────── Seletores nativos ───────────── */

export async function pickFolder(title = 'Escolher pasta', defaultPath?: string): Promise<string | null> {
  if (isTauri) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const r = await open({ directory: true, multiple: false, title, defaultPath });
    return typeof r === 'string' ? r : null;
  }
  return prompt({ title, label: 'Caminho da pasta (modo navegador)', initial: defaultPath ?? 'C:\\Users\\Ana\\Documents', icon: 'folder-open', confirmLabel: 'Escolher' });
}

export async function pickFolders(title = 'Escolher pastas'): Promise<string[]> {
  if (isTauri) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const r = await open({ directory: true, multiple: true, title });
    if (!r) return [];
    return Array.isArray(r) ? r : [r];
  }
  const one = await pickFolder(title);
  return one ? [one] : [];
}

export async function pickSaveFile(title: string, defaultName: string, ext: string, label: string): Promise<string | null> {
  if (isTauri) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    return save({ title, defaultPath: defaultName, filters: [{ name: label, extensions: [ext] }] });
  }
  return defaultName;
}

/* ───────────── Área de transferência ───────────── */

export async function clipboardSet(paths: string[], cut: boolean) {
  if (!paths.length) return;
  useClipboard.getState().set(paths, cut);
  try {
    await api.clipboardWrite(paths, cut);
  } catch {
    // A cópia interna continua funcionando mesmo se o Windows recusar.
  }
}

export async function clipboardGet(): Promise<{ paths: string[]; cut: boolean } | null> {
  try {
    const os = await api.clipboardRead();
    if (os?.paths.length) return os;
  } catch {
    /* ignora */
  }
  const c = useClipboard.getState();
  return c.paths.length ? { paths: c.paths, cut: c.cut } : null;
}

export async function copyPathsAsText(paths: string[]) {
  try {
    await navigator.clipboard.writeText(paths.join('\r\n'));
    toast.good(paths.length === 1 ? 'Caminho copiado' : `${paths.length} caminhos copiados`);
  } catch {
    toast.error('Não foi possível copiar o caminho');
  }
}

/* ───────────── Copiar e mover ───────────── */

async function askConflict(sources: string[], dest: string): Promise<Conflict | null> {
  let names: string[];
  try {
    names = await api.checkConflicts(sources, dest);
  } catch {
    return 'rename';
  }
  if (!names.length) return 'rename';
  const choice = await choose({
    title: names.length === 1 ? `“${names[0]}” já existe em “${basename(dest)}”` : `${names.length} itens já existem em “${basename(dest)}”`,
    text: 'O que você quer fazer com os itens de mesmo nome?',
    icon: 'copy',
    tone: 'warning',
    details: names,
    options: [
      { id: 'rename', label: 'Manter os dois', description: 'Os novos itens recebem um número no nome, como “foto (2).jpg”.', tone: 'primary' },
      { id: 'skip', label: 'Ignorar esses itens', description: 'Os itens que já existem no destino não são alterados.' },
      { id: 'overwrite', label: 'Substituir no destino', description: 'Os itens do destino serão trocados pelos novos.', tone: 'danger' },
    ],
  });
  return choice as Conflict | null;
}

function afterTransfer(report: OpReport, kind: 'copy' | 'move', dest: string, sources: string[]) {
  const verbDone = kind === 'copy' ? 'copiado' : 'movido';
  if (report.cancelled) toast.warning('Operação cancelada', `${plural(report.done.length, 'item concluído', 'itens concluídos')} antes do cancelamento.`);
  reportFailures(report.failed, kind === 'copy' ? 'copiar' : 'mover');
  if (report.done.length) {
    useJournal.getState().push(
      kind === 'copy'
        ? { kind: 'copy', label: `Copiou ${itemsLabel(report.done.map((d) => d.from))} para “${basename(dest)}”`, paths: report.done.map((d) => d.to), bytes: report.bytes }
        : { kind: 'move', label: `Moveu ${itemsLabel(report.done.map((d) => d.from))} para “${basename(dest)}”`, pairs: report.done.map((d) => [d.from, d.to]), bytes: report.bytes },
    );
    if (report.done.length > 1 || report.bytes > 50 * 1024 * 1024) {
      toast.good(`${plural(report.done.length, `item ${verbDone}`, `itens ${verbDone}s`)}`, `${formatBytes(report.bytes)} para “${basename(dest)}”`, {
        label: 'Desfazer',
        run: () => void undoLast(),
      });
    }
  }
  emitFsChanged([dest, ...(kind === 'move' ? parentsOf(sources) : [])]);
}

export async function copyTo(sources: string[], dest: string): Promise<DoneItem[]> {
  if (!sources.length) return [];
  const conflict = await askConflict(sources, dest);
  if (!conflict) return [];
  try {
    const report = await runTask(`Copiando ${itemsLabel(sources)}`, 'copy', (id) => api.copyItems(id, sources, dest, conflict));
    afterTransfer(report, 'copy', dest, sources);
    return report.done;
  } catch (e) {
    toast.error('Não foi possível copiar', errorText(e));
    return [];
  }
}

export async function moveTo(sources: string[], dest: string): Promise<DoneItem[]> {
  if (!sources.length) return [];
  const conflict = await askConflict(sources, dest);
  if (!conflict) return [];
  try {
    const report = await runTask(`Movendo ${itemsLabel(sources)}`, 'arrow-right', (id) => api.moveItems(id, sources, dest, conflict));
    afterTransfer(report, 'move', dest, sources);
    return report.done;
  } catch (e) {
    toast.error('Não foi possível mover', errorText(e));
    return [];
  }
}

/** Cola o conteúdo da área de transferência na pasta. */
export async function pasteInto(dest: string): Promise<DoneItem[]> {
  const clip = await clipboardGet();
  if (!clip) {
    toast.info('Nada para colar', 'Copie ou recorte arquivos primeiro (Ctrl+C ou Ctrl+X).');
    return [];
  }
  if (clip.cut) {
    const moved = await moveTo(clip.paths, dest);
    if (moved.length) {
      useClipboard.getState().clear();
      void api.clipboardClear().catch(() => {});
    }
    return moved;
  }
  return copyTo(clip.paths, dest);
}

export async function copyToFolder(sources: string[]): Promise<DoneItem[]> {
  const dest = await pickFolder('Copiar para…');
  return dest ? copyTo(sources, dest) : [];
}

export async function moveToFolder(sources: string[]): Promise<DoneItem[]> {
  const dest = await pickFolder('Mover para…');
  return dest ? moveTo(sources, dest) : [];
}

/* ───────────── Excluir ───────────── */

/**
 * Exclui itens. Por padrão vai para a Lixeira; `permanent` exclui de vez
 * (sempre pede confirmação).
 */
export async function deletePaths(paths: string[], permanent?: boolean, opts: { skipConfirm?: boolean } = {}): Promise<DeleteReport | null> {
  if (!paths.length) return null;
  const s = settings();
  const perm = permanent ?? !s.deleteToTrash;
  if (!opts.skipConfirm && (s.confirmDelete || perm)) {
    const ok = await confirm({
      title: perm ? `Excluir ${itemsLabel(paths)} permanentemente?` : `Mover ${itemsLabel(paths)} para a Lixeira?`,
      text: perm ? 'Os itens não irão para a Lixeira. Esta ação não pode ser desfeita.' : 'Você pode restaurá-los pela Lixeira ou desfazer com Ctrl+Z.',
      tone: 'danger',
      icon: perm ? 'trash-x' : 'trash',
      confirmLabel: perm ? 'Excluir permanentemente' : 'Mover para a Lixeira',
      details: paths.length > 1 ? paths.map(basename) : undefined,
    });
    if (!ok) return null;
  }
  const at = Date.now();
  try {
    const report = await runTask(perm ? `Excluindo ${itemsLabel(paths)}` : `Enviando ${itemsLabel(paths)} para a Lixeira`, 'trash', (id) =>
      api.deleteItems(id, paths, perm),
    );
    reportFailures(report.failed, 'excluir');
    if (report.deleted.length) {
      useJournal.getState().push({
        kind: perm ? 'delete' : 'trash',
        label: `${perm ? 'Excluiu' : 'Enviou para a Lixeira'} ${itemsLabel(report.deleted)}`,
        paths: report.deleted,
        bytes: report.bytes,
        at,
      });
      toast.good(
        perm ? `${plural(report.deleted.length, 'item excluído', 'itens excluídos')}` : `${plural(report.deleted.length, 'item enviado', 'itens enviados')} para a Lixeira`,
        `${formatBytes(report.bytes)} ${perm ? 'liberados' : 'movidos para a Lixeira'}`,
        perm ? undefined : { label: 'Desfazer', run: () => void undoLast() },
      );
    }
    emitFsChanged(parentsOf(paths));
    return report;
  } catch (e) {
    toast.error('Não foi possível excluir', errorText(e));
    return null;
  }
}

/* ───────────── Renomear e criar ───────────── */

export async function renamePath(path: string, newName: string): Promise<string | null> {
  const name = newName.trim();
  if (!name || name === basename(path)) return null;
  try {
    const to = await api.renameItem(path, name);
    useJournal.getState().push({ kind: 'rename', label: `Renomeou “${basename(path)}” para “${name}”`, pairs: [[path, to]] });
    emitFsChanged([dirname(path)]);
    return to;
  } catch (e) {
    toast.error('Não foi possível renomear', errorText(e));
    return null;
  }
}

/** Renomeia pedindo o novo nome numa janela (usado fora da lista do Explorador). */
export async function renameWithPrompt(path: string): Promise<string | null> {
  const name = await prompt({ title: 'Renomear', label: 'Novo nome', initial: basename(path), selectBaseName: true, confirmLabel: 'Renomear' });
  return name ? renamePath(path, name) : null;
}

export async function newFolder(parent: string): Promise<string | null> {
  try {
    const p = await api.createFolder(parent);
    useJournal.getState().push({ kind: 'create', label: `Criou a pasta “${basename(p)}”`, paths: [p] });
    emitFsChanged([parent]);
    return p;
  } catch (e) {
    toast.error('Não foi possível criar a pasta', errorText(e));
    return null;
  }
}

export async function newTextFile(parent: string): Promise<string | null> {
  try {
    const p = await api.createTextFile(parent);
    useJournal.getState().push({ kind: 'create', label: `Criou “${basename(p)}”`, paths: [p] });
    emitFsChanged([parent]);
    return p;
  } catch (e) {
    toast.error('Não foi possível criar o arquivo', errorText(e));
    return null;
  }
}

export async function openPath(path: string) {
  try {
    await api.openPath(path);
  } catch (e) {
    toast.error('Não foi possível abrir', errorText(e));
  }
}

export async function revealPath(path: string) {
  try {
    await api.revealPath(path);
  } catch (e) {
    toast.error('Não foi possível mostrar no Explorer', errorText(e));
  }
}

/* ───────────── Desfazer ───────────── */

/** Desfaz a última operação reversível (Ctrl+Z). */
export async function undoLast(): Promise<boolean> {
  const entry = useJournal.getState().entries.find((e) => !e.undone && UNDOABLE.includes(e.kind));
  if (!entry) {
    toast.info('Nada para desfazer');
    return false;
  }
  return undoEntry(entry.id);
}

export async function undoEntry(id: number): Promise<boolean> {
  const entry = useJournal.getState().entries.find((e) => e.id === id);
  if (!entry || entry.undone) return false;
  try {
    let ok = 0;
    let failed: string[] = [];
    let dirs: string[] = [];
    if ((entry.kind === 'move' || entry.kind === 'rename' || entry.kind === 'rules') && entry.pairs) {
      const r = await api.undoMoves(entry.pairs);
      ok = r.done.length;
      failed = r.failed.map((f) => f.error);
      dirs = parentsOf([...entry.pairs.map((p) => p[0]), ...entry.pairs.map((p) => p[1])]);
    } else if ((entry.kind === 'copy' || entry.kind === 'create') && entry.paths) {
      const r = await runTask('Desfazendo', 'undo', (tid) => api.deleteItems(tid, entry.paths!, false));
      ok = r.deleted.length;
      failed = r.failed.map((f) => f.error);
      dirs = parentsOf(entry.paths);
    } else if (entry.kind === 'trash' && entry.paths) {
      const r = await api.trashRestorePaths(entry.paths, entry.at);
      ok = r.done;
      failed = r.failed;
      dirs = parentsOf(entry.paths);
    }
    useJournal.getState().markUndone(entry.id);
    emitFsChanged(dirs);
    if (failed.length && !ok) toast.error('Não foi possível desfazer', failed[0]);
    else if (failed.length) toast.warning('Desfeito em parte', `${failed.length} itens não puderam voltar. ${failed[0]}`);
    else toast.good('Desfeito', entry.label);
    return ok > 0;
  } catch (e) {
    toast.error('Não foi possível desfazer', errorText(e));
    return false;
  }
}
