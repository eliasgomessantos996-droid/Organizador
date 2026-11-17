import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { FileIcon, type SpecialFolder } from './FileIcon';
import { Icon } from './Icon';
import { typeLabel } from '../lib/categories';
import { formatBytes, formatDate } from '../lib/format';
import type { FileEntry, SortKey, SortSpec } from '../lib/types';
import { useSettings } from '../store/settings';

export type ColumnId = 'name' | 'modified' | 'type' | 'size' | 'folder' | 'created' | 'accessed' | 'used';

interface ColumnDef {
  label: string;
  width: number;
  min: number;
  align?: 'right';
  sortKey: SortKey;
}

const COLUMNS: Record<ColumnId, ColumnDef> = {
  name: { label: 'Nome', width: 200, min: 140, sortKey: 'name' },
  modified: { label: 'Data de modificação', width: 142, min: 100, sortKey: 'modified' },
  type: { label: 'Tipo', width: 150, min: 80, sortKey: 'type' },
  size: { label: 'Tamanho', width: 92, min: 66, align: 'right', sortKey: 'size' },
  folder: { label: 'Pasta', width: 230, min: 110, sortKey: 'folder' },
  created: { label: 'Data de criação', width: 142, min: 100, sortKey: 'created' },
  accessed: { label: 'Último acesso', width: 142, min: 100, sortKey: 'accessed' },
  used: { label: 'Último uso', width: 132, min: 96, sortKey: 'used' },
};

/** Encurta um caminho no meio: "C:\Users\…\Fotos\Férias". */
export function middleEllipsis(text: string, max: number): string {
  if (text.length <= max) return text;
  const keepEnd = Math.ceil(max * 0.6);
  const keepStart = Math.max(3, max - keepEnd - 1);
  return `${text.slice(0, keepStart)}…${text.slice(text.length - keepEnd)}`;
}

function displayName(e: FileEntry, showExt: boolean) {
  if (showExt || e.isDir || !e.ext) return e.name;
  const i = e.name.lastIndexOf('.');
  return i > 0 ? e.name.slice(0, i) : e.name;
}

export interface FileTableProps {
  tableId: string;
  columns: ColumnId[];
  count: number;
  getRow: (index: number) => FileEntry | undefined;
  rowKey: (e: FileEntry) => string;
  selected: Set<string>;
  focusKey: string | null;
  cutKeys?: Set<string>;
  sort: SortSpec;
  onSort: (key: SortKey) => void;
  onRowPointerDown: (e: React.PointerEvent, index: number, entry: FileEntry) => void;
  onRowDoubleClick: (entry: FileEntry, index: number) => void;
  onRowContextMenu: (e: React.MouseEvent, index: number, entry: FileEntry) => void;
  onBackgroundPointerDown?: (e: React.PointerEvent) => void;
  onBackgroundContextMenu?: (e: React.MouseEvent) => void;
  onVisibleRange?: (start: number, end: number) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  renamingKey?: string | null;
  onRenameCommit?: (entry: FileEntry, name: string) => void;
  onRenameCancel?: () => void;
  onHeaderFilter?: (col: ColumnId, el: HTMLElement) => void;
  filterable?: ColumnId[];
  activeFilters?: ColumnId[];
  specialOf?: (path: string) => SpecialFolder | null;
  empty?: ReactNode;
  loading?: boolean;
  /** Muda para rolar até o item com foco (ex.: após navegação por teclado). */
  scrollToIndex?: number | null;
  dimmed?: boolean;
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

const RenameInput = memo(function RenameInput({ initial, isDir, onCommit, onCancel }: { initial: string; isDir: boolean; onCommit: (v: string) => void; onCancel: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const dot = initial.lastIndexOf('.');
    if (!isDir && dot > 0) el.setSelectionRange(0, dot);
    else el.select();
  }, [initial, isDir]);
  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    if (commit) onCommit(ref.current?.value ?? initial);
    else onCancel();
  };
  return (
    <input
      ref={ref}
      className="ft-rename"
      defaultValue={initial}
      spellCheck={false}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(true);
        if (e.key === 'Escape') finish(false);
      }}
      onBlur={() => finish(true)}
    />
  );
});

/** Tabela virtualizada de arquivos (modo "Detalhes" do Explorer). */
export function FileTable(p: FileTableProps) {
  const density = useSettings((s) => s.density);
  const showExt = useSettings((s) => s.showExtensions);
  const savedWidths = useSettings((s) => s.columnWidths);
  const setSettings = useSettings((s) => s.set);
  const rowH = density === 'compacta' ? 28 : 34;
  const headerH = 36;
  const innerRef = useRef<HTMLDivElement>(null);
  const scrollRef = p.containerRef ?? innerRef;
  const [dragWidths, setDragWidths] = useState<Record<string, number>>({});

  const widthOf = (c: ColumnId) => dragWidths[c] ?? savedWidths[`${p.tableId}.${c}`] ?? COLUMNS[c].width;
  const template = p.columns.map((c) => (c === 'name' ? `minmax(${widthOf(c)}px, 1fr)` : `${widthOf(c)}px`)).join(' ');
  const minWidth = p.columns.reduce((s, c) => s + widthOf(c), 0) + 24;

  const v = useVirtualizer({
    count: p.count,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowH,
    overscan: 14,
    paddingStart: headerH,
    paddingEnd: 72,
  });

  useEffect(() => {
    v.measure();
  }, [rowH, v]);

  const items = v.getVirtualItems();
  const first = items[0]?.index ?? 0;
  const last = items[items.length - 1]?.index ?? 0;
  const { onVisibleRange } = p;
  useEffect(() => {
    if (p.count > 0) onVisibleRange?.(first, last);
  }, [first, last, p.count, onVisibleRange]);

  useEffect(() => {
    if (p.scrollToIndex != null && p.scrollToIndex >= 0 && p.scrollToIndex < p.count) v.scrollToIndex(p.scrollToIndex, { align: 'auto' });
  }, [p.scrollToIndex, p.count, v]);

  const startResize = (col: ColumnId, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = widthOf(col);
    let w = startW;
    const move = (ev: PointerEvent) => {
      w = Math.max(COLUMNS[col].min, startW + ev.clientX - startX);
      setDragWidths((d) => ({ ...d, [col]: w }));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('col-resizing');
      setSettings({ columnWidths: { ...useSettings.getState().columnWidths, [`${p.tableId}.${col}`]: Math.round(w) } });
      setDragWidths((d) => {
        const n = { ...d };
        delete n[col];
        return n;
      });
    };
    document.body.classList.add('col-resizing');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const filterable = useMemo(() => new Set(p.filterable ?? []), [p.filterable]);
  const activeFilters = useMemo(() => new Set(p.activeFilters ?? []), [p.activeFilters]);

  const cell = (c: ColumnId, e: FileEntry, isRenaming: boolean) => {
    switch (c) {
      case 'name':
        return (
          <div className="ft-cell ft-name" key={c}>
            <FileIcon category={e.category} ext={e.ext} size={18} special={e.isDir ? p.specialOf?.(e.path) : null} link={e.isLink} />
            {isRenaming ? (
              <RenameInput initial={e.name} isDir={e.isDir} onCommit={(v) => p.onRenameCommit?.(e, v)} onCancel={() => p.onRenameCancel?.()} />
            ) : (
              <span className={`truncate ${e.hidden ? 'ft-hidden' : ''}`}>{displayName(e, showExt)}</span>
            )}
          </div>
        );
      case 'modified':
        return (
          <div className="ft-cell muted tabular" key={c}>
            {formatDate(e.modified)}
          </div>
        );
      case 'created':
        return (
          <div className="ft-cell muted tabular" key={c}>
            {formatDate(e.created)}
          </div>
        );
      case 'accessed':
        return (
          <div className="ft-cell muted tabular" key={c}>
            {formatDate(e.accessed)}
          </div>
        );
      case 'used':
        return (
          <div className="ft-cell muted tabular" key={c}>
            {formatDate(Math.max(e.modified, e.accessed))}
          </div>
        );
      case 'type':
        return (
          <div className="ft-cell muted" key={c}>
            <span className="truncate">{typeLabel(e.category, e.ext)}</span>
          </div>
        );
      case 'size':
        return (
          <div className="ft-cell muted tabular ft-right" key={c}>
            {e.isDir ? '' : formatBytes(e.size)}
          </div>
        );
      case 'folder':
        return (
          <div className="ft-cell muted" key={c} data-tip={e.parent}>
            <span className="truncate">{middleEllipsis(e.parent, Math.max(12, Math.floor(widthOf('folder') / 7)))}</span>
          </div>
        );
    }
  };

  return (
    <div
      ref={scrollRef}
      className={`ft-scroll ${p.dimmed ? 'ft-dimmed' : ''}`}
      tabIndex={0}
      onKeyDown={p.onKeyDown}
      onPointerDown={(e) => {
        if (!(e.target as HTMLElement).closest('.ft-row, .ft-header')) p.onBackgroundPointerDown?.(e);
      }}
      onContextMenu={(e) => {
        if (!(e.target as HTMLElement).closest('.ft-row, .ft-header')) p.onBackgroundContextMenu?.(e);
      }}
      role="grid"
      aria-rowcount={p.count}
    >
      <div className="ft-inner" style={{ height: v.getTotalSize(), minWidth }}>
        <div className="ft-header" style={{ gridTemplateColumns: template, height: headerH }} role="row">
          {p.columns.map((c) => {
            const def = COLUMNS[c];
            const active = p.sort.key === def.sortKey;
            return (
              <div key={c} className={`ft-th ${def.align === 'right' ? 'ft-right' : ''} ${active ? 'sorted' : ''}`} role="columnheader" aria-sort={active ? (p.sort.desc ? 'descending' : 'ascending') : 'none'}>
                <button type="button" className="ft-th-btn" onClick={() => p.onSort(def.sortKey)}>
                  <span className="truncate">{def.label}</span>
                  {active ? <Icon name={p.sort.desc ? 'chevron-down' : 'chevron-up'} size={13} strokeWidth={2.2} /> : null}
                </button>
                {filterable.has(c) && p.onHeaderFilter ? (
                  <button
                    type="button"
                    className={`ft-filter-btn ${activeFilters.has(c) ? 'active' : ''}`}
                    onClick={(e) => p.onHeaderFilter?.(c, e.currentTarget)}
                    aria-label={`Filtrar por ${def.label}`}
                  >
                    <Icon name={activeFilters.has(c) ? 'filter' : 'chevron-down'} size={12} strokeWidth={2} />
                  </button>
                ) : null}
                <span className="ft-resizer" onPointerDown={(e) => startResize(c, e)} />
              </div>
            );
          })}
        </div>

        {p.count === 0 && p.loading
          ? Array.from({ length: 8 }, (_, i) => (
              <div key={`sk${i}`} className="ft-row ft-skeleton" style={{ transform: `translateY(${headerH + i * rowH}px)`, height: rowH, gridTemplateColumns: template }}>
                {p.columns.map((c) => (
                  <div key={c} className="ft-cell">
                    <span className="skeleton" style={{ width: c === 'name' ? `${45 + ((i * 17) % 40)}%` : '60%', height: 10 }} />
                  </div>
                ))}
              </div>
            ))
          : null}

        {items.map((it) => {
          const e = p.getRow(it.index);
          if (!e) {
            return (
              <div key={`l${it.index}`} className="ft-row ft-skeleton" style={{ transform: `translateY(${it.start}px)`, height: rowH, gridTemplateColumns: template }}>
                {p.columns.map((c) => (
                  <div key={c} className="ft-cell">
                    <span className="skeleton" style={{ width: c === 'name' ? '55%' : '50%', height: 10 }} />
                  </div>
                ))}
              </div>
            );
          }
          const key = p.rowKey(e);
          const sel = p.selected.has(key);
          const renaming = p.renamingKey === key;
          return (
            <div
              key={key}
              className={`ft-row ${sel ? 'selected' : ''} ${p.focusKey === key ? 'focused' : ''} ${p.cutKeys?.has(key) ? 'cut' : ''}`}
              style={{ transform: `translateY(${it.start}px)`, height: rowH, gridTemplateColumns: template }}
              data-drop-path={e.isDir ? e.path : undefined}
              data-drop-name={e.isDir ? e.name : undefined}
              role="row"
              aria-selected={sel}
              onPointerDown={(ev) => p.onRowPointerDown(ev, it.index, e)}
              onDoubleClick={() => p.onRowDoubleClick(e, it.index)}
              onContextMenu={(ev) => {
                ev.preventDefault();
                p.onRowContextMenu(ev, it.index, e);
              }}
            >
              {p.columns.map((c) => cell(c, e, renaming))}
            </div>
          );
        })}
      </div>
      {p.count === 0 && !p.loading && p.empty ? <div className="ft-empty">{p.empty}</div> : null}
    </div>
  );
}
