import { ScoreRing } from './ScoreRing';
import { useHealth } from '../store/health';
import { useNav } from '../store/nav';
import { bandOf } from '../lib/health-score';

/** Resumo da saúde do PC no rodapé do menu lateral. */
export function HealthMini({ collapsed }: { collapsed: boolean }) {
  const score = useHealth((s) => s.score);
  const go = useNav((s) => s.go);
  const band = score === null ? null : bandOf(score);
  return (
    <button type="button" className="health-mini" onClick={() => go('saude')} data-tip={collapsed ? 'Saúde do PC' : undefined}>
      <ScoreRing score={score} size={34} stroke={4} compact />
      <div className="health-mini-text">
        <div style={{ fontWeight: 650, fontSize: 12.5 }}>Saúde do PC</div>
        <div className="faint" style={{ fontSize: 12 }}>
          {band ? `${Math.round(score ?? 0)}% · ${band.label}` : 'Analisando…'}
        </div>
      </div>
    </button>
  );
}
