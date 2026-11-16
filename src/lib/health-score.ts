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
