import { motion } from 'motion/react';
import { Icon, type IconName } from '../components/Icon';
import { Logo } from '../components/Logo';
import { go, type PageId } from '../store/nav';
import { formatLongDay, greeting } from '../lib/format';

const ACTIONS: { page: PageId; icon: IconName; title: string; text: string }[] = [
  { page: 'explorador', icon: 'folder-open', title: 'Explorar arquivos', text: 'Navegue, copie, mova e exclua como no Explorer.' },
  { page: 'organizador', icon: 'layers', title: 'Organizar pastas', text: 'Veja todos os arquivos de várias pastas em uma lista só.' },
  { page: 'limpeza', icon: 'broom', title: 'Limpeza', text: 'Temporários, caches, Lixeira e arquivos esquecidos.' },
  { page: 'duplicados', icon: 'copies', title: 'Duplicados', text: 'Encontre arquivos idênticos e libere espaço.' },
  { page: 'mapa', icon: 'treemap', title: 'Mapa de espaço', text: 'Descubra o que ocupa mais espaço no disco.' },
  { page: 'saude', icon: 'heart-pulse', title: 'Saúde do PC', text: 'CPU, memória e discos com nota de 0 a 100%.' },
];

const container = { animate: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } } };
const item = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] as const } } };

export function Inicio() {
  return (
    <div className="page-scroll">
      <motion.div variants={container} initial="initial" animate="animate">
        <motion.section variants={item} className="card home-hero">
          <div className="home-hero-glow" />
          <Logo size={72} animated twinkle />
          <div style={{ position: 'relative', minWidth: 0 }}>
            <div className="faint" style={{ fontWeight: 600 }}>
              {formatLongDay(Date.now())}
            </div>
            <h1 className="home-title">{greeting()}! Vamos deixar seu PC em ordem?</h1>
            <p className="muted" style={{ marginTop: 6, maxWidth: 560 }}>
              Organize pastas, encontre o que ocupa espaço e limpe o que não serve mais. Tudo off-line, direto no seu
              computador.
            </p>
          </div>
          <button type="button" className="btn btn-primary btn-xl anim-hover home-hero-cta" onClick={() => go('otimizar')}>
            <Icon name="bolt" size={20} />
            One Click Optimize
          </button>
        </motion.section>

        <motion.div variants={item} className="section-label" style={{ margin: '26px 0 12px' }}>
          Atalhos
        </motion.div>
        <div className="grid-3">
          {ACTIONS.map((a) => (
            <motion.button
              key={a.page}
              variants={item}
              type="button"
              className="card card-pad card-hover anim-hover home-action"
              onClick={() => go(a.page)}
            >
              <div className="icon-tile icon-tile-lg">
                <Icon name={a.icon} size={24} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="card-title">{a.title}</div>
                <div className="card-subtitle" style={{ marginTop: 3 }}>
                  {a.text}
                </div>
              </div>
              <Icon name="chevron-right" size={18} className="home-action-arrow" />
            </motion.button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
