import { useCallback, useRef, useState } from 'react';
import { api } from './api';
import type { FileEntry, FileFilter, SortSpec } from './types';

const PAGE = 300;

/** Lista paginada de uma varredura guardada no backend (ids + páginas sob demanda). */
export function useScanList(slot: string) {
  const [ids, setIds] = useState<number[]>([]);
  const [totalSize, setTotalSize] = useState(0);
  const [loading, setLoading] = useState(false);
  const [, setTick] = useState(0);
  const pages = useRef(new Map<number, FileEntry[]>());
  const inflight = useRef(new Set<number>());
  const query = useRef<{ filter: FileFilter; sort: SortSpec; version: number } | null>(null);

  const ensureRange = useCallback(
    (start: number, end: number) => {
      const q = query.current;
      if (!q) return;
      for (let p = Math.floor(start / PAGE); p <= Math.floor(end / PAGE); p++) {
        if (pages.current.has(p) || inflight.current.has(p)) continue;
        inflight.current.add(p);
        const version = q.version;
        void api
          .scanQuery(slot, q.filter, q.sort, p * PAGE, PAGE)
          .then((res) => {
            if (query.current?.version !== version) return;
            pages.current.set(p, res.items);
            setTotalSize(res.totalSize);
            setTick((t) => t + 1);
          })
          .catch(() => {})
          .finally(() => inflight.current.delete(p));
      }
    },
    [slot],
  );

  const refresh = useCallback(
    async (filter: FileFilter, sort: SortSpec) => {
      setLoading(true);
      query.current = { filter, sort, version: (query.current?.version ?? 0) + 1 };
      pages.current = new Map();
      inflight.current.clear();
      try {
        const list = await api.scanIds(slot, filter, sort);
        setIds(list);
        if (!list.length) setTotalSize(0);
        ensureRange(0, 80);
      } finally {
        setLoading(false);
      }
    },
    [slot, ensureRange],
  );

  const getRow = useCallback((i: number) => pages.current.get(Math.floor(i / PAGE))?.[i % PAGE], []);

  const loadedSize = useCallback((sel: Set<string>) => {
    let s = 0;
    for (const list of pages.current.values()) for (const e of list) if (sel.has(String(e.id))) s += e.size;
    return s;
  }, []);

  return { ids, totalSize, loading, getRow, ensureRange, refresh, loadedSize };
}
