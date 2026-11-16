import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { FileTable, type ColumnId } from '../../components/FileTable';
import { Icon } from '../../components/Icon';
import { PageHeader } from '../../components/layout/PageHeader';
import { RootsPicker } from '../../components/RootsPicker';
import { ScanProgress } from '../../components/ScanProgress';
import { EmptyState, SearchInput, Toggle } from '../../components/ui/controls';
import { openContextMenu, openDropdown, type MenuEntry } from '../../components/ui/Menu';
import { api } from '../../lib/api';
import { FAMILIES, type Family } from '../../lib/categories';
import { useExternalDrop } from '../../lib/dnd';
import { onFsChanged } from '../../lib/events';
import { clipboardSet, copyPathsAsText, copyToFolder, deletePaths, moveToFolder, openPath, renameWithPrompt, revealPath } from '../../lib/fileops';
import { basename, formatBytes, formatElapsed, formatNumber, isInside, plural } from '../../lib/format';
import { modKey } from '../../lib/platform';
import { clickSelect, EMPTY_SEL, moveFocus } from '../../lib/selection';
import type { FileEntry } from '../../lib/types';
import { go, useNav } from '../../store/nav';
import { loadedEntries, MODIFIED_OPTIONS, SIZE_OPTIONS, UNUSED_OPTIONS, useOrganizer } from '../../store/organizer';
import { OrganizerSummary } from './OrganizerSummary';

const overlayOpen = () => !!document.querySelector('.dialog-overlay, .palette-overlay, .menu');

export function Organizer() {
  const o = useOrganizer();
  const params = useNav((s) => s.params);
  const [scrollTo, setScrollTo] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [textDraft, setTextDraft] = useState(o.ui.text);
  const keys = useMemo(() => o.ids.map(String), [o.ids]);

  // Parâmetros vindos de outras páginas (ex.: "Destrinchar no Organizador").
  useEffect(() => {
    if (!params.paths?.length) return;
    const st = useOrganizer.getState();
    st.setRoots(params.paths);
    if (params.text !== undefined) {
      setTextDraft(params.text);
      useOrganizer.setState({ ui: { ...st.ui, text: params.text } });
    }
    if (params.autoStart) void useOrganizer.getState().scan();
  }, [params.nonce, params.paths, params.text, params.autoStart]);

  // Busca com pequena espera enquanto digita.
  useEffect(() => {
    if (textDraft === o.ui.text) return;
    const t = window.setTimeout(() => o.setUi({ text: textDraft }), 220);
    return () => window.clearTimeout(t);
  }, [textDraft, o]);

  // Se arquivos mudarem em uma pasta analisada, avisa que a lista pode estar desatualizada.
  const [stale, setStale] = useState(false);
  useEffect(
    () =>
      onFsChanged((dirs) => {
        const roots = useOrganizer.getState().roots;
        if (dirs.some((d) => roots.some((r) => isInside(d, r)))) setStale(true);
      }),
    [],
  );

  const onExternalDrop = useCallback(async (paths: string[]) => {
    const dirs: string[] = [];
    for (const p of paths) if (await api.isDir(p).catch(() => false)) dirs.push(p);
    if (dirs.length) useOrganizer.getState().addRoots(dirs);
  }, []);
  useExternalDrop(onExternalDrop);

  /* ───────────── Seleção e ações ───────────── */
  const selIds = () => [...useOrganizer.getState().sel.selected].map(Number);
  const selPaths = async () => api.scanPaths('organizador', selIds());

  const afterRemoval = async (ids: number[], paths: string[], removedPaths: string[]) => {
    const set = new Set(removedPaths.map((p) => p.toLowerCase()));
    const removedIds = ids.filter((_, i) => set.has(paths[i]?.toLowerCase()));
    await o.removeIds(removedIds);
  };

  const doDelete = async (permanent?: boolean) => {
    const ids = selIds();
    if (!ids.length) return;
    const paths = await api.scanPaths('organizador', ids);
    const r = await deletePaths(paths, permanent);
    if (r?.deleted.length) await afterRemoval(ids, paths, r.deleted);
  };

  const doMove = async () => {
    const ids = selIds();
    const paths = await api.scanPaths('organizador', ids);
    const done = await moveToFolder(paths);
    if (done.length) {
      // Os itens movidos saem da lista (podem ter ido para fora das pastas analisadas).
      const moved = new Set(done.map((d) => d.from.toLowerCase()));
      const removedIds = ids.filter((_, i) => moved.has(paths[i].toLowerCase()));
      await o.removeIds(removedIds);
      setStale(true);
    }
  };

  const doCopy = async () => void copyToFolder(await selPaths());

  const selectAllResults = () => o.setSel({ selected: new Set(keys), anchor: keys[0] ?? null, focus: o.sel.focus ?? keys[0] ?? null });

  const rowMenu = (e: FileEntry): MenuEntry[] => {
    const many = o.sel.selected.size > 1;
    const items: MenuEntry[] = [];
    if (!many)
      items.push(
        { label: 'Abrir', icon: 'external-link', shortcut: 'Enter', onSelect: () => void openPath(e.path) },
        { label: 'Mostrar no Explorer do Windows', icon: 'folder-search', onSelect: () => void revealPath(e.path) },
        { label: 'Abrir a pasta no Explorador', icon: 'folder-open', onSelect: () => go('explorador', { path: e.parent }) },
        { separator: true },
      );
    items.push(
      { label: 'Copiar', icon: 'copy', shortcut: `${modKey}+C`, onSelect: async () => void clipboardSet(await selPaths(), false) },
      { label: 'Recortar', icon: 'scissors', shortcut: `${modKey}+X`, onSelect: async () => void clipboardSet(await selPaths(), true) },
      { label: 'Mover para…', icon: 'arrow-right', onSelect: () => void doMove() },
      { label: 'Copiar para…', icon: 'copy', onSelect: () => void doCopy() },
      { label: many ? 'Copiar caminhos' : 'Copiar caminho', icon: 'link', onSelect: async () => void copyPathsAsText(await selPaths()) },
      { separator: true },
    );
    if (!many)
      items.push({
        label: 'Renomear',
        icon: 'pencil',
        onSelect: async () => {
          const to = await renameWithPrompt(e.path);
          if (to) setStale(true);
        },
      });
    items.push(
      { label: 'Excluir (Lixeira)', icon: 'trash', shortcut: 'Del', danger: true, onSelect: () => void doDelete(false) },
      { label: 'Excluir permanentemente', icon: 'trash-x', shortcut: 'Shift+Del', danger: true, onSelect: () => void doDelete(true) },
    );
    if (!many)
      items.push(
        { separator: true },
        { label: `Filtrar pela pasta “${basename(e.parent)}”`, icon: 'filter', onSelect: () => o.setUi({ folder: e.parent, folderName: basename(e.parent) }) },
        { label: e.ext ? `Filtrar por .${e.ext}` : 'Filtrar arquivos sem extensão', icon: 'tag', onSelect: () => o.setUi({ ext: e.ext }) },
      );
    return items;
  };

  const onRowPointerDown = (ev: React.PointerEvent, index: number) => {
    listRef.current?.focus({ preventScroll: true });
    if (ev.button === 2) {
      if (!o.sel.selected.has(keys[index])) o.setSel(clickSelect(EMPTY_SEL, keys, index, { ctrl: false, shift: false }));
      return;
    }
    if (ev.button !== 0) return;
    o.setSel(clickSelect(o.sel, keys, index, { ctrl: ev.ctrlKey || ev.metaKey, shift: ev.shiftKey }));
  };

  // Teclado
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (overlayOpen() || !useOrganizer.getState().stats) return;
      const t = e.target as HTMLElement;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
      const st = useOrganizer.getState();
      if (ctrl && e.key.toLowerCase() === 'a') return void (e.preventDefault(), selectAllResults());
      if (ctrl && e.key.toLowerCase() === 'c') return void (e.preventDefault(), selPaths().then((p) => clipboardSet(p, false)));
      if (ctrl && e.key.toLowerCase() === 'x') return void (e.preventDefault(), selPaths().then((p) => clipboardSet(p, true)));
      if (e.key === 'Delete') return void (e.preventDefault(), doDelete(e.shiftKey ? true : undefined));
      if (e.key === 'Escape') return void st.setSel(EMPTY_SEL);
      if (e.key === 'Enter' && st.sel.selected.size === 1) {
        const id = Number([...st.sel.selected][0]);
        void api.scanPaths('organizador', [id]).then((p) => {
          if (p[0]) void openPath(p[0]);
        });
        return;
      }
      const moves: Record<string, number | 'home' | 'end'> = { ArrowDown: 1, ArrowUp: -1, PageDown: 15, PageUp: -15, Home: 'home', End: 'end' };
      if (e.key in moves) {
        e.preventDefault();
        const next = moveFocus(st.sel, keys, moves[e.key], { shift: e.shiftKey, ctrl });
        st.setSel(next);
        const i = next.focus ? keys.indexOf(next.focus) : -1;
        if (i >= 0) setScrollTo(i + Math.random() * 0.001);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const selectedSize = useMemo(() => {
    if (o.sel.selected.size && o.sel.selected.size === o.ids.length) return o.totalSize;
    return loadedEntries(o.sel.selected).reduce((s, e) => s + e.size, 0);
    // pagesVersion: recalcula quando novas páginas chegam
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.sel.selected, o.ids.length, o.totalSize, o.pagesVersion]);

  const columns: ColumnId[] = o.ui.unused ? ['name', 'folder', 'used', 'type', 'size'] : ['name', 'folder', 'modified', 'type', 'size'];

  const toggleFamily = (f: Family) => o.setUi({ families: o.ui.families.includes(f) ? o.ui.families.filter((x) => x !== f) : [...o.ui.families, f] });
  const filtersActive =
    !!o.ui.text || o.ui.families.length > 0 || !!o.ui.size || !!o.ui.modified || !!o.ui.unused || o.ui.folder !== null || o.ui.ext !== null;

  const selectMenu = (el: HTMLElement, options: { id: string; label: string }[], current: string, key: 'size' | 'modified' | 'unused') =>
    openDropdown(
      el,
      options.map((op) => ({ label: op.label, checked: current === op.id, onSelect: () => o.setUi({ [key]: op.id }) })),
    );

  const labelOf = (options: { id: string; label: string }[], id: string) => options.find((x) => x.id === id)?.label ?? 'Faixa de idade';

  /* ───────────── Telas ───────────── */
  if (o.scanning) {
    return (
      <div className="page-scroll">
        <PageHeader icon="layers" title="Organizador" subtitle="Lendo todas as subpastas…" playing />
        <ScanProgress taskId={o.taskId} title="Destrinchando as pastas" icon="layers" onCancel={o.cancelScan} />
      </div>
    );
  }

  if (!o.stats) {
    return (
      <div className="page-scroll">
        <PageHeader icon="layers" title="Organizador" subtitle="Veja todos os arquivos de várias pastas (e de todas as subpastas) em uma única lista." />
        <div className="card card-pad org-setup">
          <div className="org-setup-art anim-hover">
            <Icon name="layers" size={40} strokeWidth={1.5} />
          </div>
          <h2 className="org-setup-title">Quais pastas você quer destrinchar?</h2>
          <p className="muted" style={{ maxWidth: 560, textAlign: 'center' }}>
            O Organizador lê as pastas escolhidas e todas as subpastas, e mostra cada arquivo em uma lista só, com filtros por tipo, tamanho e data, para você
            organizar, mover ou excluir em lote. Você também pode arrastar pastas do Windows para cá.
          </p>
          <div style={{ width: '100%', maxWidth: 720 }}>
            <RootsPicker roots={o.roots} onAdd={o.addRoots} onRemove={o.removeRoot} />
          </div>
          <div className="row" style={{ gap: 18, flexWrap: 'wrap', justifyContent: 'center' }}>
            <label className="row" style={{ cursor: 'pointer' }}>
              <Toggle checked={o.includeHidden} onChange={(v) => o.setOptions({ includeHidden: v })} label="Incluir itens ocultos" />
              <span>Incluir itens ocultos</span>
            </label>
            <label className="row" style={{ cursor: 'pointer' }}>
              <Toggle checked={o.skipSystem} onChange={(v) => o.setOptions({ skipSystem: v })} label="Ignorar pastas do sistema" />
              <span>Ignorar pastas do sistema</span>
            </label>
          </div>
          <button type="button" className="btn btn-primary btn-lg anim-hover" disabled={!o.roots.length} onClick={() => void o.scan()}>
            <Icon name="scan" size={18} />
            Destrinchar {o.roots.length ? plural(o.roots.length, 'pasta', 'pastas') : ''}
          </button>
        </div>
      </div>
    );
  }

  const stats = o.stats;

  return (
    <div className="org-page">
      <div className="org-top">
        <PageHeader
          icon="layers"
          title="Organizador"
          subtitle={
            <>
              {plural(stats.files, 'arquivo', 'arquivos')} · {formatBytes(stats.bytes)} em {plural(stats.roots.length, 'pasta', 'pastas')} · lido em {formatElapsed(stats.elapsedMs)}
              {stats.errors ? <span className="faint"> · {plural(stats.errors, 'pasta sem acesso', 'pastas sem acesso')}</span> : null}
            </>
          }
          actions={
            <>
              <AnimatePresence>
                {stale ? (
                  <motion.span initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="badge badge-warning">
                    <Icon name="alert-triangle" size={12} />
                    Arquivos mudaram
                  </motion.span>
                ) : null}
              </AnimatePresence>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  setStale(false);
                  void o.scan();
                }}
              >
                <Icon name="refresh" size={14} />
                Analisar de novo
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  useOrganizer.setState({ stats: null, ids: [], summary: null, sel: EMPTY_SEL });
                  void api.scanDispose('organizador');
                }}
              >
                <Icon name="folder-plus" size={14} />
                Outras pastas
              </button>
            </>
          }
        />

        <div className="org-filters">
          <SearchInput value={textDraft} onChange={setTextDraft} placeholder="Nome ou *.extensão" inputRef={searchRef} width={230} small />
          <div className="org-fam-chips">
            {FAMILIES.map((f) => (
              <button key={f.id} type="button" className={`chip ${o.ui.families.includes(f.id) ? 'active' : ''}`} onClick={() => toggleFamily(f.id)}>
                <span className="chip-swatch" style={{ background: f.color }} />
                {f.label}
              </button>
            ))}
          </div>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <button type="button" className={`btn btn-sm ${o.ui.size ? 'btn-soft' : ''}`} onClick={(e) => selectMenu(e.currentTarget, SIZE_OPTIONS, o.ui.size, 'size')}>
              <Icon name="ruler" size={14} />
              {o.ui.size ? labelOf(SIZE_OPTIONS, o.ui.size) : 'Tamanho'}
              <Icon name="chevron-down" size={13} />
            </button>
            <button type="button" className={`btn btn-sm ${o.ui.modified ? 'btn-soft' : ''}`} onClick={(e) => selectMenu(e.currentTarget, MODIFIED_OPTIONS, o.ui.modified, 'modified')}>
              <Icon name="calendar" size={14} />
              {o.ui.modified ? labelOf(MODIFIED_OPTIONS, o.ui.modified) : 'Modificado'}
              <Icon name="chevron-down" size={13} />
            </button>
            <button type="button" className={`btn btn-sm ${o.ui.unused ? 'btn-soft' : ''}`} onClick={(e) => selectMenu(e.currentTarget, UNUSED_OPTIONS, o.ui.unused, 'unused')}>
              <Icon name="clock" size={14} />
              {o.ui.unused ? labelOf(UNUSED_OPTIONS, o.ui.unused) : 'Último uso'}
              <Icon name="chevron-down" size={13} />
            </button>
            {o.ui.folder ? (
              <span className="chip active">
                <Icon name="folder" size={13} />
                <span className="truncate" style={{ maxWidth: 160 }}>
                  {o.ui.folderName}
                </span>
                <button type="button" className="chip-remove" onClick={() => o.setUi({ folder: null, folderName: null })} aria-label="Remover filtro de pasta">
                  <Icon name="x" size={12} />
                </button>
              </span>
            ) : null}
            {o.ui.ext !== null ? (
              <span className="chip active">
                <Icon name="tag" size={13} />
                {o.ui.ext ? `.${o.ui.ext}` : 'sem extensão'}
                <button type="button" className="chip-remove" onClick={() => o.setUi({ ext: null })} aria-label="Remover filtro de extensão">
                  <Icon name="x" size={12} />
                </button>
              </span>
            ) : null}
            {filtersActive ? (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  setTextDraft('');
                  o.resetUi();
                }}
              >
                Limpar filtros
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="org-body">
        <section className="org-list">
          <div className="org-list-head">
            <span>
              <strong>{formatNumber(o.ids.length)}</strong> {o.ids.length === 1 ? 'arquivo' : 'arquivos'}
              <span className="faint"> · {formatBytes(o.totalSize)}</span>
            </span>
            <button type="button" className="btn btn-sm btn-ghost" onClick={selectAllResults} disabled={!o.ids.length}>
              <Icon name="select-all" size={14} />
              Selecionar todos
            </button>
          </div>
          <FileTable
            tableId="organizer"
            containerRef={listRef}
            columns={columns}
            count={o.ids.length}
            getRow={o.getRow}
            rowKey={(e) => String(e.id)}
            selected={o.sel.selected}
            focusKey={o.sel.focus}
            sort={o.sort}
            onSort={(k) => o.setSort(k)}
            onRowPointerDown={onRowPointerDown}
            onRowDoubleClick={(e) => void openPath(e.path)}
            onRowContextMenu={(ev, _i, e) => openContextMenu(ev, rowMenu(e))}
            onBackgroundPointerDown={() => o.setSel(EMPTY_SEL)}
            onVisibleRange={o.ensureRange}
            loading={o.loadingQuery && !o.ids.length}
            dimmed={o.loadingQuery && o.ids.length > 0}
            scrollToIndex={scrollTo}
            empty={
              <EmptyState icon="search" title="Nenhum arquivo encontrado" text={o.queryError ?? 'Nenhum arquivo corresponde aos filtros escolhidos.'}>
                {filtersActive ? (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setTextDraft('');
                      o.resetUi();
                    }}
                  >
                    Limpar filtros
                  </button>
                ) : null}
              </EmptyState>
            }
          />
          <AnimatePresence>
            {o.sel.selected.size ? (
              <motion.div
                className="action-bar"
                initial={{ opacity: 0, y: 24, x: '-50%' }}
                animate={{ opacity: 1, y: 0, x: '-50%' }}
                exit={{ opacity: 0, y: 24, x: '-50%' }}
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              >
                <span className="action-bar-count">
                  {plural(o.sel.selected.size, 'selecionado', 'selecionados')}
                  {selectedSize ? <span className="faint"> · {formatBytes(selectedSize)}</span> : null}
                </span>
                <button type="button" className="btn btn-sm" onClick={() => void doMove()}>
                  <Icon name="arrow-right" size={14} />
                  Mover para…
                </button>
                <button type="button" className="btn btn-sm" onClick={() => void doCopy()}>
                  <Icon name="copy" size={14} />
                  Copiar para…
                </button>
                <button type="button" className="btn btn-sm btn-danger-soft anim-hover" onClick={() => void doDelete(false)}>
                  <Icon name="trash" size={14} />
                  Lixeira
                </button>
                <button type="button" className="icon-btn" onClick={() => void doDelete(true)} data-tip="Excluir permanentemente">
                  <Icon name="trash-x" size={16} />
                </button>
                <button type="button" className="icon-btn" onClick={() => o.setSel(EMPTY_SEL)} data-tip="Limpar seleção (Esc)">
                  <Icon name="x" size={16} />
                </button>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </section>
        {o.summary ? <OrganizerSummary summary={o.summary} /> : null}
      </div>
    </div>
  );
}
