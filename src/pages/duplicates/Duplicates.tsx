import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { create } from 'zustand';
import { FileIcon } from '../../components/FileIcon';
import { Icon } from '../../components/Icon';
import { PageHeader } from '../../components/layout/PageHeader';
import { RootsPicker } from '../../components/RootsPicker';
import { ScanProgress } from '../../components/ScanProgress';
import { Checkbox, EmptyState, Segmented, StatTile, Toggle } from '../../components/ui/controls';
import { openContextMenu, openDropdown } from '../../components/ui/Menu';
import { api, errorText, fileUrl, newTaskId } from '../../lib/api';
import { categoriesOfFamily, FAMILIES, type Family } from '../../lib/categories';
import { useExternalDrop } from '../../lib/dnd';
import { deletePaths, moveToFolder, openPath, pickFolder, revealPath } from '../../lib/fileops';
import { formatBytes, formatDate, formatElapsed, formatNumber, isInside, plural } from '../../lib/format';
import type { DupGroup, DupResult } from '../../lib/types';
import { useHistory } from '../../store/history';
import { go, useNav } from '../../store/nav';
import { quickPlaces, usePlaces } from '../../store/places';
import { useTasks } from '../../store/tasks';
import { toast } from '../../store/toasts';

type Strategy = 'antigo' | 'recente' | 'curto';

interface DupState {
  roots: string[];
  minSize: string;
  family: Family | '';
  includeHidden: boolean;
  result: DupResult | null;
  marked: Set<string>;
  taskId: string | null;
  set: (p: Partial<DupState>) => void;
}

const useDup = create<DupState>((set) => ({
  roots: [],
  minSize: '102400',
  family: '',
  includeHidden: false,
  result: null,
  marked: new Set(),
  taskId: null,
  set: (p) => set(p),
}));

/** Marca para exclusão todas as cópias menos a escolhida pela estratégia. */
export function autoMark(groups: DupGroup[], strategy: Strategy | { folder: string }): Set<string> {
  const marked = new Set<string>();
  for (const g of groups) {
    const keep =
      typeof strategy === 'object'
        ? (g.files.find((f) => isInside(f.path, strategy.folder)) ?? g.files[0])
        : strategy === 'antigo'
          ? g.files.reduce((a, b) => (b.modified < a.modified ? b : a))
          : strategy === 'recente'
            ? g.files.reduce((a, b) => (b.modified > a.modified ? b : a))
            : g.files.reduce((a, b) => (b.path.length < a.path.length ? b : a));
    for (const f of g.files) if (f.path !== keep.path) marked.add(f.path);
  }
  return marked;
}

type Row = { kind: 'group'; g: DupGroup } | { kind: 'file'; g: DupGroup; i: number };

export function Duplicates() {
  const d = useDup();
  const params = useNav((s) => s.params);
  const special = usePlaces((s) => s.special);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!useDup.getState().roots.length && special) {
      useDup.getState().set({ roots: quickPlaces(special).filter((q) => ['pictures', 'documents', 'downloads', 'desktop'].includes(q.key)).map((q) => q.path) });
    }
  }, [special]);

  useEffect(() => {
    if (params.paths?.length) {
      useDup.getState().set({ roots: params.paths, result: null });
      if (params.autoStart) void find(params.paths);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.nonce]);

  useExternalDrop((paths) => {
    void (async () => {
      const dirs: string[] = [];
      for (const p of paths) if (await api.isDir(p).catch(() => false)) dirs.push(p);
      if (dirs.length) useDup.getState().set({ roots: [...new Set([...useDup.getState().roots, ...dirs])] });
    })();
  });

  const find = async (roots = d.roots) => {
    const id = newTaskId();
    d.set({ taskId: id, result: null, marked: new Set() });
    useTasks.getState().start({ id, title: 'Procurando duplicados', icon: 'copies', cancellable: true });
    try {
      const st = useDup.getState();
      const r = await api.dupFind(id, roots, {
        minSize: Number(st.minSize),
        categories: st.family ? categoriesOfFamily(st.family) : [],
        includeHidden: st.includeHidden,
      });
      d.set({ result: r, marked: autoMark(r.groups, 'antigo') });
      if (r.cancelled) toast.warning('Busca cancelada');
    } catch (e) {
      toast.error('Não foi possível procurar duplicados', errorText(e));
    } finally {
      useTasks.getState().finish(id);
      d.set({ taskId: null });
    }
  };

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const g of d.result?.groups ?? []) {
      out.push({ kind: 'group', g });
      g.files.forEach((_, i) => out.push({ kind: 'file', g, i }));
    }
    return out;
  }, [d.result]);

  const v = useVirtualizer({ count: rows.length, getScrollElement: () => scrollRef.current, estimateSize: (i) => (rows[i].kind === 'group' ? 58 : 42), overscan: 12, paddingEnd: 90 });

  const markedSize = useMemo(() => {
    let s = 0;
    for (const g of d.result?.groups ?? []) for (const f of g.files) if (d.marked.has(f.path)) s += f.size;
    return s;
  }, [d.result, d.marked]);

  const toggle = (g: DupGroup, path: string) => {
    const m = new Set(d.marked);
    if (m.has(path)) m.delete(path);
    else {
      const others = g.files.filter((f) => f.path !== path && !m.has(f.path));
      if (!others.length) {
        toast.info('Mantenha pelo menos uma cópia', 'Para apagar todas as cópias, use o Explorador.');
        return;
      }
      m.add(path);
    }
    d.set({ marked: m });
  };

  const removeFromResult = (paths: string[], freed: number) => {
    const gone = new Set(paths.map((p) => p.toLowerCase()));
    const groups = (d.result?.groups ?? [])
      .map((g) => ({ ...g, files: g.files.filter((f) => !gone.has(f.path.toLowerCase())) }))
      .filter((g) => g.files.length > 1);
    const m = new Set([...d.marked].filter((p) => !gone.has(p.toLowerCase())));
    d.set({
      result: d.result ? { ...d.result, groups, wasted: groups.reduce((s, g) => s + g.size * (g.files.length - 1), 0), duplicateFiles: groups.reduce((s, g) => s + g.files.length - 1, 0) } : null,
      marked: m,
    });
    if (freed) useHistory.getState().add({ source: 'duplicados', freed, items: paths.length, targets: [] });
  };

  const deleteMarked = async (permanent = false) => {
    setBusy(true);
    try {
      const r = await deletePaths([...d.marked], permanent);
      if (r?.deleted.length) removeFromResult(r.deleted, r.bytes);
    } finally {
      setBusy(false);
    }
  };

  const moveMarked = async () => {
    const done = await moveToFolder([...d.marked]);
    if (done.length) removeFromResult(done.map((x) => x.from), 0);
  };

  const strategyMenu = (el: HTMLElement) =>
    openDropdown(el, [
      { header: 'Manter uma cópia de cada' },
      { label: 'Manter a mais antiga (original)', icon: 'history', onSelect: () => d.set({ marked: autoMark(d.result!.groups, 'antigo') }) },
      { label: 'Manter a mais recente', icon: 'clock', onSelect: () => d.set({ marked: autoMark(d.result!.groups, 'recente') }) },
      { label: 'Manter a de caminho mais curto', icon: 'arrow-up', onSelect: () => d.set({ marked: autoMark(d.result!.groups, 'curto') }) },
      {
        label: 'Manter as que estão numa pasta…',
        icon: 'folder',
        onSelect: async () => {
          const f = await pickFolder('Pasta preferida (as cópias dela são mantidas)');
          if (f) d.set({ marked: autoMark(d.result!.groups, { folder: f }) });
        },
      },
      { separator: true },
      { label: 'Desmarcar tudo', icon: 'x', onSelect: () => d.set({ marked: new Set() }) },
    ]);

  if (d.taskId) {
    return (
      <div className="page-scroll">
        <PageHeader icon="copies" title="Duplicados" subtitle="Comparando arquivos pelo conteúdo…" playing />
        <ScanProgress taskId={d.taskId} title="Procurando arquivos duplicados" icon="copies" onCancel={() => useTasks.getState().cancel(d.taskId!)} />
      </div>
    );
  }

  return (
    <div className="dup-page">
      <div className="dup-top">
        <PageHeader
          icon="copies"
          title="Duplicados"
          subtitle="Encontre arquivos idênticos (mesmo conteúdo, mesmo com nomes diferentes) e libere espaço."
          actions={
            d.result ? (
              <button type="button" className="btn btn-sm" onClick={() => d.set({ result: null })}>
                <Icon name="refresh" size={14} />
                Nova busca
              </button>
            ) : null
          }
        />
      </div>

      {!d.result ? (
        <div className="page-scroll" style={{ paddingTop: 0 }}>
          <section className="card card-pad dup-setup">
            <div className="field-label">Onde procurar</div>
            <RootsPicker roots={d.roots} onAdd={(p) => d.set({ roots: [...new Set([...d.roots, ...p])] })} onRemove={(p) => d.set({ roots: d.roots.filter((r) => r !== p) })} />
            <div className="dup-options">
              <div className="field">
                <span className="field-label">Tamanho mínimo</span>
                <Segmented
                  size="sm"
                  value={d.minSize}
                  onChange={(v) => d.set({ minSize: v })}
                  options={[
                    { value: '1', label: 'Qualquer' },
                    { value: '102400', label: '> 100 KB' },
                    { value: '1048576', label: '> 1 MB' },
                    { value: '10485760', label: '> 10 MB' },
                  ]}
                />
              </div>
              <div className="field">
                <span className="field-label">Tipo de arquivo</span>
                <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <button type="button" className={`chip ${d.family === '' ? 'active' : ''}`} onClick={() => d.set({ family: '' })}>
                    Todos
                  </button>
                  {FAMILIES.filter((f) => f.id !== 'outros').map((f) => (
                    <button key={f.id} type="button" className={`chip ${d.family === f.id ? 'active' : ''}`} onClick={() => d.set({ family: f.id })}>
                      <span className="chip-swatch" style={{ background: f.color }} />
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="row" style={{ cursor: 'pointer', alignSelf: 'flex-end' }}>
                <Toggle checked={d.includeHidden} onChange={(v) => d.set({ includeHidden: v })} label="Incluir ocultos" />
                Incluir ocultos
              </label>
            </div>
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 6 }}>
              <span className="faint" style={{ fontSize: 12.5 }}>
                A comparação é feita pelo conteúdo (hash BLAKE3): nomes e datas diferentes não importam.
              </span>
              <button type="button" className="btn btn-primary btn-lg anim-hover" disabled={!d.roots.length} onClick={() => void find()}>
                <Icon name="search" size={18} />
                Procurar duplicados
              </button>
            </div>
          </section>
        </div>
      ) : (
        <>
          <div className="dup-summary">
            <StatTile icon="copies" label="Grupos de duplicados" value={formatNumber(d.result.groups.length)} sub={`${formatNumber(d.result.scannedFiles)} arquivos verificados em ${formatElapsed(d.result.elapsedMs)}`} />
            <StatTile icon="file" label="Cópias extras" value={formatNumber(d.result.duplicateFiles)} sub="Arquivos que repetem outro" />
            <StatTile icon="sparkles" tone="good" label="Espaço recuperável" value={formatBytes(d.result.wasted)} sub="Mantendo uma cópia de cada" />
          </div>
          {d.result.groups.length === 0 ? (
            <div className="page-scroll" style={{ paddingTop: 0 }}>
              <div className="card">
                <EmptyState icon="smile" title="Nenhum duplicado encontrado" text="Não há arquivos repetidos nessas pastas com os filtros escolhidos." />
              </div>
            </div>
          ) : (
            <section className="dup-list-wrap">
              <div className="dup-list-head">
                <span>
                  <strong>{plural(d.marked.size, 'cópia marcada', 'cópias marcadas')}</strong> para remover · {formatBytes(markedSize)}
                </span>
                <button type="button" className="btn btn-sm" onClick={(e) => strategyMenu(e.currentTarget)}>
                  <Icon name="wand" size={14} />
                  Seleção automática
                  <Icon name="chevron-down" size={13} />
                </button>
              </div>
              <div ref={scrollRef} className="dup-scroll">
                <div style={{ height: v.getTotalSize(), position: 'relative' }}>
                  {v.getVirtualItems().map((it) => {
                    const row = rows[it.index];
                    const style = { transform: `translateY(${it.start}px)`, height: it.size };
                    if (row.kind === 'group') {
                      const first = row.g.files[0];
                      const thumb = first.category === 'image' ? fileUrl(first.path) : null;
                      return (
                        <div key={`g${row.g.id}`} className="dup-group-row" style={style}>
                          <FileIcon category={first.category} ext={first.ext} size={34} thumb={thumb} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="truncate" style={{ fontWeight: 650 }}>
                              {first.name}
                            </div>
                            <div className="faint" style={{ fontSize: 12 }}>
                              {plural(row.g.files.length, 'cópia', 'cópias')} de {formatBytes(row.g.size)} · {formatBytes(row.g.size * (row.g.files.length - 1))} recuperáveis
                            </div>
                          </div>
                        </div>
                      );
                    }
                    const f = row.g.files[row.i];
                    const isMarked = d.marked.has(f.path);
                    const keeper = !isMarked && row.g.files.some((x) => d.marked.has(x.path));
                    return (
                      <div
                        key={f.path}
                        className={`dup-file-row ${isMarked ? 'marked' : ''}`}
                        style={style}
                        onClick={() => toggle(row.g, f.path)}
                        onContextMenu={(e) =>
                          openContextMenu(e, [
                            { label: 'Abrir', icon: 'external-link', onSelect: () => void openPath(f.path) },
                            { label: 'Mostrar no Explorer do Windows', icon: 'folder-search', onSelect: () => void revealPath(f.path) },
                            { label: 'Abrir a pasta no Explorador', icon: 'folder-open', onSelect: () => go('explorador', { path: f.parent }) },
                            { separator: true },
                            {
                              label: 'Manter só esta cópia',
                              icon: 'check',
                              onSelect: () => {
                                const m = new Set(d.marked);
                                row.g.files.forEach((x) => (x.path === f.path ? m.delete(x.path) : m.add(x.path)));
                                d.set({ marked: m });
                              },
                            },
                          ])
                        }
                      >
                        <Checkbox checked={isMarked} onChange={() => toggle(row.g, f.path)} label={`Marcar ${f.name}`} />
                        <span className="truncate dup-path" data-tip={f.path}>
                          <span className="faint">{f.parent}\</span>
                          {f.name}
                        </span>
                        {keeper ? (
                          <span className="badge badge-good">
                            <Icon name="shield-check" size={11} />
                            Mantido
                          </span>
                        ) : null}
                        <span className="faint tabular" style={{ fontSize: 12, width: 130, textAlign: 'right' }}>
                          {formatDate(f.modified)}
                        </span>
                        <button
                          type="button"
                          className="icon-btn icon-btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            void revealPath(f.path);
                          }}
                          data-tip="Mostrar no Explorer"
                        >
                          <Icon name="folder-search" size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
              <AnimatePresence>
                {d.marked.size ? (
                  <motion.div className="action-bar" initial={{ opacity: 0, y: 24, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} exit={{ opacity: 0, y: 24, x: '-50%' }}>
                    <span className="action-bar-count">
                      {plural(d.marked.size, 'cópia', 'cópias')}
                      <span className="faint"> · {formatBytes(markedSize)}</span>
                    </span>
                    <button type="button" className="btn btn-sm" onClick={() => void moveMarked()} disabled={busy}>
                      <Icon name="archive" size={14} />
                      Mover para…
                    </button>
                    <button type="button" className="btn btn-sm btn-danger anim-hover" onClick={() => void deleteMarked(false)} disabled={busy}>
                      <Icon name="trash" size={14} />
                      Mover para a Lixeira
                    </button>
                    <button type="button" className="icon-btn" onClick={() => void deleteMarked(true)} data-tip="Excluir permanentemente" disabled={busy}>
                      <Icon name="trash-x" size={16} />
                    </button>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </section>
          )}
        </>
      )}
    </div>
  );
}

