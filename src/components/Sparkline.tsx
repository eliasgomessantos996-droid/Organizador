import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { Sample } from '../store/health';

interface SparklineProps {
  data: Sample[];
  max?: number;
  height?: number;
  color?: string;
  format?: (v: number) => string;
  label: string;
  capacity?: number;
}

/**
 * Linha do tempo de uma única série (uso de CPU, memória...).
 * Traço de 2 px, área suave, sem eixos; mira + dica ao passar o mouse.
 */
export function Sparkline({ data, max = 100, height = 56, color = 'var(--series-1)', format = (v) => `${Math.round(v)}%`, label, capacity = 60 }: SparklineProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(240);
  const [hover, setHover] = useState<number | null>(null);
  const gid = useId().replace(/:/g, '');

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const pad = 3;
  const n = Math.max(capacity, data.length);
  const step = (w - pad * 2) / Math.max(1, n - 1);
  const offset = n - data.length;
  const x = (i: number) => pad + (i + offset) * step;
  const y = (v: number) => pad + (1 - Math.max(0, Math.min(max, v)) / max) * (height - pad * 2);
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(d.v).toFixed(1)}`).join('');
  const area = data.length ? `${line}L${x(data.length - 1).toFixed(1)} ${height - pad}L${x(0).toFixed(1)} ${height - pad}Z` : '';
  const h = hover !== null ? data[hover] : null;

  return (
    <div
      ref={ref}
      className="sparkline"
      style={{ height }}
      onPointerMove={(e) => {
        if (!data.length) return;
        const r = e.currentTarget.getBoundingClientRect();
        const i = Math.round((e.clientX - r.left - pad) / step) - offset;
        setHover(Math.max(0, Math.min(data.length - 1, i)));
      }}
      onPointerLeave={() => setHover(null)}
      role="img"
      aria-label={`${label}: ${data.length ? format(data[data.length - 1].v) : 'sem dados'}`}
    >
      <svg width={w} height={height} aria-hidden>
        <defs>
          <linearGradient id={`spark-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.22" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={pad} x2={w - pad} y1={height - pad} y2={height - pad} stroke="var(--grid)" strokeWidth="1" />
        {area ? <path d={area} fill={`url(#spark-${gid})`} /> : null}
        {line ? <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" /> : null}
        {data.length ? <circle cx={x(data.length - 1)} cy={y(data[data.length - 1].v)} r="3.2" fill={color} stroke="var(--chart-surface)" strokeWidth="2" /> : null}
        {h && hover !== null ? (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={pad} y2={height - pad} stroke="var(--axis)" strokeWidth="1" />
            <circle cx={x(hover)} cy={y(h.v)} r="4" fill={color} stroke="var(--chart-surface)" strokeWidth="2" />
          </>
        ) : null}
      </svg>
      {h && hover !== null ? (
        <div className="spark-tip" style={{ left: Math.min(Math.max(x(hover), 40), w - 40) }}>
          <strong>{format(h.v)}</strong>
          <span>{Math.max(0, Math.round((Date.now() - h.t) / 1000))} s atrás</span>
        </div>
      ) : null}
    </div>
  );
}
