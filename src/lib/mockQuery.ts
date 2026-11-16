/** Espelho em TypeScript do mecanismo de consulta do backend (usado pela simulação). */

import type { Category } from './categories';
import { sortEntries, textMatcher } from './filters';
import type { AgeStat, FileEntry, FileFilter, SortSpec, Summary } from './types';

export function applyBackendFilter(list: FileEntry[], f: FileFilter): FileEntry[] {
  const match = textMatcher(f.text ?? '');
  const exts = (f.extensions ?? []).map((e) => e.replace(/^\./, '').toLowerCase());
  const folder = f.folder?.toLowerCase().replace(/\\$/, '');
  return list.filter((e) => {
    if (f.hideHidden && e.hidden) return false;
    if (f.categories?.length && !f.categories.includes(e.category)) return false;
    if (exts.length && !exts.includes(e.ext)) return false;
    if (f.sizeMin != null && e.size < f.sizeMin) return false;
    if (f.sizeMax != null && e.size > f.sizeMax) return false;
    if (f.modifiedAfter != null && e.modified < f.modifiedAfter) return false;
    if (f.modifiedBefore != null && e.modified >= f.modifiedBefore) return false;
    if (f.unusedBefore != null && Math.max(e.modified, e.accessed) >= f.unusedBefore) return false;
    if (folder) {
      const p = e.parent.toLowerCase();
      if (p !== folder && !p.startsWith(`${folder}\\`)) return false;
    }
    return match(e.name);
  });
}

export function sortForBackend(list: FileEntry[], sort: SortSpec): FileEntry[] {
  return sortEntries(list, sort, false);
}

const AGES: [string, string, number, number | null][] = [
  ['recentes', 'Últimos 30 dias', 0, 30],
  ['meses', '1 a 6 meses', 30, 182],
  ['semestre', '6 a 12 meses', 182, 365],
  ['ano', '1 a 2 anos', 365, 730],
  ['anos', '2 a 5 anos', 730, 1825],
  ['antigos', 'Mais de 5 anos', 1825, null],
];

export function summarizeEntries(list: FileEntry[], roots: string[]): Summary {
  const now = Date.now();
  const cats = new Map<Category, { count: number; size: number }>();
  const exts = new Map<string, { count: number; size: number }>();
  const folders = new Map<string, { count: number; size: number }>();
  const ages: AgeStat[] = AGES.map(([id, label, fromDays, toDays]) => ({ id, label, fromDays, toDays, count: 0, size: 0 }));
  const rootsLow = roots.map((r) => r.toLowerCase().replace(/\\$/, ''));
  let size = 0;
  for (const e of list) {
    size += e.size;
    const c = cats.get(e.category) ?? { count: 0, size: 0 };
    c.count++;
    c.size += e.size;
    cats.set(e.category, c);
    const x = exts.get(e.ext) ?? { count: 0, size: 0 };
    x.count++;
    x.size += e.size;
    exts.set(e.ext, x);
    const days = Math.floor((now - e.modified) / 86_400_000);
    const a = ages.find((g) => days >= g.fromDays && (g.toDays == null || days < g.toDays)) ?? ages[5];
    a.count++;
    a.size += e.size;
    // Pasta de primeiro nível dentro da raiz.
    const root = rootsLow.find((r) => e.parent.toLowerCase() === r || e.parent.toLowerCase().startsWith(`${r}\\`)) ?? '';
    const rest = e.parent.slice(root.length).split('\\').filter(Boolean);
    const top = rest.length ? `${e.parent.slice(0, root.length)}\\${rest[0]}` : e.parent;
    const fo = folders.get(top) ?? { count: 0, size: 0 };
    fo.count++;
    fo.size += e.size;
    folders.set(top, fo);
  }
  return {
    count: list.length,
    size,
    categories: [...cats].map(([category, v]) => ({ category, ...v })).sort((a, b) => b.size - a.size),
    ages,
    folders: [...folders]
      .map(([path, v]) => ({ path, name: path.split('\\').pop() || path, ...v }))
      .sort((a, b) => b.size - a.size)
      .slice(0, 12),
    extensions: [...exts]
      .map(([ext, v]) => ({ ext, ...v }))
      .sort((a, b) => b.size - a.size)
      .slice(0, 12),
    largest: [...list].sort((a, b) => b.size - a.size).slice(0, 10),
  };
}
