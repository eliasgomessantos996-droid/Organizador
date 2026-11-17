import type { ReactNode } from 'react';
import { Icon, type IconName } from '../Icon';

/** Cabeçalho padrão das páginas: ícone animado, título, descrição e ações. */
export function PageHeader({
  icon,
  title,
  subtitle,
  actions,
  playing,
}: {
  icon: IconName;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  playing?: boolean;
}) {
  return (
    <div className="page-header">
      <div className="page-header-icon anim-hover">
        <Icon name={icon} size={22} className={playing ? 'playing' : undefined} />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <h1 className="page-title">{title}</h1>
        {subtitle ? <div className="page-subtitle">{subtitle}</div> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  );
}
