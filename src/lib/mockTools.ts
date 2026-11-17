/** Duplicados, Mapa de espaço e Regras simulados (modo navegador). */

import { categoryFromExt, CATEGORY_BY_ID, extOf } from './categories';
import { extraHandlers, handle, mockInternals, slots } from './mock';
import type { DupGroup, DupResult, FileEntry, MapNode, PlannedAction, Rule } from './types';

const { resolve, sizeOf, join, toEntry, collect, sleep } = mockInternals;

interface MockNode {
  name: string;
  isDir: boolean;
  size: number;
  modified: number;
  children?: Map<string, MockNode>;
}

function nodeFor(path: string, n: MockNode, depth: number, max: number): MapNode {
  const base: MapNode = { id: `d:${path}`, name: n.name, path, size: sizeOf(n as never).size, files: sizeOf(n as never).files, isDir: true, category: null, children: [] };
  if (!n.isDir || depth === 0) return base;
  const items = [...n.children!.values()]
    .map((c) => ({ c, size: c.isDir ? sizeOf(c as never).size : c.size }))
    .filter((x) => x.size > 0)
    .sort((a, b) => b.size - a.size);
  const keep = items.slice(0, max);
  const rest = items.slice(max);
  base.children = keep.map(({ c, size }) =>
    c.isDir
      ? nodeFor(join(path, c.name), c, depth - 1, Math.max(6, Math.floor(max / 3)))
      : { id: `f:${join(path, c.name)}`, name: c.name, path: join(path, c.name), size, files: 1, isDir: false, category: categoryFromExt(extOf(c.name)), children: [] },
  );
  if (rest.length)
    base.children.push({ id: `o:${path}`, name: `Outros ${rest.length} itens`, path, size: rest.reduce((s, x) => s + x.size, 0), files: rest.length, isDir: false, category: null, children: [] });
  return base;
}

function expand(template: string, source: string, e: FileEntry): string {
  const d = new Date(e.modified);
  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const s = template
    .replace('{categoria}', CATEGORY_BY_ID[e.category].folder)
    .replace('{ano}', String(d.getFullYear()))
    .replace('{mes_nome}', months[d.getMonth()])
    .replace('{mes}', String(d.getMonth() + 1).padStart(2, '0'))
    .replace('{dia}', String(d.getDate()).padStart(2, '0'))
    .replace('{ext}', e.ext || 'sem extensão')
    .replace('{EXT}', (e.ext || 'sem extensão').toUpperCase());
  return /^[A-Za-z]:\\/.test(s) ? s : join(source, s.replace(/\//g, '\\'));
}

Object.assign(extraHandlers, {
  dup_find: async (a: Record<string, unknown>): Promise<DupResult> => {
    const taskId = a.taskId as string;
    const opts = a.options as { minSize: number; categories: string[] };
    const entries: FileEntry[] = [];
    for (const r of a.roots as string[]) {
      const n = resolve(r);
      if (n) collect(r, n, { skipSystem: true }, entries);
    }
    await mockInternals.animateProgress(taskId, 'Lendo pastas', entries.length, 5);
    await mockInternals.animateProgress(taskId, 'Comparando o conteúdo', entries.length, 6, entries.reduce((s, e) => s + e.size, 0));
    const by = new Map<string, FileEntry[]>();
    for (const e of entries) {
      if (e.size < Math.max(1, opts.minSize)) continue;
      if (opts.categories.length && !opts.categories.includes(e.category)) continue;
      const k = `${e.size}|${e.ext}`;
      by.set(k, [...(by.get(k) ?? []), e]);
    }
    const groups: DupGroup[] = [...by.values()]
      .filter((g) => g.length > 1)
      .map((files, i) => ({ id: i, size: files[0].size, hash: (files[0].size * 2654435761).toString(16).slice(-16), files: files.sort((x, y) => x.path.length - y.path.length) }))
      .sort((x, y) => y.size * (y.files.length - 1) - x.size * (x.files.length - 1))
      .map((g, i) => ({ ...g, id: i }));
    return {
      groups,
      wasted: groups.reduce((s, g) => s + g.size * (g.files.length - 1), 0),
      duplicateFiles: groups.reduce((s, g) => s + g.files.length - 1, 0),
      scannedFiles: entries.length,
      hashedBytes: 0,
      elapsedMs: 1200,
      cancelled: false,
    };
  },

  map_node: (a: Record<string, unknown>): MapNode => {
    const slot = slots.get('mapa');
    if (!slot) throw 'Nenhuma análise carregada. Analise as pastas novamente.';
    const depth = a.depth as number;
    const max = a.maxChildren as number;
    const path = a.path as string | null;
    if (path) {
      const n = resolve(path);
      if (!n) throw 'Pasta não encontrada na análise.';
      return nodeFor(path, n as never, depth, max);
    }
    if (slot.roots.length === 1) return nodeFor(slot.roots[0], resolve(slot.roots[0]) as never, depth, max);
    const children = slot.roots.map((r) => nodeFor(r, resolve(r) as never, depth - 1, max));
    return { id: 'raiz', name: 'Pastas analisadas', path: '', size: children.reduce((s, c) => s + c.size, 0), files: children.reduce((s, c) => s + c.files, 0), isDir: true, category: null, children };
  },

  scan_remove_dir: (a: Record<string, unknown>) => {
    const s = slots.get(a.slot as string);
    const p = String(a.path).toLowerCase();
    if (s) for (const e of s.entries) if (e.parent.toLowerCase() === p || e.parent.toLowerCase().startsWith(`${p}\\`)) s.removed.add(e.id!);
    return null;
  },

  rules_preview: (a: Record<string, unknown>): PlannedAction[] => {
    const plan: PlannedAction[] = [];
    const claimed = new Set<string>();
    for (const r of (a.rules as Rule[]).filter((x) => x.enabled)) {
      const src = resolve(r.source);
      if (!src) throw `A pasta de origem da regra “${r.name}” não existe: ${r.source}`;
      const list: FileEntry[] = [];
      if (r.recursive) collect(r.source, src, {}, list);
      else for (const c of (src as unknown as MockNode).children!.values()) if (!c.isDir) list.push(toEntry(join(r.source, c.name), c as never));
      for (const e of list) {
        if (claimed.has(e.path)) continue;
        const c = r.conditions;
        if (c.categories.length && !c.categories.includes(e.category)) continue;
        if (c.extensions.length && !c.extensions.some((x) => x.replace(/^\./, '').toLowerCase() === e.ext)) continue;
        if (c.nameContains && !e.name.toLowerCase().includes(c.nameContains.toLowerCase())) continue;
        if (c.olderThanDays && e.modified > Date.now() - c.olderThanDays * 86_400_000) continue;
        if (c.minSize && e.size < c.minSize) continue;
        if (c.maxSize && e.size > c.maxSize) continue;
        let to: string | null = null;
        if (r.action.type !== 'trash') {
          const dir = expand(r.action.dest, r.source, e);
          if (dir.toLowerCase() === e.parent.toLowerCase()) continue;
          to = join(dir, e.name);
        }
        claimed.add(e.path);
        plan.push({ ruleId: r.id, ruleName: r.name, from: e.path, to, action: r.action.type, size: e.size });
      }
    }
    return plan;
  },

  rules_apply: async (a: Record<string, unknown>) => {
    const plan = a.plan as PlannedAction[];
    const res = { moved: [] as { from: string; to: string }[], copied: [] as { from: string; to: string }[], trashed: [] as string[], failed: [] as { path: string; error: string }[], bytes: 0 };
    for (const p of plan) {
      await sleep(15);
      if (p.action === 'trash') {
        const r = (await handle('delete_items', { taskId: a.taskId, paths: [p.from], permanent: false })) as { deleted: string[] };
        res.trashed.push(...r.deleted);
      } else {
        const dest = p.to!.slice(0, p.to!.lastIndexOf('\\'));
        // Cria as pastas de destino que faltarem.
        const parts = dest.split('\\');
        for (let i = 2; i <= parts.length; i++) {
          const sub = parts.slice(0, i).join('\\');
          if (!resolve(sub)) await handle('create_folder', { parent: parts.slice(0, i - 1).join('\\') || `${parts[0]}\\`, name: parts[i - 1] });
        }
        const r = (await handle(p.action === 'move' ? 'move_items' : 'copy_items', { taskId: a.taskId, sources: [p.from], dest, conflict: 'rename' })) as { done: { from: string; to: string }[] };
        (p.action === 'move' ? res.moved : res.copied).push(...r.done);
      }
      res.bytes += p.size;
    }
    return res;
  },
});
