import { motion } from 'motion/react';
import { Icon, type IconName } from '../Icon';
import { useNav, type PageId } from '../../store/nav';
import { useSettings } from '../../store/settings';
import { HealthMini } from '../HealthMini';

interface NavItem {
  id: PageId;
  label: string;
  icon: IconName;
}

export const NAV_SECTIONS: { title: string | null; items: NavItem[] }[] = [
  { title: null, items: [{ id: 'inicio', label: 'Início', icon: 'home' }] },
  {
    title: 'Arquivos',
    items: [
      { id: 'explorador', label: 'Explorador', icon: 'folder-open' },
      { id: 'organizador', label: 'Organizador', icon: 'layers' },
      { id: 'duplicados', label: 'Duplicados', icon: 'copies' },
      { id: 'mapa', label: 'Mapa de espaço', icon: 'treemap' },
      { id: 'regras', label: 'Regras automáticas', icon: 'wand' },
    ],
  },
  {
    title: 'Otimização',
    items: [
      { id: 'otimizar', label: 'One Click Optimize', icon: 'bolt' },
      { id: 'limpeza', label: 'Limpeza', icon: 'broom' },
      { id: 'saude', label: 'Saúde do PC', icon: 'heart-pulse' },
      { id: 'inicializacao', label: 'Inicialização e apps', icon: 'rocket' },
    ],
  },
];

export const NAV_FOOTER: NavItem[] = [
  { id: 'historico', label: 'Histórico', icon: 'history' },
  { id: 'configuracoes', label: 'Configurações', icon: 'settings' },
];

export const ALL_NAV: NavItem[] = [...NAV_SECTIONS.flatMap((s) => s.items), ...NAV_FOOTER];

const spring = { type: 'spring' as const, stiffness: 480, damping: 38 };

function NavButton({ item, active, collapsed }: { item: NavItem; active: boolean; collapsed: boolean }) {
  const go = useNav((s) => s.go);
  return (
    <button
      type="button"
      className={`nav-item anim-hover ${active ? 'active' : ''}`}
      onClick={() => go(item.id)}
      aria-current={active ? 'page' : undefined}
      data-tip={collapsed ? item.label : undefined}
    >
      <span className="nav-hover" />
      {active ? (
        <>
          <motion.span layoutId="nav-active-bg" className="nav-active-bg" transition={spring} />
          <motion.span layoutId="nav-active-bar" className="nav-active-bar" transition={spring} />
        </>
      ) : null}
      <span className="nav-icon">
        <Icon name={item.icon} size={19} className={active ? 'active' : undefined} />
      </span>
      <span className="nav-text">{item.label}</span>
    </button>
  );
}

export function Sidebar() {
  const page = useNav((s) => s.page);
  const collapsed = useSettings((s) => s.sidebarCollapsed);
  return (
    <nav className="sidebar" aria-label="Navegação principal">
      <div className="sidebar-scroll">
        {NAV_SECTIONS.map((section, i) => (
          <div className="sidebar-section" key={i}>
            {section.title ? <div className="sidebar-label">{section.title}</div> : null}
            {section.items.map((item) => (
              <NavButton key={item.id} item={item} active={page === item.id} collapsed={collapsed} />
            ))}
          </div>
        ))}
      </div>
      <div className="sidebar-footer">
        <HealthMini collapsed={collapsed} />
        {NAV_FOOTER.map((item) => (
          <NavButton key={item.id} item={item} active={page === item.id} collapsed={collapsed} />
        ))}
      </div>
    </nav>
  );
}
