/** Formatação em português do Brasil (tamanhos, datas, durações, caminhos). */

const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

/** Tamanho legível com base 1024, como o Windows: "1,2 MB", "523 KB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${nf0.format(bytes)} B`;
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < UNITS.length - 1) {
    v /= 1024;
    i++;
  }
  const fmt = v >= 100 ? nf0 : v >= 10 ? nf1 : nf2;
  // Evita "1.024 KB": sobe de unidade quando arredondaria para 1024.
  if (v >= 1023.5 && i < UNITS.length - 1) return `1,00 ${UNITS[i + 1]}`;
  return `${fmt.format(v)} ${UNITS[i]}`;
}

/** Divide o tamanho em número e unidade (para números grandes em destaque). */
export function splitBytes(bytes: number): { value: string; unit: string } {
  const s = formatBytes(bytes);
  const i = s.lastIndexOf(' ');
  return { value: s.slice(0, i), unit: s.slice(i + 1) };
}

export function formatNumber(n: number): string {
  return nf0.format(n);
}

export function formatPercent(fraction: number, decimals = 0): string {
  const v = fraction * 100;
  return `${decimals ? v.toFixed(decimals).replace('.', ',') : Math.round(v)}%`;
}

const dtf = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const df = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const dLong = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
const monthFmt = new Intl.DateTimeFormat('pt-BR', { month: 'short' });

/** Data e hora como na coluna "Data de modificação" do Explorer. */
export function formatDate(ms: number): string {
  if (!ms) return '—';
  return dtf.format(ms).replace(',', '');
}

export function formatDay(ms: number): string {
  if (!ms) return '—';
  return df.format(ms);
}

export function formatLongDay(ms: number): string {
  const s = dLong.format(ms);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatMonth(ms: number): string {
  return monthFmt.format(ms).replace('.', '');
}

/** "agora", "há 5 min", "ontem", "há 3 meses"... */
export function formatRelative(ms: number, now = Date.now()): string {
  if (!ms) return 'nunca';
  const diff = Math.max(0, now - ms);
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (diff < min) return 'agora';
  if (diff < hour) return `há ${Math.floor(diff / min)} min`;
  if (diff < day) return `há ${Math.floor(diff / hour)} h`;
  if (diff < 2 * day) return 'ontem';
  if (diff < 30 * day) return `há ${Math.floor(diff / day)} dias`;
  if (diff < 365 * day) {
    const m = Math.floor(diff / (30 * day));
    return m <= 1 ? 'há 1 mês' : `há ${m} meses`;
  }
  const y = Math.floor(diff / (365 * day));
  return y <= 1 ? 'há 1 ano' : `há ${y} anos`;
}

/** Duração a partir de segundos: "3 d 4 h", "5 h 12 min", "42 s". */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return h ? `${d} d ${h} h` : `${d} d`;
  if (h > 0) return m ? `${h} h ${m} min` : `${h} h`;
  if (m > 0) return `${m} min`;
  return `${s} s`;
}

export function formatElapsed(ms: number): string {
  if (ms < 1000) return `${Math.max(1, Math.round(ms))} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
  return formatDuration(ms / 1000);
}

export function plural(n: number, singular: string, pluralForm: string): string {
  return `${formatNumber(n)} ${n === 1 ? singular : pluralForm}`;
}

export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h >= 5 && h < 12) return 'Bom dia';
  if (h >= 12 && h < 18) return 'Boa tarde';
  return 'Boa noite';
}

/* ───────────── Caminhos (Windows e Unix) ───────────── */

export function pathSep(path: string): string {
  return path.includes('\\') || /^[A-Za-z]:/.test(path) ? '\\' : '/';
}

export function basename(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '');
  if (/^[A-Za-z]:$/.test(trimmed)) return `${trimmed}\\`;
  const i = Math.max(trimmed.lastIndexOf('\\'), trimmed.lastIndexOf('/'));
  return i >= 0 ? trimmed.slice(i + 1) || trimmed : trimmed;
}

export function dirname(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '');
  const i = Math.max(trimmed.lastIndexOf('\\'), trimmed.lastIndexOf('/'));
  if (i < 0) return '';
  const parent = trimmed.slice(0, i);
  if (/^[A-Za-z]:$/.test(parent)) return `${parent}\\`;
  return parent || '/';
}

export function joinPath(dir: string, name: string): string {
  const sep = pathSep(dir);
  return dir.endsWith('\\') || dir.endsWith('/') ? `${dir}${name}` : `${dir}${sep}${name}`;
}

export interface Crumb {
  label: string;
  path: string;
}

/** Segmentos clicáveis do caminho (barra de endereço). */
export function pathCrumbs(path: string): Crumb[] {
  if (!path) return [];
  const sep = pathSep(path);
  if (sep === '\\') {
    const m = /^([A-Za-z]:)\\?(.*)$/.exec(path);
    if (m) {
      const root = `${m[1]}\\`;
      const parts = m[2].split('\\').filter(Boolean);
      const crumbs: Crumb[] = [{ label: `${m[1].toUpperCase()}`, path: root }];
      let acc = root;
      for (const p of parts) {
        acc = acc.endsWith('\\') ? `${acc}${p}` : `${acc}\\${p}`;
        crumbs.push({ label: p, path: acc });
      }
      return crumbs;
    }
    const parts = path.split('\\').filter(Boolean);
    let acc = '\\\\';
    return parts.map((p, i) => {
      acc = i === 0 ? `\\\\${p}` : `${acc}\\${p}`;
      return { label: p, path: acc };
    });
  }
  const parts = path.split('/').filter(Boolean);
  const crumbs: Crumb[] = [{ label: '/', path: '/' }];
  let acc = '';
  for (const p of parts) {
    acc = `${acc}/${p}`;
    crumbs.push({ label: p, path: acc });
  }
  return crumbs;
}

/** Compara caminhos ignorando maiúsculas no Windows e barras finais. */
export function samePath(a: string, b: string): boolean {
  const n = (p: string) => p.replace(/[\\/]+$/, '').replace(/\//g, '\\').toLowerCase();
  return n(a) === n(b);
}

export function isInside(child: string, parent: string): boolean {
  const n = (p: string) => p.replace(/[\\/]+$/, '').replace(/\//g, '\\').toLowerCase();
  const c = n(child);
  const p = n(parent);
  return c === p || c.startsWith(`${p}\\`);
}
