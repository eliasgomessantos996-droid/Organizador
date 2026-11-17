import { AnimatedNumber } from './ui/controls';
import { Icon } from './Icon';
import { bandOf, STATUS_COLOR, STATUS_ICON } from '../lib/health-score';

interface ScoreRingProps {
  score: number | null;
  size?: number;
  stroke?: number;
  /** Mostra número e rótulo no centro. */
  showText?: boolean;
  compact?: boolean;
}

/**
 * Medidor circular da nota de saúde: trilho neutro + arco na cor de status,
 * com o número em destaque e o rótulo acompanhado de ícone (nunca só a cor).
 */
export function ScoreRing({ score, size = 180, stroke = 12, showText = true, compact }: ScoreRingProps) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const value = score ?? 0;
  const band = bandOf(value);
  const color = score === null ? 'var(--border-strong)' : STATUS_COLOR[band.status];
  const offset = c * (1 - Math.max(0, Math.min(100, value)) / 100);
  return (
    <div className="score-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
        <circle
          className="score-ring-arc"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={score === null ? c * 0.75 : offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={score === null ? { animation: 'org-spin 1.2s linear infinite', transformOrigin: 'center' } : undefined}
        />
      </svg>
      {showText ? (
        <div className="score-ring-text" role="img" aria-label={score === null ? 'Calculando a nota' : `Nota ${Math.round(value)} de 100: ${band.label}`}>
          {compact ? (
            <span className="score-ring-num-sm">{score === null ? '…' : <AnimatedNumber value={value} />}</span>
          ) : (
            <>
              <span className="score-ring-num">
                {score === null ? '—' : <AnimatedNumber value={value} />}
                {score !== null ? <span className="score-ring-pct">%</span> : null}
              </span>
              <span className="score-ring-label" style={{ color: score === null ? 'var(--text-3)' : undefined }}>
                {score === null ? (
                  'Calculando…'
                ) : (
                  <>
                    <Icon name={STATUS_ICON[band.status]} size={14} style={{ color }} />
                    {band.label}
                  </>
                )}
              </span>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
