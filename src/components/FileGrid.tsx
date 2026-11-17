import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { FileIcon, type SpecialFolder } from './FileIcon';
import { fileUrl } from '../lib/api';
import { formatBytes } from '../lib/format';
import type { FileEntry } from '../lib/types';
import { useSettings } from '../store/settings';

const TILE_W = 118;
const TILE_H = 132;

interface FileGridProps {
  count: number;
  getRow: (i: number) => FileEntry | undefined;
  rowKey: (e: FileEntry) => string;
  selected: Set<string>;
  focusKey: string | null;
  cutKeys?: Set<string>;
  onItemPointerDown: (e: React.PointerEvent, index: number, entry: FileEntry) => void;
  onItemDoubleClick: (entry: FileEntry, index: number) => void;
  onItemContextMenu: (e: React.MouseEvent, index: number, entry: FileEntry) => void;
  onBackgroundPointerDown?: (e: React.PointerEvent) => void;
  onBackgroundContextMenu?: (e: React.MouseEvent) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onColumns?: (cols: number) => void;
  renamingKey?: string | null;
  onRenameCommit?: (entry: FileEntry, name: string) => void;
  onRenameCancel?: () => void;
  specialOf?: (path: string) => SpecialFolder | null;
  scrollToIndex?: number | null;
  empty?: React.ReactNode;
}

function GridRename({ entry, onCommit, onCancel }: { entry: FileEntry; onCommit: (v: string) => void; onCancel: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const dot = entry.name.lastIndexOf('.');
    if (!entry.isDir && dot > 0) el.setSelectionRange(0, dot);
    else el.select();
  }, [entry]);
  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    if (commit) onCommit(ref.current?.value ?? entry.name);
    else onCancel();
  };
  return (
    <textarea
      ref={ref}
      className="fg-rename"
      defaultValue={entry.name}
      spellCheck={false}
      rows={2}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          finish(true);
        }
        if (e.key === 'Escape') finish(false);
      }}
      onBlur={() => finish(true)}
    />
  );
}

/** Visualização em ícones grandes, com miniaturas de imagens. */
export function FileGrid(p: FileGridProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const thumbs = useSettings((s) => s.thumbnails);
  const showExt = useSettings((s) => s.showExtensions);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const cols = Math.max(1, Math.floor((width - 24) / TILE_W));
  const rows = Math.ceil(p.count / cols);
  const { onColumns } = p;
  useEffect(() => onColumns?.(cols), [cols, onColumns]);

  const v = useVirtualizer({ count: rows, getScrollElement: () => ref.current, estimateSize: () => TILE_H, overscan: 4, paddingStart: 12, paddingEnd: 72 });

  useEffect(() => {
    if (p.scrollToIndex != null && p.scrollToIndex >= 0) v.scrollToIndex(Math.floor(p.scrollToIndex / cols), { align: 'auto' });
  }, [p.scrollToIndex, cols, v]);

  return (
    <div
      ref={ref}
      className="fg-scroll"
      tabIndex={0}
      onKeyDown={p.onKeyDown}
      onPointerDown={(e) => {
        if (!(e.target as HTMLElement).closest('.fg-item')) p.onBackgroundPointerDown?.(e);
      }}
      onContextMenu={(e) => {
        if (!(e.target as HTMLElement).closest('.fg-item')) p.onBackgroundContextMenu?.(e);
      }}
    >
      <div style={{ height: v.getTotalSize(), position: 'relative' }}>
        {v.getVirtualItems().map((row) => (
          <div key={row.index} className="fg-row" style={{ transform: `translateY(${row.start}px)`, height: TILE_H }}>
            {Array.from({ length: cols }, (_, c) => {
              const index = row.index * cols + c;
              if (index >= p.count) return null;
              const e = p.getRow(index);
              if (!e) return <div key={index} className="fg-item skeleton" style={{ width: TILE_W - 10, height: TILE_H - 12 }} />;
              const key = p.rowKey(e);
              const thumb = thumbs && e.category === 'image' && e.size < 25 * 1024 * 1024 ? fileUrl(e.path) : null;
              const name = showExt || e.isDir || !e.ext ? e.name : e.name.slice(0, e.name.lastIndexOf('.'));
              return (
                <div
                  key={key}
                  className={`fg-item ${p.selected.has(key) ? 'selected' : ''} ${p.focusKey === key ? 'focused' : ''} ${p.cutKeys?.has(key) ? 'cut' : ''}`}
                  style={{ width: TILE_W - 8 }}
                  data-drop-path={e.isDir ? e.path : undefined}
                  data-drop-name={e.isDir ? e.name : undefined}
                  onPointerDown={(ev) => p.onItemPointerDown(ev, index, e)}
                  onDoubleClick={() => p.onItemDoubleClick(e, index)}
                  onContextMenu={(ev) => {
                    ev.preventDefault();
                    p.onItemContextMenu(ev, index, e);
                  }}
                  data-tip={e.isDir ? e.name : `${e.name} · ${formatBytes(e.size)}`}
                >
                  <div className="fg-icon">
                    <FileIcon category={e.category} ext={e.ext} size={58} thumb={thumb} special={e.isDir ? p.specialOf?.(e.path) : null} link={e.isLink} />
                  </div>
                  {p.renamingKey === key ? (
                    <GridRename entry={e} onCommit={(v) => p.onRenameCommit?.(e, v)} onCancel={() => p.onRenameCancel?.()} />
                  ) : (
                    <div className="fg-name">{name}</div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {p.count === 0 && p.empty ? <div className="ft-empty" style={{ inset: 0 }}>{p.empty}</div> : null}
    </div>
  );
}
