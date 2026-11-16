import type { IconName } from '../components/Icon';

/**
 * Faixas da nota de saúde (0–100). 100% = Perfeito, 0% = Muito ruim!
 * As cores são as de status (fixas) e sempre vêm com ícone + rótulo.
 */

export type Status = 'good' | 'warning' | 'serious' | 'critical';

export interface ScoreBand {
  min: number;
  label: string;
  status: Status;
}

export const BANDS: ScoreBand[] = [
  { min: 95, label: 'Perfeito', status: 'good' },
  { min: 80, label: 'Ótimo', status: 'good' },
  { min: 65, label: 'Bom', status: 'good' },
  { min: 45, label: 'Regular', status: 'warning' },
  { min: 25, label: 'Ruim', status: 'serious' },
  { min: 0, label: 'Muito ruim!', status: 'critical' },
];

export function bandOf(score: number): ScoreBand {
  const s = Math.max(0, Math.min(100, score));
  return BANDS.find((b) => s >= b.min) ?? BANDS[BANDS.length - 1];
}

export const STATUS_COLOR: Record<Status, string> = {
  good: 'var(--status-good)',
  warning: 'var(--status-warning)',
  serious: 'var(--status-serious)',
  critical: 'var(--status-critical)',
};

export const STATUS_ICON: Record<Status, IconName> = {
  good: 'check-circle',
  warning: 'alert-triangle',
  serious: 'alert-circle',
  critical: 'x-circle',
};

export const STATUS_BADGE: Record<Status, string> = {
  good: 'badge-good',
  warning: 'badge-warning',
  serious: 'badge-serious',
  critical: 'badge-critical',
};

/* ═════════════════════ Cálculo da nota ═════════════════════
 * Cada métrica vira uma nota de 0 a 100 por interpolação linear entre
 * pontos de referência. A nota geral é a média ponderada:
 *   Disco 30% · Memória 25% · Processador 20% · Lixo 15% · Inicialização 10%
 */

const GB = 1024 ** 3;

/** Interpolação linear por partes: pontos [x, nota] em ordem crescente de x. */
export function piecewise(x: number, points: [number, number][]): number {
  if (!Number.isFinite(x)) return points[0][1];
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    if (x <= x1) {
      const [x0, y0] = points[i - 1];
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return points[points.length - 1][1];
}

/** Uso médio do processador (%). */
export const scoreCpu = (pct: number) =>
  piecewise(pct, [
    [0, 100],
    [30, 100],
    [60, 78],
    [85, 45],
    [100, 10],
  ]);

/** Memória em uso (%). */
export const scoreMemory = (pct: number) =>
  piecewise(pct, [
    [0, 100],
    [50, 100],
    [70, 82],
    [85, 55],
    [95, 22],
    [100, 5],
  ]);

/** Espaço livre em um disco (% livre e bytes livres). */
export function scoreDisk(freePct: number, freeBytes: number, isSystem: boolean): number {
  let s = piecewise(freePct, [
    [0, 0],
    [5, 25],
    [10, 50],
    [15, 68],
    [20, 80],
    [30, 100],
  ]);
  // O disco do Windows precisa de folga absoluta para atualizações e memória virtual.
  if (isSystem && freeBytes < 5 * GB) s = Math.min(s, 20);
  else if (isSystem && freeBytes < 10 * GB) s = Math.min(s, 40);
  return s;
}

/** Arquivos desnecessários (Lixeira + temporários), em bytes. */
export const scoreJunk = (bytes: number) =>
  piecewise(bytes / GB, [
    [0, 100],
    [0.5, 100],
    [2, 85],
    [5, 65],
    [10, 45],
    [20, 25],
    [50, 10],
  ]);

/** Programas ativos na inicialização. */
export const scoreStartup = (n: number) =>
  piecewise(n, [
    [0, 100],
    [5, 100],
    [10, 82],
    [15, 62],
    [25, 35],
    [40, 15],
  ]);

export type MetricId = 'disco' | 'memoria' | 'cpu' | 'lixo' | 'inicializacao';

export interface MetricScore {
  id: MetricId;
  label: string;
  score: number;
  weight: number;
  detail: string;
}

export interface HealthInputs {
  cpuPct: number;
  memPct: number;
  disks: { mount: string; total: number; free: number; isSystem: boolean; removable: boolean }[];
  junkBytes: number | null;
  startupEnabled: number | null;
}

export const WEIGHTS: Record<MetricId, number> = { disco: 0.3, memoria: 0.25, cpu: 0.2, lixo: 0.15, inicializacao: 0.1 };

/** Nota dos discos: o disco do sistema pesa 70% e os demais fixos, 30%. */
export function diskScore(disks: HealthInputs['disks']): { score: number; worst: string | null } {
  const fixed = disks.filter((d) => !d.removable && d.total > 0);
  if (!fixed.length) return { score: 100, worst: null };
  const scored = fixed.map((d) => ({ d, s: scoreDisk((d.free / d.total) * 100, d.free, d.isSystem) }));
  const sys = scored.find((x) => x.d.isSystem);
  const others = scored.filter((x) => x !== sys);
  const avgOthers = others.length ? others.reduce((a, x) => a + x.s, 0) / others.length : null;
  let score: number;
  if (sys && avgOthers !== null) score = sys.s * 0.7 + avgOthers * 0.3;
  else if (sys) score = sys.s;
  else score = avgOthers ?? 100;
  const worst = scored.reduce((w, x) => (x.s < w.s ? x : w), scored[0]);
  return { score, worst: worst.s < 80 ? worst.d.mount : null };
}

export function computeHealth(i: HealthInputs): { score: number; metrics: MetricScore[] } {
  const disk = diskScore(i.disks);
  const metrics: MetricScore[] = [
    { id: 'disco', label: 'Espaço em disco', score: disk.score, weight: WEIGHTS.disco, detail: disk.worst ? `Pouco espaço em ${disk.worst}` : 'Espaço suficiente' },
    { id: 'memoria', label: 'Memória RAM', score: scoreMemory(i.memPct), weight: WEIGHTS.memoria, detail: `${Math.round(i.memPct)}% em uso` },
    { id: 'cpu', label: 'Processador', score: scoreCpu(i.cpuPct), weight: WEIGHTS.cpu, detail: `${Math.round(i.cpuPct)}% de uso médio` },
  ];
  if (i.junkBytes !== null)
    metrics.push({ id: 'lixo', label: 'Arquivos desnecessários', score: scoreJunk(i.junkBytes), weight: WEIGHTS.lixo, detail: `${(i.junkBytes / GB).toFixed(1).replace('.', ',')} GB de lixo` });
  if (i.startupEnabled !== null)
    metrics.push({
      id: 'inicializacao',
      label: 'Inicialização',
      score: scoreStartup(i.startupEnabled),
      weight: WEIGHTS.inicializacao,
      detail: `${i.startupEnabled} ${i.startupEnabled === 1 ? 'programa' : 'programas'} ao ligar`,
    });
  // Pesos de métricas ainda desconhecidas são redistribuídos.
  const totalW = metrics.reduce((s, m) => s + m.weight, 0);
  const score = metrics.reduce((s, m) => s + m.score * (m.weight / totalW), 0);
  return { score: Math.round(Math.max(0, Math.min(100, score))), metrics };
}
