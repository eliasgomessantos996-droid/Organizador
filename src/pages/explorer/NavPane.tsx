import { FileIcon } from '../../components/FileIcon';
import { Icon } from '../../components/Icon';
import { Meter } from '../../components/ui/controls';
import { openContextMenu } from '../../components/ui/Menu';
import { basename, samePath } from '../../lib/format';
import { go } from '../../store/nav';
import { quickPlaces, usePlaces } from '../../store/places';
import { useSettings } from '../../store/settings';
import type { DriveInfo } from '../../lib/types';

export function driveLabel(d: DriveInfo): string {
  const letter = d.mount.replace(/\\$/, '');
  const name = d.label || (d.removable ? 'Unidade removível' : 'Disco Local');
  return /^[A-Za-z]:$/.test(letter) ? `${name} (${letter})` : `${name} (${d.mount})`;
}

export function driveUsage(d: DriveInfo) {
  const used = d.total - d.free;
  const freePct = d.total ? d.free / d.total : 1;
  const status = freePct < 0.1 ? 'critical' : freePct < 0.2 ? 'warning' : 'ok';
  return { used, fraction: d.total ? used / d.total : 0, freePct, status } as const;
}

export function driveColor(status: 'critical' | 'warning' | 'ok') {
  return status === 'critical' ? 'var(--status-critical)' : status === 'warning' ? 'var(--status-warning)' : 'var(--series-1)';
}

/** Painel de navegação do Explorador (Acesso rápido, Favoritos, Unidades). */
export function NavPane({ current, onOpen }: { current: string; onOpen: (path: string) => void }) {
  const special = usePlaces((s) => s.special);
  const drives = usePlaces((s) => s.drives);
  const favorites = useSettings((s) => s.favorites);
  const toggleFavorite = useSettings((s) => s.toggleFavorite);

  const item = (key: string, path: string, label: string, icon: React.ReactNode, opts: { drop?: boolean; extra?: React.ReactNode; menu?: (e: React.MouseEvent) => void } = {}) => {
    const active = path === '' ? current === '' : samePath(current, path);
    return (
      <button
        key={key}
        type="button"
        className={`np-item anim-hover ${active ? 'active' : ''}`}
        onClick={() => onOpen(path)}
        data-drop-path={opts.drop && path ? path : undefined}
        data-drop-name={label}
        onContextMenu={opts.menu}
        data-tip={path || undefined}
      >
        <span className="np-icon">{icon}</span>
        <span className="np-text">
          <span className="truncate">{label}</span>
          {opts.extra}
        </span>
      </button>
    );
  };

  return (
    <aside className="nav-pane" aria-label="Locais">
      {item('pc', '', 'Este computador', <Icon name="monitor" size={17} />)}

      <div className="np-label">Acesso rápido</div>
      {quickPlaces(special).map((q) =>
        item(q.key, q.path, q.label, <FileIcon category="folder" special={q.key} size={18} />, {
          drop: true,
          menu: (e) =>
            openContextMenu(e, [
              { label: 'Abrir', icon: 'folder-open', onSelect: () => onOpen(q.path) },
              { label: 'Destrinchar no Organizador', icon: 'layers', onSelect: () => go('organizador', { paths: [q.path], autoStart: true }) },
              { label: 'Analisar espaço', icon: 'treemap', onSelect: () => go('mapa', { path: q.path, autoStart: true }) },
            ]),
        }),
      )}

      {favorites.length ? (
        <>
          <div className="np-label">Favoritos</div>
          {favorites.map((f) =>
            item(`fav-${f}`, f, basename(f), <Icon name="star" size={16} className="np-star" />, {
              drop: true,
              menu: (e) =>
                openContextMenu(e, [
                  { label: 'Abrir', icon: 'folder-open', onSelect: () => onOpen(f) },
                  { label: 'Remover dos favoritos', icon: 'x', onSelect: () => toggleFavorite(f) },
                ]),
            }),
          )}
        </>
      ) : null}

      <div className="np-label">Unidades</div>
      {drives.map((d) => {
        const u = driveUsage(d);
        return item(`drv-${d.mount}`, d.mount, driveLabel(d), <Icon name={d.removable ? 'usb' : 'hard-drive'} size={17} />, {
          drop: true,
          extra: (
            <span className="np-meter">
              <Meter value={u.fraction} color={driveColor(u.status)} height={3} label={`${Math.round(u.fraction * 100)}% usado`} />
            </span>
          ),
        });
      })}

      <div className="np-sep" />
      <button type="button" className="np-item anim-hover" onClick={() => go('limpeza', { tab: 'lixeira' })}>
        <span className="np-icon">
          <Icon name="trash" size={17} />
        </span>
        <span className="np-text">
          <span className="truncate">Lixeira</span>
        </span>
      </button>
    </aside>
  );
}
