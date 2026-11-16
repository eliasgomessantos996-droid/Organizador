import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { FileTable, type ColumnId } from '../../components/FileTable';
import { FileGrid } from '../../components/FileGrid';
import { Icon } from '../../components/Icon';
import { EmptyState, SearchInput } from '../../components/ui/controls';
import { openContextMenu, openDropdown, type MenuEntry } from '../../components/ui/Menu';
import { trackDrag, useDrag, useExternalDrop } from '../../lib/dnd';
import { onFsChanged } from '../../lib/events';
import {
  clipboardSet,
  copyPathsAsText,
  copyTo,
  copyToFolder,
  deletePaths,
  moveToFolder,
  newFolder,
  newTextFile,
  openPath,
  pasteInto,
  renamePath,
  revealPath,
  undoLast,
} from '../../lib/fileops';
import {
  applyExplorerFilter,
  DATE_BUCKETS,
  hasColumnFilters,
  NAME_RANGES,
  SIZE_BUCKETS,
  sortEntries,
  typeOptions,
  type ExplorerFilter,
} from '../../lib/filters';
import { basename, formatBytes, plural, samePath } from '../../lib/format';
import { modKey } from '../../lib/platform';
import { clickSelect, EMPTY_SEL, invertSelection, moveFocus, selectAll, typeAhead } from '../../lib/selection';
import type { FileEntry, SortKey } from '../../lib/types';
import { useClipboard } from '../../store/clipboard';
import { useExplorer } from '../../store/explorer';
import { go, useNav } from '../../store/nav';
import { driveOf, specialOf, usePlaces } from '../../store/places';
import { useSettings } from '../../store/settings';
import { AddressBar } from './AddressBar';
import { DetailsPane } from './DetailsPane';
import { NavPane } from './NavPane';
import { ThisPC } from './ThisPC';

const COLUMNS: ColumnId[] = ['name', 'modified', 'type', 'size'];
const FILTERABLE: ColumnId[] = ['name', 'modified', 'type', 'size'];

function isTypingTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

function overlayOpen() {
  return !!document.querySelector('.dialog-overlay, .palette-overlay, .menu');
}

export function Explorer() {
  const ex = useExplorer();
  const params = useNav((s) => s.params);
  const showHidden = useSettings((s) => s.showHidden);
  const foldersFirst = useSettings((s) => s.foldersFirst);
  const viewMode = useSettings((s) => s.viewMode);
  const detailsPane = useSettings((s) => s.detailsPane);
  const favorites = useSettings((s) => s.favorites);
  const setSettings = useSettings((s) => s.set);
  const toggleFavorite = useSettings((s) => s.toggleFavorite);
  const clip = useClipboard();
  const loadPlaces = usePlaces((s) => s.load);
  const special = usePlaces((s) => s.special);
  const [cols, setCols] = useState(1);
  const [winW, setWinW] = useState(window.innerWidth);
  useEffect(() => {
    const onResize = () => setWinW(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  // Em janelas estreitas o painel de detalhes some para dar espaço à lista.
  const showDetails = detailsPane && winW >= 1180;
  const [scrollTo, setScrollTo] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const typeBuf = useRef({ text: '', at: 0 });
  const started = useRef(false);

  const { path, entries, sort, filter, sel, renaming } = ex;

  /* ───────────── Carregamento inicial e navegação vinda de outras páginas ───────────── */
  useEffect(() => {
    void loadPlaces();
  }, [loadPlaces]);

  useEffect(() => {
    if (params.path) {
      void useExplorer.getState().navigate(params.path);
      started.current = true;
      return;
    }
    if (started.current || useExplorer.getState().version > 0) return;
    if (!special) return;
    started.current = true;
    const s = useSettings.getState();
    const start = s.explorerStart === 'downloads' ? (special.downloads ?? '') : s.explorerStart === 'ultima' ? s.lastPath : '';
    void useExplorer.getState().navigate(start, { push: false });
  }, [params.nonce, params.path, special]);

  // Mostrar/ocultar arquivos ocultos recarrega a pasta.
  const firstHidden = useRef(true);
  useEffect(() => {
    if (firstHidden.current) {
      firstHidden.current = false;
      return;
    }
    void useExplorer.getState().reload({ quiet: true });
  }, [showHidden]);

  // Recarrega quando arquivos mudam nesta pasta ou ao voltar para a janela.
  useEffect(() => {
    const off = onFsChanged((dirs) => {
      const cur = useExplorer.getState().path;
      if (cur && dirs.some((d) => samePath(d, cur))) void useExplorer.getState().reload({ quiet: true });
    });
    let t: number | undefined;
    const onFocus = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => void useExplorer.getState().reload({ quiet: true }), 250);
    };
    window.addEventListener('focus', onFocus);
    return () => {
      off();
      window.removeEventListener('focus', onFocus);
      window.clearTimeout(t);
    };
  }, []);

  /* ───────────── Lista visível ───────────── */
  const visible = useMemo(() => sortEntries(applyExplorerFilter(entries, filter), sort, foldersFirst), [entries, filter, sort, foldersFirst]);
  const keys = useMemo(() => visible.map((e) => e.path), [visible]);
  const selectedEntries = useMemo(() => visible.filter((e) => sel.selected.has(e.path)), [visible, sel.selected]);
  const cutKeys = useMemo(() => (clip.cut ? new Set(clip.paths) : undefined), [clip]);
  const filtersActive = hasColumnFilters(filter);

  const getSelPaths = () => [...useExplorer.getState().sel.selected];
  const setSel = ex.setSel;

  const focusList = () => listRef.current?.focus({ preventScroll: true });
  const scrollToKey = (k: string | null) => {
    if (!k) return;
    const i = keys.indexOf(k);
    if (i >= 0) setScrollTo(i + Math.random() * 0.001);
  };

  /* ───────────── Ações ───────────── */
  const navigate = useCallback((p: string) => void useExplorer.getState().navigate(p), []);

  const open = (e: FileEntry) => {
    if (e.isDir) navigate(e.path);
    else void openPath(e.path);
  };

  const doPaste = async (dest = path) => {
    if (!dest) return;
    const created = (await pasteInto(dest)).map((d) => d.to);
    if (created.length && samePath(dest, useExplorer.getState().path)) await useExplorer.getState().reload({ select: created });
  };

  const doNewFolder = async () => {
    if (!path) return;
    const p = await newFolder(path);
    if (p) await useExplorer.getState().reload({ select: [p], rename: p });
  };

  const doNewText = async () => {
    if (!path) return;
    const p = await newTextFile(path);
    if (p) await useExplorer.getState().reload({ select: [p], rename: p });
  };

  const doDelete = (permanent?: boolean) => {
    const paths = getSelPaths();
    if (paths.length) void deletePaths(paths, permanent);
  };

  const doRenameCommit = async (entry: FileEntry, name: string) => {
    ex.setRenaming(null);
    const to = await renamePath(entry.path, name);
    if (to) await useExplorer.getState().reload({ select: [to] });
    focusList();
  };

  const startRename = () => {
    const paths = getSelPaths();
    if (paths.length === 1) ex.setRenaming(paths[0]);
  };

  const sortBy = (key: SortKey, desc?: boolean) => ex.setSort(key, desc);

  /* ───────────── Menus ───────────── */
  const newMenu: MenuEntry[] = [
    { label: 'Pasta', icon: 'folder-plus', shortcut: `${modKey}+Shift+N`, onSelect: () => void doNewFolder() },
    { label: 'Documento de texto', icon: 'file-plus', onSelect: () => void doNewText() },
  ];

  const sortMenu: MenuEntry[] = [
    { label: 'Nome', checked: sort.key === 'name', onSelect: () => sortBy('name', sort.desc) },
    { label: 'Data de modificação', checked: sort.key === 'modified', onSelect: () => sortBy('modified', sort.desc) },
    { label: 'Tipo', checked: sort.key === 'type', onSelect: () => sortBy('type', sort.desc) },
    { label: 'Tamanho', checked: sort.key === 'size', onSelect: () => sortBy('size', sort.desc) },
    { separator: true },
    { label: 'Crescente', icon: 'arrow-up', checked: !sort.desc, onSelect: () => sortBy(sort.key, false) },
    { label: 'Decrescente', icon: 'arrow-down', checked: sort.desc, onSelect: () => sortBy(sort.key, true) },
    { separator: true },
    { label: 'Pastas sempre no topo', checked: foldersFirst, onSelect: () => setSettings({ foldersFirst: !foldersFirst }) },
  ];

  const viewMenu: MenuEntry[] = [
    { label: 'Detalhes', icon: 'list', checked: viewMode === 'detalhes', onSelect: () => setSettings({ viewMode: 'detalhes' }) },
    { label: 'Ícones grandes', icon: 'grid', checked: viewMode === 'icones', onSelect: () => setSettings({ viewMode: 'icones' }) },
    { separator: true },
    { label: 'Painel de detalhes', icon: 'panel-right', checked: detailsPane, onSelect: () => setSettings({ detailsPane: !detailsPane }) },
    { label: 'Itens ocultos', icon: 'eye', checked: showHidden, onSelect: () => setSettings({ showHidden: !showHidden }) },
    { label: 'Extensões de arquivos', icon: 'type', checked: useSettings.getState().showExtensions, onSelect: () => setSettings({ showExtensions: !useSettings.getState().showExtensions }) },
    { label: 'Miniaturas de imagens', icon: 'image', checked: useSettings.getState().thumbnails, onSelect: () => setSettings({ thumbnails: !useSettings.getState().thumbnails }) },
  ];

  const analyzeMenu = (p: string): MenuEntry[] => [
    { label: 'Destrinchar no Organizador', icon: 'layers', onSelect: () => go('organizador', { paths: [p], autoStart: true }) },
    { label: 'Analisar espaço (Mapa)', icon: 'treemap', onSelect: () => go('mapa', { path: p, autoStart: true }) },
    { label: 'Procurar duplicados', icon: 'copies', onSelect: () => go('duplicados', { paths: [p], autoStart: true }) },
  ];

  const moreMenu = (): MenuEntry[] => [
    { label: 'Selecionar tudo', icon: 'select-all', shortcut: `${modKey}+A`, onSelect: () => setSel(selectAll(keys, sel.focus)) },
    { label: 'Inverter seleção', icon: 'arrow-up-down', onSelect: () => setSel(invertSelection(sel, keys)) },
    { label: 'Limpar seleção', icon: 'x', shortcut: 'Esc', onSelect: () => setSel(EMPTY_SEL) },
    { separator: true },
    { label: 'Desfazer', icon: 'undo', shortcut: `${modKey}+Z`, onSelect: () => void undoLast() },
    { separator: true },
    { label: 'Copiar caminho da pasta', icon: 'link', disabled: !path, onSelect: () => void copyPathsAsText([path]) },
    { label: 'Abrir no Explorer do Windows', icon: 'external-link', disabled: !path, onSelect: () => void openPath(path) },
    {
      label: favorites.some((f) => samePath(f, path)) ? 'Remover dos favoritos' : 'Fixar nos favoritos',
      icon: 'star',
      disabled: !path,
      onSelect: () => toggleFavorite(path),
    },
    { separator: true },
    { label: 'Analisar esta pasta', icon: 'scan', disabled: !path, submenu: analyzeMenu(path) },
  ];

  const rowMenu = (e: FileEntry): MenuEntry[] => {
    const paths = getSelPaths();
    const many = paths.length > 1;
    const items: MenuEntry[] = [];
    if (!many) {
      items.push({ label: e.isDir ? 'Abrir' : 'Abrir', icon: e.isDir ? 'folder-open' : 'external-link', shortcut: 'Enter', onSelect: () => open(e) });
      items.push({ label: 'Mostrar no Explorer do Windows', icon: 'folder-search', onSelect: () => void revealPath(e.path) });
      items.push({ separator: true });
    }
    items.push(
      { label: 'Recortar', icon: 'scissors', shortcut: `${modKey}+X`, onSelect: () => void clipboardSet(paths, true) },
      { label: 'Copiar', icon: 'copy', shortcut: `${modKey}+C`, onSelect: () => void clipboardSet(paths, false) },
    );
    if (e.isDir && !many) items.push({ label: 'Colar nesta pasta', icon: 'paste', onSelect: () => void doPaste(e.path) });
    items.push(
      { label: 'Copiar para…', icon: 'copy', onSelect: () => void copyToFolder(paths) },
      { label: 'Mover para…', icon: 'arrow-right', onSelect: () => void moveToFolder(paths) },
      { label: many ? 'Copiar caminhos' : 'Copiar caminho', icon: 'link', onSelect: () => void copyPathsAsText(paths) },
      { separator: true },
    );
    if (!many) items.push({ label: 'Renomear', icon: 'pencil', shortcut: 'F2', onSelect: () => ex.setRenaming(e.path) });
    items.push(
      { label: 'Excluir', icon: 'trash', shortcut: 'Del', danger: true, onSelect: () => doDelete(false) },
      { label: 'Excluir permanentemente', icon: 'trash-x', shortcut: 'Shift+Del', danger: true, onSelect: () => doDelete(true) },
    );
    if (e.isDir && !many) {
      items.push(
        { separator: true },
        {
          label: favorites.some((f) => samePath(f, e.path)) ? 'Remover dos favoritos' : 'Fixar nos favoritos',
          icon: 'star',
          onSelect: () => toggleFavorite(e.path),
        },
        { label: 'Analisar', icon: 'scan', submenu: analyzeMenu(e.path) },
      );
    }
    return items;
  };

  const bgMenu = (): MenuEntry[] => [
    { label: 'Exibir', icon: viewMode === 'detalhes' ? 'list' : 'grid', submenu: viewMenu },
    { label: 'Classificar por', icon: 'sort', submenu: sortMenu },
    { label: 'Atualizar', icon: 'refresh', shortcut: 'F5', onSelect: () => void ex.reload() },
    { separator: true },
    { label: 'Colar', icon: 'paste', shortcut: `${modKey}+V`, disabled: !path, onSelect: () => void doPaste() },
    { label: 'Desfazer', icon: 'undo', shortcut: `${modKey}+Z`, onSelect: () => void undoLast() },
    { separator: true },
    { label: 'Novo', icon: 'plus', submenu: newMenu, disabled: !path },
    { label: 'Selecionar tudo', icon: 'select-all', shortcut: `${modKey}+A`, onSelect: () => setSel(selectAll(keys, sel.focus)) },
    { separator: true },
    { label: 'Abrir no Explorer do Windows', icon: 'external-link', disabled: !path, onSelect: () => void openPath(path) },
    { label: 'Analisar esta pasta', icon: 'scan', disabled: !path, submenu: analyzeMenu(path) },
  ];

  /* ───────────── Filtros por coluna (como no Explorer) ───────────── */
  const toggleIn = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const headerFilter = (col: ColumnId, el: HTMLElement) => {
    const f = useExplorer.getState().filter;
    const set = (patch: Partial<ExplorerFilter>) => ex.setFilter(patch);
    let items: MenuEntry[] = [];
    if (col === 'name') items = NAME_RANGES.map((r) => ({ label: r.label, checked: f.names.includes(r.id), onSelect: () => set({ names: toggleIn(f.names, r.id) }) }));
    if (col === 'modified') items = DATE_BUCKETS.map((b) => ({ label: b.label, checked: f.dates.includes(b.id), onSelect: () => set({ dates: toggleIn(f.dates, b.id) }) }));
    if (col === 'size') items = SIZE_BUCKETS.map((b) => ({ label: `${b.label} (${b.hint})`, checked: f.sizes.includes(b.id), onSelect: () => set({ sizes: toggleIn(f.sizes, b.id) }) }));
    if (col === 'type')
      items = typeOptions(entries).map((t) => ({ label: `${t.key} (${t.count})`, checked: f.types.includes(t.key), onSelect: () => set({ types: toggleIn(f.types, t.key) }) }));
    const key = { name: 'names', modified: 'dates', size: 'sizes', type: 'types' }[col as 'name'] as keyof ExplorerFilter;
    if ((f[key] as string[])?.length) items.push({ separator: true }, { label: 'Limpar este filtro', icon: 'x', onSelect: () => set({ [key]: [] }) });
    openDropdown(el, items.length ? items : [{ label: 'Nenhuma opção', disabled: true }]);
  };

  const activeFilterCols: ColumnId[] = [
    ...(filter.names.length ? (['name'] as const) : []),
    ...(filter.dates.length ? (['modified'] as const) : []),
    ...(filter.types.length ? (['type'] as const) : []),
    ...(filter.sizes.length ? (['size'] as const) : []),
  ];

  /* ───────────── Mouse ───────────── */
  const onItemPointerDown = (ev: React.PointerEvent, index: number, entry: FileEntry) => {
    focusList();
    if (ev.button === 2) {
      if (!sel.selected.has(entry.path)) setSel(clickSelect(EMPTY_SEL, keys, index, { ctrl: false, shift: false }));
      return;
    }
    if (ev.button !== 0) return;
    const mods = { ctrl: ev.ctrlKey || ev.metaKey, shift: ev.shiftKey };
    if (!mods.ctrl && !mods.shift && sel.selected.has(entry.path) && sel.selected.size > 1) {
      // Mantém a seleção para permitir arrastar vários; se for só um clique, seleciona um.
      const onUp = () => {
        window.removeEventListener('pointerup', onUp);
        window.setTimeout(() => {
          if (Date.now() - useDrag.getState().lastDragEnd > 120) setSel(clickSelect(EMPTY_SEL, keys, index, { ctrl: false, shift: false }));
        }, 0);
      };
      window.addEventListener('pointerup', onUp);
    } else {
      setSel(clickSelect(sel, keys, index, mods));
    }
    trackDrag(ev, getSelPaths, { name: entry.name, category: entry.category });
  };

  const onBgPointerDown = (ev: React.PointerEvent) => {
    focusList();
    if (!ev.ctrlKey && !ev.shiftKey) setSel(EMPTY_SEL);
  };

  /* ───────────── Teclado (atalhos do Explorer) ───────────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (overlayOpen()) return;
      const st = useExplorer.getState();
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key;
      const typing = isTypingTarget(e.target);

      // Atalhos que valem mesmo digitando em campos.
      if ((ctrl && k.toLowerCase() === 'l') || (e.altKey && k.toLowerCase() === 'd')) {
        e.preventDefault();
        window.dispatchEvent(new Event('explorer:edit-address'));
        return;
      }
      if ((ctrl && k.toLowerCase() === 'f') || k === 'F3') {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (typing || st.renaming) return;

      if (e.altKey && k === 'ArrowLeft') return void (e.preventDefault(), st.goBack());
      if (e.altKey && k === 'ArrowRight') return void (e.preventDefault(), st.goForward());
      if ((e.altKey && k === 'ArrowUp') || k === 'Backspace') return void (e.preventDefault(), st.goUp());
      if (k === 'F5') return void (e.preventDefault(), st.reload());
      if (ctrl && e.shiftKey && k.toLowerCase() === 'n') return void (e.preventDefault(), doNewFolder());
      if (ctrl && k.toLowerCase() === 'z') return void (e.preventDefault(), undoLast());
      if (ctrl && k.toLowerCase() === 'v') return void (e.preventDefault(), doPaste());
      if (!st.path) return;

      const selPaths = [...st.sel.selected];
      if (ctrl && k.toLowerCase() === 'a') return void (e.preventDefault(), setSel(selectAll(keys, st.sel.focus)));
      if (ctrl && k.toLowerCase() === 'c') return void (e.preventDefault(), clipboardSet(selPaths, false));
      if (ctrl && k.toLowerCase() === 'x') return void (e.preventDefault(), clipboardSet(selPaths, true));
      if (k === 'Delete') return void (e.preventDefault(), doDelete(e.shiftKey ? true : undefined));
      if (k === 'F2') return void (e.preventDefault(), startRename());
      if (k === 'Escape') return void setSel(EMPTY_SEL);
      if (k === 'Enter') {
        e.preventDefault();
        const items = visible.filter((x) => st.sel.selected.has(x.path));
        if (items.length === 1) open(items[0]);
        else items.filter((x) => !x.isDir).forEach((x) => void openPath(x.path));
        return;
      }
      const grid = useSettings.getState().viewMode === 'icones';
      const pageSize = Math.max(1, Math.floor((listRef.current?.clientHeight ?? 400) / 34) - 1);
      const moves: Record<string, number | 'home' | 'end'> = {
        ArrowDown: grid ? cols : 1,
        ArrowUp: grid ? -cols : -1,
        PageDown: pageSize,
        PageUp: -pageSize,
        Home: 'home',
        End: 'end',
        ...(grid ? { ArrowRight: 1, ArrowLeft: -1 } : {}),
      };
      if (k in moves) {
        e.preventDefault();
        const next = moveFocus(st.sel, keys, moves[k], { shift: e.shiftKey, ctrl });
        setSel(next);
        scrollToKey(next.focus);
        return;
      }
      // Busca por digitação: pula para o item que começa com as letras digitadas.
      if (k.length === 1 && !ctrl && !e.altKey && /\S/.test(k)) {
        const now = Date.now();
        typeBuf.current.text = now - typeBuf.current.at > 900 ? k : typeBuf.current.text + k;
        typeBuf.current.at = now;
        const hit = typeAhead(
          visible.map((x) => x.name),
          keys,
          typeBuf.current.text,
          st.sel.focus,
        );
        if (hit) {
          setSel({ selected: new Set([hit]), anchor: hit, focus: hit });
          scrollToKey(hit);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /* ───────────── Arquivos arrastados do Windows ───────────── */
  const onExternalDrop = useCallback(
    (paths: string[], target: string | null) => {
      const dest = target ?? useExplorer.getState().path;
      if (dest) void copyTo(paths, dest);
    },
    [],
  );
  useExternalDrop(onExternalDrop);

  /* ───────────── Renderização ───────────── */
  const drive = path ? driveOf(path) : null;
  const totalSelectedSize = selectedEntries.filter((e) => !e.isDir).reduce((s, e) => s + e.size, 0);

  const emptyNode = ex.error ? (
    <EmptyState icon="alert-triangle" title="Não foi possível abrir a pasta" text={ex.error}>
      <button type="button" className="btn" onClick={() => ex.goUp()}>
        <Icon name="arrow-up" size={15} />
        Pasta acima
      </button>
      <button type="button" className="btn btn-primary" onClick={() => void ex.reload()}>
        <Icon name="refresh" size={15} />
        Tentar de novo
      </button>
    </EmptyState>
  ) : filter.text || filtersActive ? (
    <EmptyState icon="search" title="Nenhum item corresponde" text={filter.text ? `Nada com “${filter.text}” nesta pasta.` : 'Os filtros escondem todos os itens desta pasta.'}>
      {filter.text ? (
        <button type="button" className="btn btn-primary" onClick={() => go('organizador', { paths: [path], autoStart: true, text: filter.text })}>
          <Icon name="layers" size={15} />
          Pesquisar nas subpastas
        </button>
      ) : null}
      <button type="button" className="btn" onClick={() => ex.setFilter({ text: '', names: [], dates: [], types: [], sizes: [] })}>
        Limpar filtros
      </button>
    </EmptyState>
  ) : (
    <EmptyState icon="folder-open" title="Esta pasta está vazia" text="Arraste arquivos para cá ou cole com Ctrl+V.">
      <button type="button" className="btn" onClick={() => void doNewFolder()}>
        <Icon name="folder-plus" size={15} />
        Nova pasta
      </button>
    </EmptyState>
  );

  const chips: { label: string; clear: () => void }[] = [
    ...(filter.names.length ? [{ label: `Nome: ${filter.names.map((n) => NAME_RANGES.find((r) => r.id === n)?.label).join(', ')}`, clear: () => ex.setFilter({ names: [] }) }] : []),
    ...(filter.dates.length ? [{ label: `Data: ${filter.dates.map((d) => DATE_BUCKETS.find((b) => b.id === d)?.label).join(', ')}`, clear: () => ex.setFilter({ dates: [] }) }] : []),
    ...(filter.types.length ? [{ label: `Tipo: ${filter.types.join(', ')}`, clear: () => ex.setFilter({ types: [] }) }] : []),
    ...(filter.sizes.length ? [{ label: `Tamanho: ${filter.sizes.map((s) => SIZE_BUCKETS.find((b) => b.id === s)?.label).join(', ')}`, clear: () => ex.setFilter({ sizes: [] }) }] : []),
  ];

  return (
    <div className="explorer">
      <div className="explorer-toolbar">
        <div className="row" style={{ gap: 2 }}>
          <button type="button" className="icon-btn" onClick={ex.goBack} disabled={!ex.back.length} data-tip="Voltar (Alt+←)" aria-label="Voltar">
            <Icon name="arrow-left" size={17} />
          </button>
          <button type="button" className="icon-btn" onClick={ex.goForward} disabled={!ex.forward.length} data-tip="Avançar (Alt+→)" aria-label="Avançar">
            <Icon name="arrow-right" size={17} />
          </button>
          <button type="button" className="icon-btn" onClick={ex.goUp} disabled={!path} data-tip="Pasta acima (Alt+↑)" aria-label="Pasta acima">
            <Icon name="arrow-up" size={17} />
          </button>
          <button type="button" className="icon-btn" onClick={() => void ex.reload()} disabled={!path} data-tip="Atualizar (F5)" aria-label="Atualizar">
            <Icon name="refresh" size={16} className={ex.loading ? 'spin' : undefined} />
          </button>
        </div>
        <AddressBar path={path} onNavigate={navigate} />
        <SearchInput
          value={filter.text}
          onChange={(t) => ex.setFilter({ text: t })}
          placeholder={path ? `Pesquisar em ${basename(path)}` : 'Pesquisar'}
          inputRef={searchRef}
          width={260}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && filter.text && path) go('organizador', { paths: [path], autoStart: true, text: filter.text });
            if (e.key === 'ArrowDown') focusList();
          }}
        />
      </div>

      <div className="explorer-commandbar">
        <button type="button" className="btn btn-sm btn-primary anim-hover" disabled={!path} onClick={(e) => openDropdown(e.currentTarget, newMenu)}>
          <Icon name="plus" size={15} />
          Novo
        </button>
        <span className="cb-sep" />
        <button type="button" className="icon-btn anim-hover" disabled={!sel.selected.size} onClick={() => void clipboardSet(getSelPaths(), true)} data-tip={`Recortar (${modKey}+X)`} aria-label="Recortar">
          <Icon name="scissors" size={17} />
        </button>
        <button type="button" className="icon-btn anim-hover" disabled={!sel.selected.size} onClick={() => void clipboardSet(getSelPaths(), false)} data-tip={`Copiar (${modKey}+C)`} aria-label="Copiar">
          <Icon name="copy" size={17} />
        </button>
        <button type="button" className="icon-btn anim-hover" disabled={!path} onClick={() => void doPaste()} data-tip={`Colar (${modKey}+V)`} aria-label="Colar">
          <Icon name="paste" size={17} />
        </button>
        <button type="button" className="icon-btn anim-hover" disabled={sel.selected.size !== 1} onClick={startRename} data-tip="Renomear (F2)" aria-label="Renomear">
          <Icon name="pencil" size={17} />
        </button>
        <button type="button" className="icon-btn anim-hover" disabled={!sel.selected.size} onClick={() => doDelete()} data-tip="Excluir (Del)" aria-label="Excluir">
          <Icon name="trash" size={17} />
        </button>
        <span className="cb-sep" />
        <button type="button" className="btn btn-sm btn-ghost" onClick={(e) => openDropdown(e.currentTarget, sortMenu)}>
          <Icon name="sort" size={15} />
          Classificar
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={(e) => openDropdown(e.currentTarget, viewMenu)}>
          <Icon name={viewMode === 'detalhes' ? 'list' : 'grid'} size={15} />
          Exibir
        </button>
        <button
          type="button"
          className={`btn btn-sm btn-ghost ${filtersActive ? 'active-filter' : ''}`}
          disabled={!path}
          onClick={(e) =>
            openDropdown(e.currentTarget, [
              { label: 'Nome', icon: 'type', submenu: NAME_RANGES.map((r) => ({ label: r.label, checked: filter.names.includes(r.id), onSelect: () => ex.setFilter({ names: toggleIn(filter.names, r.id) }) })) },
              { label: 'Data de modificação', icon: 'calendar', submenu: DATE_BUCKETS.map((b) => ({ label: b.label, checked: filter.dates.includes(b.id), onSelect: () => ex.setFilter({ dates: toggleIn(filter.dates, b.id) }) })) },
              {
                label: 'Tipo',
                icon: 'tag',
                submenu: typeOptions(entries).length
                  ? typeOptions(entries).map((t) => ({ label: `${t.key} (${t.count})`, checked: filter.types.includes(t.key), onSelect: () => ex.setFilter({ types: toggleIn(filter.types, t.key) }) }))
                  : [{ label: 'Nenhum item', disabled: true }],
              },
              { label: 'Tamanho', icon: 'ruler', submenu: SIZE_BUCKETS.map((b) => ({ label: `${b.label} (${b.hint})`, checked: filter.sizes.includes(b.id), onSelect: () => ex.setFilter({ sizes: toggleIn(filter.sizes, b.id) }) })) },
              { separator: true },
              { label: 'Limpar filtros', icon: 'x', disabled: !filtersActive, onSelect: () => ex.clearFilters() },
            ])
          }
        >
          <Icon name="filter" size={15} />
          Filtrar
        </button>
        <div className="spacer" />
        <button type="button" className={`icon-btn ${detailsPane ? 'active' : ''}`} onClick={() => setSettings({ detailsPane: !detailsPane })} data-tip="Painel de detalhes" aria-label="Painel de detalhes">
          <Icon name="panel-right" size={17} />
        </button>
        <button type="button" className="icon-btn" onClick={(e) => openDropdown(e.currentTarget, moreMenu(), 'right')} data-tip="Mais opções" aria-label="Mais opções">
          <Icon name="more-h" size={17} />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {chips.length ? (
          <motion.div className="filter-chips" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            <div className="filter-chips-inner">
              <Icon name="filter" size={14} className="faint" />
              {chips.map((c) => (
                <span key={c.label} className="chip active">
                  <span className="truncate" style={{ maxWidth: 260 }}>
                    {c.label}
                  </span>
                  <button type="button" className="chip-remove" onClick={c.clear} aria-label="Remover filtro">
                    <Icon name="x" size={12} />
                  </button>
                </span>
              ))}
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => ex.clearFilters()}>
                Limpar filtros
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="explorer-body">
        <NavPane current={path} onOpen={navigate} />
        <section className="explorer-main" onContextMenu={(e) => !path && e.preventDefault()}>
          {!path ? (
            <div className="explorer-pc-scroll">
              <ThisPC onOpen={navigate} />
            </div>
          ) : viewMode === 'detalhes' ? (
            <FileTable
              tableId="explorer"
              containerRef={listRef}
              columns={COLUMNS}
              count={visible.length}
              getRow={(i) => visible[i]}
              rowKey={(e) => e.path}
              selected={sel.selected}
              focusKey={sel.focus}
              cutKeys={cutKeys}
              sort={sort}
              onSort={(k) => sortBy(k)}
              onRowPointerDown={onItemPointerDown}
              onRowDoubleClick={(e) => open(e)}
              onRowContextMenu={(ev, _i, e) => openContextMenu(ev, rowMenu(e))}
              onBackgroundPointerDown={onBgPointerDown}
              onBackgroundContextMenu={(ev) => openContextMenu(ev, bgMenu())}
              renamingKey={renaming}
              onRenameCommit={(e, name) => void doRenameCommit(e, name)}
              onRenameCancel={() => {
                ex.setRenaming(null);
                focusList();
              }}
              onHeaderFilter={headerFilter}
              filterable={FILTERABLE}
              activeFilters={activeFilterCols}
              specialOf={specialOf}
              empty={emptyNode}
              loading={ex.loading && !entries.length}
              scrollToIndex={scrollTo}
            />
          ) : (
            <FileGrid
              count={visible.length}
              getRow={(i) => visible[i]}
              rowKey={(e) => e.path}
              selected={sel.selected}
              focusKey={sel.focus}
              cutKeys={cutKeys}
              onItemPointerDown={onItemPointerDown}
              onItemDoubleClick={(e) => open(e)}
              onItemContextMenu={(ev, _i, e) => openContextMenu(ev, rowMenu(e))}
              onBackgroundPointerDown={onBgPointerDown}
              onBackgroundContextMenu={(ev) => openContextMenu(ev, bgMenu())}
              onColumns={setCols}
              renamingKey={renaming}
              onRenameCommit={(e, name) => void doRenameCommit(e, name)}
              onRenameCancel={() => ex.setRenaming(null)}
              specialOf={specialOf}
              scrollToIndex={scrollTo}
              empty={emptyNode}
            />
          )}
        </section>
        <AnimatePresence initial={false}>
          {showDetails ? (
            <motion.div className="details-wrap" initial={{ width: 0, opacity: 0 }} animate={{ width: 272, opacity: 1 }} exit={{ width: 0, opacity: 0 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
              <DetailsPane selected={selectedEntries} folderPath={path} folderEntries={entries} />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <footer className="status-bar">
        <span>
          {path ? (
            <>
              {plural(visible.length, 'item', 'itens')}
              {visible.length !== entries.length ? <span className="faint"> (de {entries.length})</span> : null}
            </>
          ) : (
            'Este computador'
          )}
        </span>
        {sel.selected.size ? (
          <span>
            {plural(sel.selected.size, 'item selecionado', 'itens selecionados')}
            {totalSelectedSize ? ` · ${formatBytes(totalSelectedSize)}` : ''}
          </span>
        ) : null}
        {clip.paths.length ? (
          <span className="faint">
            <Icon name={clip.cut ? 'scissors' : 'copy'} size={12} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />
            {plural(clip.paths.length, 'item', 'itens')} {clip.cut ? 'recortado' : 'copiado'}
            {clip.paths.length > 1 ? 's' : ''}
          </span>
        ) : null}
        <span className="spacer" />
        {drive ? (
          <span className="faint">
            {formatBytes(drive.free)} livres em {drive.mount.replace(/\\$/, '')}
          </span>
        ) : null}
      </footer>
    </div>
  );
}
