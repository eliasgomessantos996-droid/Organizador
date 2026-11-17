import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { FileTable } from '../../components/FileTable';
import { Icon } from '../../components/Icon';
import { RootsPicker } from '../../components/RootsPicker';
import { ScanProgress } from '../../components/ScanProgress';
import { EmptyState, Segmented } from '../../components/ui/controls';
import { openContextMenu } from '../../components/ui/Menu';
import { api, errorText, newTaskId } from '../../lib/api';
import { deletePaths, moveToFolder, openPath, revealPath } from '../../lib/fileops';
import { formatBytes, plural } from '../../lib/format';
import { clickSelect, EMPTY_SEL, type SelState } from '../../lib/selection';
import { EMPTY_FILTER, type ScanStats, type SortSpec } from '../../lib/types';
import { useScanList } from '../../lib/useScanList';
import { useHistory } from '../../store/history';
import { quickPlaces, usePlaces } from '../../store/places';
import { useSettings } from '../../store/settings';
import { useTasks } from '../../store/tasks';
import { toast } from '../../store/toasts';

const SLOT = 'esquecidos';
const PERIODS = [
  { value: '182', label: '6 meses' },
  { value: '365', label: '1 ano' },
  { value: '730', label: '2 anos' },
  { value: '1095', label: '3 anos' },
];
const MIN_SIZES = [
  { value: '0', label: 'Qualquer' },
  { value: '1048576', label: '> 1 MB' },
  { value: '10485760', label: '> 10 MB' },
  { value: '104857600', label: '> 100 MB' },
];

/** Arquivos que você não usa há muito tempo, para arquivar ou excluir. */
export function ForgottenFiles() {
  const special = usePlaces((s) => s.special);
  const unusedDays = useSettings((s) => s.unusedDays);
  const setSettings = useSettings((s) => s.set);
  const [roots, setRoots] = useState<string[]>([]);
  const [minSize, setMinSize] = useState('1048576');
  const [stats, setStats] = useState<ScanStats | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [sort, setSort] = useState<SortSpec>({ key: 'size', desc: true });
  const [sel, setSel] = useState<SelState>(EMPTY_SEL);
  const list = useScanList(SLOT);
  const keys = useMemo(() => list.ids.map(String), [list.ids]);

  useEffect(() => {
    if (!roots.length && special) {
      const q = quickPlaces(special).filter((p) => ['documents', 'downloads', 'desktop', 'videos', 'pictures', 'music'].includes(p.key));
      setRoots(q.map((p) => p.path));
    }
  }, [special, roots.length]);

  const filter = useMemo(
    () => ({ ...EMPTY_FILTER, unusedBefore: Date.now() - unusedDays * 86_400_000, sizeMin: Number(minSize) || null }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [unusedDays, minSize, stats],
  );

  useEffect(() => {
    if (stats) void list.refresh(filter, sort);
    setSel(EMPTY_SEL);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, sort]);

  const scan = async () => {
    const id = newTaskId();
    setTaskId(id);
    useTasks.getState().start({ id, title: 'Procurando arquivos esquecidos', icon: 'clock', cancellable: true });
    try {
      const s = await api.scanStart(id, SLOT, roots, { includeHidden: false, skipSystem: true });
      setStats(s);
    } catch (e) {
      toast.error('Não foi possível analisar', errorText(e));
    } finally {
      useTasks.getState().finish(id);
      setTaskId(null);
    }
  };

  const selectedIds = () => [...sel.selected].map(Number);
  const act = async (kind: 'trash' | 'delete' | 'move') => {
    const ids = selectedIds();
    const paths = await api.scanPaths(SLOT, ids);
    let removed: string[];
    let freed = 0;
    if (kind === 'move') {
      removed = (await moveToFolder(paths)).map((d) => d.from);
    } else {
      const r = await deletePaths(paths, kind === 'delete');
      removed = r?.deleted ?? [];
      freed = r?.bytes ?? 0;
    }
    if (!removed.length) return;
    const set = new Set(removed.map((p) => p.toLowerCase()));
    await api.scanRemove(
      SLOT,
      ids.filter((_, i) => set.has(paths[i].toLowerCase())),
    );
    if (freed) useHistory.getState().add({ source: 'esquecidos', freed, items: removed.length, targets: [] });
    setSel(EMPTY_SEL);
    await list.refresh(filter, sort);
  };

  if (taskId) return <ScanProgress taskId={taskId} title="Procurando arquivos esquecidos" icon="clock" onCancel={() => useTasks.getState().cancel(taskId)} />;

  const period = PERIODS.find((p) => Number(p.value) === unusedDays)?.value ?? '365';
  const selSize = sel.selected.size === list.ids.length ? list.totalSize : list.loadedSize(sel.selected);

  return (
    <div className="forgotten">
      <section className="card card-pad forgotten-setup">
        <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
          <div className="icon-tile icon-tile-lg anim-hover">
            <Icon name="clock" size={22} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="card-title">Arquivos que você não usa há muito tempo</div>
            <p className="card-subtitle" style={{ marginTop: 3 }}>
              Encontre arquivos parados nas suas pastas e decida: arquivar em outro disco, mandar para a Lixeira ou excluir. Usamos a data mais recente entre
              modificação e último acesso.
            </p>
            <div style={{ marginTop: 14 }}>
              <RootsPicker roots={roots} onAdd={(p) => setRoots([...new Set([...roots, ...p])])} onRemove={(p) => setRoots(roots.filter((r) => r !== p))} />
            </div>
            <div className="row" style={{ gap: 14, marginTop: 14, flexWrap: 'wrap' }}>
              <span className="field-label">Sem uso há mais de</span>
              <Segmented size="sm" value={period} onChange={(v) => setSettings({ unusedDays: Number(v) })} options={PERIODS} />
              <span className="field-label">Tamanho</span>
              <Segmented size="sm" value={minSize} onChange={setMinSize} options={MIN_SIZES} />
              <div className="spacer" />
              <button type="button" className="btn btn-primary anim-hover" disabled={!roots.length} onClick={() => void scan()}>
                <Icon name="search" size={16} />
                {stats ? 'Procurar de novo' : 'Procurar'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {stats ? (
        <section className="card forgotten-results">
          <div className="forgotten-head">
            <span>
              <strong>{plural(list.ids.length, 'arquivo', 'arquivos')}</strong> sem uso há mais de {PERIODS.find((p) => p.value === period)?.label}
              <span className="faint"> · {formatBytes(list.totalSize)}</span>
            </span>
            <button type="button" className="btn btn-sm btn-ghost" disabled={!list.ids.length} onClick={() => setSel({ selected: new Set(keys), anchor: keys[0], focus: keys[0] })}>
              <Icon name="select-all" size={14} />
              Selecionar todos
            </button>
          </div>
          <div className="forgotten-table">
            <FileTable
              tableId="forgotten"
              columns={['name', 'folder', 'used', 'size']}
              count={list.ids.length}
              getRow={list.getRow}
              rowKey={(e) => String(e.id)}
              selected={sel.selected}
              focusKey={sel.focus}
              sort={sort}
              onSort={(k) => setSort((s) => ({ key: k, desc: s.key === k ? !s.desc : k !== 'name' }))}
              onRowPointerDown={(ev, i) => {
                if (ev.button === 2 && sel.selected.has(keys[i])) return;
                setSel(clickSelect(ev.button === 2 ? EMPTY_SEL : sel, keys, i, { ctrl: ev.ctrlKey, shift: ev.shiftKey }));
              }}
              onRowDoubleClick={(e) => void openPath(e.path)}
              onRowContextMenu={(ev, _i, e) =>
                openContextMenu(ev, [
                  { label: 'Abrir', icon: 'external-link', onSelect: () => void openPath(e.path) },
                  { label: 'Mostrar no Explorer do Windows', icon: 'folder-search', onSelect: () => void revealPath(e.path) },
                  { separator: true },
                  { label: 'Arquivar em…', icon: 'archive', onSelect: () => void act('move') },
                  { label: 'Mover para a Lixeira', icon: 'trash', danger: true, onSelect: () => void act('trash') },
                ])
              }
              onBackgroundPointerDown={() => setSel(EMPTY_SEL)}
              onVisibleRange={list.ensureRange}
              loading={list.loading && !list.ids.length}
              empty={<EmptyState icon="smile" title="Nenhum arquivo esquecido" text="Tudo o que está nessas pastas foi usado recentemente." />}
            />
            <AnimatePresence>
              {sel.selected.size ? (
                <motion.div
                  className="action-bar"
                  initial={{ opacity: 0, y: 24, x: '-50%' }}
                  animate={{ opacity: 1, y: 0, x: '-50%' }}
                  exit={{ opacity: 0, y: 24, x: '-50%' }}
                >
                  <span className="action-bar-count">
                    {plural(sel.selected.size, 'selecionado', 'selecionados')}
                    {selSize ? <span className="faint"> · {formatBytes(selSize)}</span> : null}
                  </span>
                  <button type="button" className="btn btn-sm" onClick={() => void act('move')}>
                    <Icon name="archive" size={14} />
                    Arquivar em…
                  </button>
                  <button type="button" className="btn btn-sm btn-danger-soft anim-hover" onClick={() => void act('trash')}>
                    <Icon name="trash" size={14} />
                    Lixeira
                  </button>
                  <button type="button" className="icon-btn" onClick={() => setSel(EMPTY_SEL)} data-tip="Limpar seleção">
                    <Icon name="x" size={16} />
                  </button>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </section>
      ) : null}
    </div>
  );
}
