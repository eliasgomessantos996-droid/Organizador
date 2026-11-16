import { motion } from 'motion/react';
import { FileIcon } from '../../components/FileIcon';
import { Icon } from '../../components/Icon';
import { Meter } from '../../components/ui/controls';
import { openContextMenu } from '../../components/ui/Menu';
import { formatBytes, formatPercent } from '../../lib/format';
import { go } from '../../store/nav';
import { quickPlaces, usePlaces } from '../../store/places';
import { driveColor, driveLabel, driveUsage } from './NavPane';

const list = { animate: { transition: { staggerChildren: 0.04 } } };
const item = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const } } };

/** Visão "Este computador": pastas do usuário e unidades com uso de espaço. */
export function ThisPC({ onOpen }: { onOpen: (path: string) => void }) {
  const special = usePlaces((s) => s.special);
  const drives = usePlaces((s) => s.drives);

  return (
    <div className="this-pc">
      <div className="section-label" style={{ marginBottom: 10 }}>
        Pastas
      </div>
      <motion.div className="pc-folders" variants={list} initial="initial" animate="animate">
        {quickPlaces(special).map((q) => (
          <motion.button
            key={q.key}
            variants={item}
            type="button"
            className="pc-folder card-hover"
            onDoubleClick={() => onOpen(q.path)}
            onClick={() => onOpen(q.path)}
            data-drop-path={q.path}
            data-drop-name={q.label}
            onContextMenu={(e) =>
              openContextMenu(e, [
                { label: 'Abrir', icon: 'folder-open', onSelect: () => onOpen(q.path) },
                { label: 'Destrinchar no Organizador', icon: 'layers', onSelect: () => go('organizador', { paths: [q.path], autoStart: true }) },
                { label: 'Analisar espaço', icon: 'treemap', onSelect: () => go('mapa', { path: q.path, autoStart: true }) },
                { label: 'Procurar duplicados', icon: 'copies', onSelect: () => go('duplicados', { paths: [q.path], autoStart: true }) },
              ])
            }
          >
            <FileIcon category="folder" special={q.key} size={40} />
            <div style={{ minWidth: 0 }}>
              <div className="truncate" style={{ fontWeight: 600 }}>
                {q.label}
              </div>
              <div className="truncate faint" style={{ fontSize: 12 }}>
                {q.path}
              </div>
            </div>
          </motion.button>
        ))}
      </motion.div>

      <div className="section-label" style={{ margin: '26px 0 10px' }}>
        Dispositivos e unidades
      </div>
      <motion.div className="pc-drives" variants={list} initial="initial" animate="animate">
        {drives.map((d) => {
          const u = driveUsage(d);
          return (
            <motion.div
              key={d.mount}
              variants={item}
              className="pc-drive card card-hover anim-hover"
              role="button"
              tabIndex={0}
              onClick={() => onOpen(d.mount)}
              onKeyDown={(e) => e.key === 'Enter' && onOpen(d.mount)}
              data-drop-path={d.mount}
              data-drop-name={driveLabel(d)}
              onContextMenu={(e) =>
                openContextMenu(e, [
                  { label: 'Abrir', icon: 'folder-open', onSelect: () => onOpen(d.mount) },
                  { label: 'Analisar espaço desta unidade', icon: 'treemap', onSelect: () => go('mapa', { path: d.mount, autoStart: true }) },
                  { label: 'Limpeza', icon: 'broom', onSelect: () => go('limpeza') },
                ])
              }
            >
              <div className="pc-drive-icon">
                <Icon name={d.removable ? 'usb' : 'hard-drive'} size={26} strokeWidth={1.5} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row" style={{ gap: 8 }}>
                  <span className="truncate" style={{ fontWeight: 650 }}>
                    {driveLabel(d)}
                  </span>
                  {d.isSystem ? <span className="badge">Sistema</span> : null}
                  {d.kind !== 'desconhecido' ? <span className="badge">{d.kind.toUpperCase()}</span> : null}
                  {d.removable ? <span className="badge badge-info">Removível</span> : null}
                </div>
                <div style={{ margin: '10px 0 7px' }}>
                  <Meter value={u.fraction} color={driveColor(u.status)} height={7} label={`${formatPercent(u.fraction)} usado`} />
                </div>
                <div className="row" style={{ justifyContent: 'space-between', fontSize: 12.5 }}>
                  <span className="muted">
                    {formatBytes(d.free)} livres de {formatBytes(d.total)}
                  </span>
                  {u.status !== 'ok' ? (
                    <span className={`badge ${u.status === 'critical' ? 'badge-critical' : 'badge-warning'}`}>
                      <Icon name={u.status === 'critical' ? 'x-circle' : 'alert-triangle'} size={12} />
                      {u.status === 'critical' ? 'Quase cheio' : 'Pouco espaço'}
                    </span>
                  ) : (
                    <span className="faint">{formatPercent(u.fraction)} usado</span>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
