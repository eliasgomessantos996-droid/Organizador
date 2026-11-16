import { Icon, type IconName } from './Icon';
import { Logo } from './Logo';
import { Modal } from './ui/Modal';
import { useSettings } from '../store/settings';
import type { ThemeId } from '../lib/theme';

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: 'folder-open', title: 'Explore e organize', text: 'Um explorador de arquivos completo, com visão destrinchada de várias pastas e regras automáticas.' },
  { icon: 'broom', title: 'Limpe e otimize', text: 'One Click Optimize, Lixeira, duplicados, arquivos esquecidos e programas de inicialização.' },
  { icon: 'heart-pulse', title: 'Acompanhe a saúde', text: 'Nota de 0 a 100% para disco, memória e processador, com dicas do que melhorar.' },
  { icon: 'wifi-off', title: '100% off-line', text: 'Nada sai do seu computador. Exclusões vão para a Lixeira e você sempre vê uma prévia.' },
];

const QUICK: { id: ThemeId; label: string; bg: string; fg: string }[] = [
  { id: 'sistema', label: 'Sistema', bg: 'linear-gradient(135deg,#e9eef5 50%,#0d121b 50%)', fg: '#2dd4bf' },
  { id: 'claro', label: 'Claro', bg: '#f5f7fb', fg: '#0d857a' },
  { id: 'escuro', label: 'Escuro', bg: '#0d121b', fg: '#2dd4bf' },
  { id: 'oceano', label: 'Oceano', bg: '#061523', fg: '#38bdf8' },
];

/** Boas-vindas na primeira abertura. */
export function Welcome() {
  const seen = useSettings((s) => s.welcomeSeen);
  const theme = useSettings((s) => s.theme);
  const set = useSettings((s) => s.set);
  return (
    <Modal open={!seen} onClose={() => set({ welcomeSeen: true })} width="wide">
      <div className="welcome">
        <div className="welcome-hero">
          <Logo size={84} animated twinkle />
          <h2 className="welcome-title">Bem-vindo ao Organizador</h2>
          <p className="muted">Seu computador em ordem: arquivos organizados, espaço livre e desempenho em dia.</p>
        </div>
        <div className="welcome-features">
          {FEATURES.map((f) => (
            <div key={f.title} className="welcome-feature anim-hover">
              <div className="icon-tile">
                <Icon name={f.icon} size={19} />
              </div>
              <div>
                <div style={{ fontWeight: 650 }}>{f.title}</div>
                <div className="muted" style={{ fontSize: 12.5 }}>
                  {f.text}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="welcome-themes">
          <span className="field-label">Escolha um tema (dá para trocar depois):</span>
          <div className="row" style={{ gap: 8 }}>
            {QUICK.map((q) => (
              <button key={q.id} type="button" className={`welcome-theme ${theme === q.id ? 'active' : ''}`} onClick={() => set({ theme: q.id })}>
                <span className="welcome-swatch" style={{ background: q.bg }}>
                  <span style={{ background: q.fg }} />
                </span>
                {q.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="dialog-footer">
        <button type="button" className="btn btn-primary btn-lg" onClick={() => set({ welcomeSeen: true })} data-autofocus>
          Começar
          <Icon name="arrow-right" size={17} />
        </button>
      </div>
    </Modal>
  );
}
