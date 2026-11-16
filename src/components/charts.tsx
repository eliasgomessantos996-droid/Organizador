import type { ReactNode } from 'react';
import { motion } from 'motion/react';

/**
 * Gráficos simples seguindo o guia de visualização:
 * - barra segmentada fina (parte do todo) com 2px de espaço entre partes,
 *   sempre acompanhada de uma lista com nomes e valores (legenda + tabela);
 * - lista de medidores: nome, barra e valor por linha, uma única cor.
 */

export interface Part {
  id: string;
  label: string;
  value: number;
  color: string;
  display?: string;
}

export function SegmentedBar({ parts, height = 10, onSelect }: { parts: Part[]; height?: number; onSelect?: (id: string) => void }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (!total) return <div className="seg-bar empty" style={{ height }} />;
  return (
    <div className="seg-bar" style={{ height }} role="img" aria-label={parts.map((p) => `${p.label}: ${p.display ?? p.value}`).join(', ')}>
      {parts
        .filter((p) => p.value > 0)
        .map((p) => (
          <motion.button
            key={p.id}
            type="button"
            className="seg-part"
            style={{ background: p.color }}
            initial={{ flexGrow: 0 }}
            animate={{ flexGrow: p.value / total }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            data-tip={`${p.label}: ${p.display ?? p.value} (${Math.round((p.value / total) * 100)}%)`}
            onClick={() => onSelect?.(p.id)}
            tabIndex={-1}
          />
        ))}
    </div>
  );
}

export interface MeterRow {
  id: string;
  label: ReactNode;
  value: number;
  display: string;
  sub?: string;
  color?: string;
  swatch?: string;
  title?: string;
}

/** Lista de medidores alinhados (ranking). */
export function MeterList({
  rows,
  onSelect,
  selected,
  max,
}: {
  rows: MeterRow[];
  onSelect?: (id: string) => void;
  selected?: string | string[] | null;
  max?: number;
}) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  const isSel = (id: string) => (Array.isArray(selected) ? selected.includes(id) : selected === id);
  return (
    <div className="meter-list" role="list">
      {rows.map((r, i) => (
        <button
          key={r.id}
          type="button"
          role="listitem"
          className={`ml-row ${isSel(r.id) ? 'selected' : ''} ${onSelect ? 'clickable' : ''}`}
          onClick={() => onSelect?.(r.id)}
          data-tip={r.title}
        >
          <div className="ml-head">
            {r.swatch ? <span className="chip-swatch" style={{ background: r.swatch }} /> : null}
            <span className="ml-label truncate">{r.label}</span>
            <span className="ml-value tabular">{r.display}</span>
          </div>
          <div className="ml-track">
            <motion.div
              className="ml-fill"
              style={{ background: r.color ?? 'var(--series-1)' }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(r.value > 0 ? 1.5 : 0, (r.value / top) * 100)}%` }}
              transition={{ duration: 0.55, delay: i * 0.025, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
          {r.sub ? <div className="ml-sub truncate">{r.sub}</div> : null}
        </button>
      ))}
    </div>
  );
}
