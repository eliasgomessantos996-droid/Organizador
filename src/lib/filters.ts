/**
 * Filtros e ordenação no estilo do Explorer do Windows:
 * Nome (faixas A–H, I–P, Q–Z), Data de modificação (Hoje, Ontem...),
 * Tipo e Tamanho (Vazio, Minúsculo, Pequeno, Médio, Grande, Enorme, Gigantesco).
 */

import type { Category } from './categories';
import { typeLabel } from './categories';
import type { FileEntry, SortSpec } from './types';

const KB = 1024;
const MB = 1024 * KB;
const GB = 1024 * MB;

export interface SizeBucket {
  id: string;
  label: string;
  hint: string;
  min: number;
  max: number;
}

export const SIZE_BUCKETS: SizeBucket[] = [
  { id: 'vazio', label: 'Vazio', hint: '0 KB', min: 0, max: 0 },
  { id: 'minusculo', label: 'Minúsculo', hint: '0 – 16 KB', min: 1, max: 16 * KB },
  { id: 'pequeno', label: 'Pequeno', hint: '16 KB – 1 MB', min: 16 * KB + 1, max: MB },
  { id: 'medio', label: 'Médio', hint: '1 – 128 MB', min: MB + 1, max: 128 * MB },
  { id: 'grande', label: 'Grande', hint: '128 MB – 1 GB', min: 128 * MB + 1, max: GB },
  { id: 'enorme', label: 'Enorme', hint: '1 – 4 GB', min: GB + 1, max: 4 * GB },
  { id: 'gigantesco', label: 'Gigantesco', hint: 'mais de 4 GB', min: 4 * GB + 1, max: Number.MAX_SAFE_INTEGER },
];

export interface DateBucket {
  id: string;
  label: string;
}

export const DATE_BUCKETS: DateBucket[] = [
  { id: 'hoje', label: 'Hoje' },
  { id: 'ontem', label: 'Ontem' },
  { id: 'esta-semana', label: 'Mais cedo nesta semana' },
  { id: 'semana-passada', label: 'Semana passada' },
  { id: 'este-mes', label: 'Mais cedo neste mês' },
  { id: 'mes-passado', label: 'Mês passado' },
  { id: 'este-ano', label: 'Mais cedo neste ano' },
  { id: 'ano-passado', label: 'Ano passado' },
  { id: 'muito-tempo', label: 'Há muito tempo' },
];

export const NAME_RANGES: { id: string; label: string }[] = [
  { id: '0-9', label: '0 – 9 e símbolos' },
  { id: 'a-h', label: 'A – H' },
  { id: 'i-p', label: 'I – P' },
  { id: 'q-z', label: 'Q – Z' },
];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Intervalo [início, fim) de uma faixa de data, relativo a `now`. */
export function dateBucketRange(id: string, now = new Date()): [number, number] {
  const today = startOfDay(now);
  const day = 86_400_000;
  // Semana começando no domingo, como no Windows em português.
  const weekStart = today - now.getDay() * day;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
  const yearStart = new Date(now.getFullYear(), 0, 1).getTime();
  const prevYearStart = new Date(now.getFullYear() - 1, 0, 1).getTime();
  const far = Number.MAX_SAFE_INTEGER;
  switch (id) {
    case 'hoje':
      return [today, far];
    case 'ontem':
      return [today - day, today];
    case 'esta-semana':
      return [weekStart, today - day];
    case 'semana-passada':
      return [weekStart - 7 * day, weekStart];
    case 'este-mes':
      return [monthStart, weekStart - 7 * day];
    case 'mes-passado':
      return [prevMonthStart, monthStart];
    case 'este-ano':
      return [yearStart, prevMonthStart];
    case 'ano-passado':
      return [prevYearStart, yearStart];
    default:
      return [-far, prevYearStart];
  }
}

/** Em qual faixa de data um horário cai (as faixas não se sobrepõem). */
export function dateBucketOf(ms: number, now = new Date()): string {
  for (const b of DATE_BUCKETS) {
    const [a, z] = dateBucketRange(b.id, now);
    if (ms >= a && ms < z) return b.id;
  }
  return 'muito-tempo';
}

export function sizeBucketOf(size: number): string {
  return (SIZE_BUCKETS.find((b) => size >= b.min && size <= b.max) ?? SIZE_BUCKETS[SIZE_BUCKETS.length - 1]).id;
}

const strip = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export function nameRangeOf(name: string): string {
  const c = strip(name.charAt(0));
  if (c >= 'a' && c <= 'h') return 'a-h';
  if (c >= 'i' && c <= 'p') return 'i-p';
  if (c >= 'q' && c <= 'z') return 'q-z';
  return '0-9';
}

export interface ExplorerFilter {
  text: string;
  names: string[];
  dates: string[];
  types: string[];
  sizes: string[];
}

export const EMPTY_EXPLORER_FILTER: ExplorerFilter = { text: '', names: [], dates: [], types: [], sizes: [] };

export function hasColumnFilters(f: ExplorerFilter): boolean {
  return f.names.length + f.dates.length + f.types.length + f.sizes.length > 0;
}

/** Chave da coluna "Tipo" (o texto mostrado, como no Explorer). */
export function typeKey(e: Pick<FileEntry, 'category' | 'ext'>): string {
  return typeLabel(e.category, e.ext);
}

function wildcardToRegex(pattern: string): RegExp {
  const esc = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${esc}$`, 'i');
}

/** Filtro de texto: parte do nome, ou coringas (*.pdf), sem diferenciar acentos. */
export function textMatcher(text: string): (name: string) => boolean {
  const t = strip(text.trim());
  if (!t) return () => true;
  if (t.includes('*') || t.includes('?')) {
    const re = wildcardToRegex(t);
    return (name) => re.test(strip(name));
  }
  return (name) => strip(name).includes(t);
}

export function applyExplorerFilter(entries: FileEntry[], f: ExplorerFilter, now = new Date()): FileEntry[] {
  const match = textMatcher(f.text);
  return entries.filter((e) => {
    if (!match(e.name)) return false;
    if (f.names.length && !f.names.includes(nameRangeOf(e.name))) return false;
    if (f.dates.length && !f.dates.includes(dateBucketOf(e.modified, now))) return false;
    if (f.types.length && !f.types.includes(typeKey(e))) return false;
    // Pastas não têm tamanho: o filtro de tamanho mostra só arquivos (como o Explorer).
    if (f.sizes.length && (e.isDir || !f.sizes.includes(sizeBucketOf(e.size)))) return false;
    return true;
  });
}

const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
export const compareNames = (a: string, b: string) => collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);

export function sortEntries(entries: FileEntry[], sort: SortSpec, foldersFirst = true): FileEntry[] {
  const dir = sort.desc ? -1 : 1;
  const byName = (a: FileEntry, b: FileEntry) => compareNames(a.name, b.name);
  const cmp = (a: FileEntry, b: FileEntry): number => {
    switch (sort.key) {
      case 'size':
        return a.size - b.size || byName(a, b);
      case 'modified':
        return a.modified - b.modified || byName(a, b);
      case 'created':
        return a.created - b.created || byName(a, b);
      case 'accessed':
        return a.accessed - b.accessed || byName(a, b);
      case 'used':
        return Math.max(a.modified, a.accessed) - Math.max(b.modified, b.accessed) || byName(a, b);
      case 'type':
        return compareNames(typeKey(a), typeKey(b)) || byName(a, b);
      case 'folder':
        return compareNames(a.parent, b.parent) || byName(a, b);
      default:
        return byName(a, b);
    }
  };
  return [...entries].sort((a, b) => {
    if (foldersFirst && a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return cmp(a, b) * dir;
  });
}

/** Opções da coluna "Tipo" presentes na listagem (com contagem). */
export function typeOptions(entries: FileEntry[]): { key: string; count: number; category: Category }[] {
  const map = new Map<string, { key: string; count: number; category: Category }>();
  for (const e of entries) {
    const k = typeKey(e);
    const cur = map.get(k);
    if (cur) cur.count++;
    else map.set(k, { key: k, count: 1, category: e.category });
  }
  return [...map.values()].sort((a, b) => compareNames(a.key, b.key));
}
