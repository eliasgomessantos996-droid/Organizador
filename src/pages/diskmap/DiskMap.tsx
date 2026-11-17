import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { create } from 'zustand';
import { SegmentedBar } from '../../components/charts';
import { FileIcon } from '../../components/FileIcon';
import { Icon } from '../../components/Icon';
import { PageHeader } from '../../components/layout/PageHeader';
import { ScanProgress } from '../../components/ScanProgress';
import { Meter, Toggle } from '../../components/ui/controls';
import { openContextMenu, type MenuEntry } from '../../components/ui/Menu';
import { api, errorText, newTaskId } from '../../lib/api';
import { FAMILIES, familyOf, type Family } from '../../lib/categories';
import { deletePaths, openPath, pickFolder, revealPath } from '../../lib/fileops';
import { formatBytes, formatElapsed, formatNumber, formatPercent, pathCrumbs, plural } from '../../lib/format';
import { squarify } from '../../lib/treemap';
import { EMPTY_FILTER, type MapNode, type ScanStats, type Summary } from '../../lib/types';
import { useHistory } from '../../store/history';
import { go, useNav } from '../../store/nav';
import { usePlaces } from '../../store/places';
import { useTasks } from '../../store/tasks';
import { toast } from '../../store/toasts';
import { driveColor, driveLabel, driveUsage } from '../explorer/NavPane';

const SLOT = 'mapa';

interface MapState {
  stats: ScanStats | null;
  root: string;
  path: string | null;
  taskId: string | null;
  includeHidden: boolean;
  set: (p: Partial<MapState>) => void;
}

const useMap = create<MapState>((set) => ({ stats: null, root: '', path: null, taskId: null, includeHidden: true, set: (p) => set(p) }));

interface Cell {
  node: MapNode;
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number;
}

/** Calcula os blocos do treemap em dois níveis (pastas mostram seus filhos). */
function layout(node: MapNode, w: number, h: number): Cell[] {
  const cells: Cell[] = [];
  const top = squarify(
    node.children.map((c) => ({ ...c })),
    { x: 0, y: 0, w, h },
  );
  for (const r of top) {
    cells.push({ node: r, x: r.x, y: r.y, w: r.w, h: r.h, depth: 0 });
    const header = 22;
    if (r.isDir && r.children.length && r.w > 70 && r.h > 60) {
      const inner = squarify(
        r.children.map((c) => ({ ...c })),
        { x: r.x + 3, y: r.y + header, w: r.w - 6, h: r.h - header - 3 },
      );
      for (const c of inner) cells.push({ node: c, x: c.x, y: c.y, w: c.w, h: c.h, depth: 1 });
    }
  }
  return cells;
}

export function DiskMap() {
  const m = useMap();
  const params = useNav((s) => s.params);
  const drives = usePlaces((s) => s.drives);
  const [node, setNode] = useState<MapNode | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [hover, setHover] = useState<Cell | null>(null);
  const [highlight, setHighlight] = useState<Family | null>(null);
  const [size, setSize] = useState({ w: 800, h: 500 });
  const boxRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [m.stats]);

  const scan = useCallback(async (root: string) => {
    const id = newTaskId();
    useMap.getState().set({ taskId: id, root, path: null, stats: null });
    setNode(null);
    useTasks.getState().start({ id, title: 'Analisando o espaço', icon: 'treemap', cancellable: true });
    try {
      const stats = await api.scanStart(id, SLOT, [root], { includeHidden: useMap.getState().includeHidden, skipSystem: false });
      useMap.getState().set({ stats });
    } catch (e) {
      toast.error('Não foi possível analisar', errorText(e));
    } finally {
      useTasks.getState().finish(id);
      useMap.getState().set({ taskId: null });
    }
  }, []);

  useEffect(() => {
    if (params.path && params.autoStart) void scan(params.path);
  }, [params.nonce, params.path, params.autoStart, scan]);

  const load = useCallback(async (path: string | null) => {
    try {
      const n = await api.mapNode(path, 2, 60);
      setNode(n);
      setHover(null);
      const s = await api.scanSummary(SLOT, { ...EMPTY_FILTER, folder: n.path || null }, { key: 'size', desc: true });
      setSummary(s);
    } catch (e) {
      toast.error('Não foi possível abrir esta pasta no mapa', errorText(e));
    }
  }, []);

  useEffect(() => {
    if (m.stats) void load(m.path);
  }, [m.stats, m.path, load]);

  const cells = useMemo(() => (node ? layout(node, size.w, size.h) : []), [node, size]);

  const families = useMemo(() => {
    const acc = new Map<Family, number>();
    for (const c of summary?.categories ?? []) acc.set(familyOf(c.category), (acc.get(familyOf(c.category)) ?? 0) + c.size);
    return FAMILIES.map((f) => ({ ...f, size: acc.get(f.id) ?? 0 }));
  }, [summary]);

  const removeNode = async (n: MapNode) => {
    const r = await deletePaths([n.path]);
    if (!r?.deleted.length) return;
    if (n.isDir) await api.scanRemoveDir(SLOT, n.path);
    else if (n.id.startsWith('f')) await api.scanRemove(SLOT, [Number(n.id.slice(1))]).catch(() => api.scanRemoveDir(SLOT, n.path));
    useHistory.getState().add({ source: 'limpeza', freed: r.bytes, items: r.deleted.length, targets: [] });
    void load(m.path);
  };

  const menu = (n: MapNode): MenuEntry[] =>
    n.id.startsWith('o')
      ? [{ label: 'Abrir a pasta no Explorador', icon: 'folder-open', onSelect: () => go('explorador', { path: n.path }) }]
      : [
          ...(n.isDir ? [{ label: 'Aproximar', icon: 'search' as const, onSelect: () => m.set({ path: n.path }) }] : []),
          { label: n.isDir ? 'Abrir no Explorador' : 'Abrir', icon: 'external-link', onSelect: () => (n.isDir ? go('explorador', { path: n.path }) : void openPath(n.path)) },
          { label: 'Mostrar no Explorer do Windows', icon: 'folder-search', onSelect: () => void revealPath(n.path) },
          ...(n.isDir
            ? [
                { label: 'Destrinchar no Organizador', icon: 'layers' as const, onSelect: () => go('organizador', { paths: [n.path], autoStart: true }) },
                { label: 'Procurar duplicados aqui', icon: 'copies' as const, onSelect: () => go('duplicados', { paths: [n.path], autoStart: true }) },
              ]
            : []),
          { separator: true },
          { label: 'Mover para a Lixeira', icon: 'trash', danger: true, onSelect: () => void removeNode(n) },
        ];

  if (m.taskId) {
    return (
      <div className="page-scroll">
        <PageHeader icon="treemap" title="Mapa de espaço" subtitle="Somando o tamanho de cada pasta…" playing />
        <ScanProgress taskId={m.taskId} title="Analisando o espaço em disco" icon="treemap" onCancel={() => useTasks.getState().cancel(m.taskId!)} />
      </div>
    );
  }

  if (!m.stats) {
    return (
      <div className="page-scroll">
        <PageHeader icon="treemap" title="Mapa de espaço" subtitle="Veja num relance quais pastas e arquivos ocupam mais espaço." />
        <div className="section-label" style={{ margin: '6px 0 10px' }}>
          Escolha uma unidade
        </div>
        <div className="map-drives">
          {drives.map((d) => {
            const u = driveUsage(d);
            return (
              <button key={d.mount} type="button" className="card card-hover map-drive anim-hover" onClick={() => void scan(d.mount)}>
                <div className="pc-drive-icon">
                  <Icon name={d.removable ? 'usb' : 'hard-drive'} size={24} strokeWidth={1.5} />
                </div>
                <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <div style={{ fontWeight: 650 }}>{driveLabel(d)}</div>
                  <div style={{ margin: '8px 0 6px' }}>
                    <Meter value={u.fraction} color={driveColor(u.status)} height={6} />
                  </div>
                  <div className="faint" style={{ fontSize: 12.5 }}>
                    {formatBytes(d.total - d.free)} usados de {formatBytes(d.total)}
                  </div>
                </div>
                <Icon name="chevron-right" size={18} className="faint" />
              </button>
            );
          })}
        </div>
        <div className="row" style={{ marginTop: 18, gap: 14 }}>
          <button
            type="button"
            className="btn"
            onClick={async () => {
              const f = await pickFolder('Pasta para analisar');
              if (f) void scan(f);
            }}
          >
            <Icon name="folder-open" size={16} />
            Analisar uma pasta…
          </button>
          <label className="row" style={{ cursor: 'pointer' }}>
            <Toggle checked={m.includeHidden} onChange={(v) => m.set({ includeHidden: v })} label="Incluir itens ocultos e do sistema" />
            Incluir itens ocultos e do sistema
          </label>
        </div>
        <p className="faint" style={{ fontSize: 12.5, marginTop: 14 }}>
          Dica: analisar o disco inteiro (C:) pode levar alguns minutos. Pastas protegidas pelo Windows são contadas quando o Organizador tem permissão.
        </p>
      </div>
    );
  }

  const crumbs = pathCrumbs(node?.path || m.root).filter((c) => c.path.length >= m.root.replace(/\\$/, '').length);
  const parentOk = node && node.path && node.path.replace(/\\$/, '').toLowerCase() !== m.root.replace(/\\$/, '').toLowerCase();
  const color = (c: Cell) => {
    const fam = c.node.category ? familyOf(c.node.category) : null;
    if (highlight) return fam === highlight ? FAMILIES.find((f) => f.id === highlight)!.color : undefined;
    return undefined;
  };

  return (
    <div className="map-page">
      <div className="map-top">
        <PageHeader
          icon="treemap"
          title="Mapa de espaço"
          subtitle={`${formatBytes(m.stats.bytes)} em ${plural(m.stats.files, 'arquivo', 'arquivos')} · analisado em ${formatElapsed(m.stats.elapsedMs)}`}
          actions={
            <>
              <button type="button" className="btn btn-sm" onClick={() => void scan(m.root)}>
                <Icon name="refresh" size={14} />
                Analisar de novo
              </button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => m.set({ stats: null })}>
                <Icon name="hard-drive" size={14} />
                Outra unidade
              </button>
            </>
          }
        />
        <div className="map-crumbs">
          <button type="button" className="icon-btn icon-btn-sm" disabled={!parentOk} onClick={() => node && m.set({ path: crumbs[crumbs.length - 2]?.path ?? null })} aria-label="Voltar um nível">
            <Icon name="arrow-up" size={15} />
          </button>
          {crumbs.map((c, i) => (
            <span key={c.path} className="row" style={{ gap: 2 }}>
              {i ? <Icon name="chevron-right" size={13} className="faint" /> : null}
              <button type="button" className={`crumb ${i === crumbs.length - 1 ? 'current' : ''}`} onClick={() => m.set({ path: i === 0 ? null : c.path })}>
                {c.label}
              </button>
            </span>
          ))}
        </div>
      </div>
      <div className="map-body">
        <div className="map-box" ref={boxRef} onMouseLeave={() => setHover(null)}>
          <AnimatePresence initial={false}>
            {node ? (
              <motion.div key={node.path} className="map-layer" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                {cells.map((c) => {
                  const hl = color(c);
                  const dim = highlight && !hl;
                  const showLabel = c.w > 54 && c.h > (c.depth === 0 && c.node.isDir ? 20 : 30);
                  return (
                    <div
                      key={`${c.node.id}-${c.depth}`}
                      className={`map-cell d${c.depth} ${c.node.isDir ? 'dir' : 'file'} ${c.node.id.startsWith('o') ? 'others' : ''} ${hover?.node.id === c.node.id ? 'hover' : ''} ${dim ? 'dim' : ''}`}
                      style={{ left: c.x + 1, top: c.y + 1, width: Math.max(0, c.w - 2), height: Math.max(0, c.h - 2), background: hl }}
                      onMouseEnter={() => setHover(c)}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (c.node.isDir) m.set({ path: c.node.path });
                      }}
                      onContextMenu={(e) => openContextMenu(e, menu(c.node))}
                    >
                      {showLabel ? (
                        <div className="map-label">
                          <span className="truncate">{c.node.name}</span>
                          {c.w > 90 ? <span className="map-size">{formatBytes(c.node.size)}</span> : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </motion.div>
            ) : null}
          </AnimatePresence>
          {hover ? (
            <div className="map-tip" style={{ left: Math.min(hover.x + hover.w / 2, size.w - 140), top: Math.max(8, hover.y + 8) }}>
              <strong className="truncate">{hover.node.name}</strong>
              <span>
                {formatBytes(hover.node.size)}
                {node?.size ? ` · ${formatPercent(hover.node.size / node.size, 1)} desta pasta` : ''}
              </span>
              {hover.node.isDir ? <span className="faint">{plural(hover.node.files, 'arquivo', 'arquivos')} · clique para aproximar</span> : null}
            </div>
          ) : null}
        </div>

        <aside className="map-side">
          <div className="section-label">Esta pasta</div>
          <div className="org-total" style={{ marginBottom: 6 }}>
            <span className="stat-value">{node ? formatBytes(node.size) : '—'}</span>
            <span className="muted">{node ? plural(node.files, 'arquivo', 'arquivos') : ''}</span>
          </div>
          <SegmentedBar parts={families.map((f) => ({ id: f.id, label: f.label, value: f.size, color: f.color, display: formatBytes(f.size) }))} onSelect={(id) => setHighlight(highlight === id ? null : (id as Family))} />
          <div className="fam-list">
            {families
              .filter((f) => f.size > 0)
              .sort((a, b) => b.size - a.size)
              .map((f) => (
                <button key={f.id} type="button" className={`fam-row ${highlight === f.id ? 'selected' : ''}`} onClick={() => setHighlight(highlight === f.id ? null : f.id)} data-tip="Destacar no mapa">
                  <span className="chip-swatch" style={{ background: f.color }} />
                  <span style={{ flex: 1 }}>{f.label}</span>
                  <span className="tabular fam-size">{formatBytes(f.size)}</span>
                </button>
              ))}
          </div>
          <div className="section-label" style={{ marginTop: 10 }}>
            Maiores itens
          </div>
          <div className="largest-list">
            {node?.children.slice(0, 14).map((c) => (
              <button
                key={c.id}
                type="button"
                className="largest-row"
                onClick={() => (c.isDir ? m.set({ path: c.path }) : void revealPath(c.path))}
                onContextMenu={(e) => openContextMenu(e, menu(c))}
                onMouseEnter={() => setHover(cells.find((x) => x.node.id === c.id && x.depth === 0) ?? null)}
              >
                {c.id.startsWith('o') ? <Icon name="more-h" size={18} className="faint" /> : <FileIcon category={c.isDir ? 'folder' : (c.category ?? 'other')} size={20} />}
                <span className="truncate" style={{ flex: 1 }}>
                  {c.name}
                </span>
                <span className="tabular faint">{formatBytes(c.size)}</span>
              </button>
            ))}
          </div>
          <p className="org-hint">Clique com o botão direito em um bloco para abrir, analisar ou mandar para a Lixeira. {formatNumber(m.stats.files)} arquivos no total.</p>
        </aside>
      </div>
    </div>
  );
}
