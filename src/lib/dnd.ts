/**
 * Arrastar e soltar dentro do app (por ponteiro, sem a API HTML5, que conflita
 * com o arrastar de arquivos do Windows). Destinos são elementos com
 * `data-drop-path`; Ctrl copia em vez de mover.
 */

import { useEffect } from 'react';
import { create } from 'zustand';
import type { Category } from './categories';
import { basename, dirname, isInside, samePath } from './format';
import { copyTo, moveTo } from './fileops';
import { isTauri } from './platform';

interface DragState {
  active: boolean;
  count: number;
  firstName: string;
  category: Category;
  x: number;
  y: number;
  copy: boolean;
  targetName: string | null;
  /** Momento em que o último arraste terminou (para ignorar o "clique" final). */
  lastDragEnd: number;
}

export const useDrag = create<DragState>(() => ({
  active: false,
  count: 0,
  firstName: '',
  category: 'other',
  x: 0,
  y: 0,
  copy: false,
  targetName: null,
  lastDragEnd: 0,
}));

function validTarget(el: HTMLElement | null, paths: string[]): HTMLElement | null {
  if (!el) return null;
  const dp = el.dataset.dropPath;
  if (!dp) return null;
  // Não solta uma pasta nela mesma, nem na pasta onde os itens já estão.
  if (paths.some((p) => samePath(p, dp) || isInside(dp, p))) return null;
  if (paths.every((p) => samePath(dirname(p), dp))) return null;
  return el;
}

/** Começa a observar um possível arraste a partir de um clique em um item. */
export function trackDrag(e: { button: number; clientX: number; clientY: number }, getPaths: () => string[], meta: { name: string; category: Category }) {
  if (e.button !== 0) return;
  const sx = e.clientX;
  const sy = e.clientY;
  let active = false;
  let paths: string[] = [];
  let target: HTMLElement | null = null;

  const stop = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('keyup', onKeyUp);
    target?.classList.remove('drop-over');
    document.body.classList.remove('dragging');
    useDrag.setState(active ? { active: false, targetName: null, lastDragEnd: Date.now() } : { active: false, targetName: null });
  };

  const onMove = (ev: PointerEvent) => {
    if (!active) {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 7) return;
      paths = getPaths();
      if (!paths.length) return stop();
      active = true;
      document.body.classList.add('dragging');
      useDrag.setState({ active: true, count: paths.length, firstName: meta.name, category: meta.category });
    }
    const under = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
    const t = validTarget(under?.closest<HTMLElement>('[data-drop-path]') ?? null, paths);
    if (t !== target) {
      target?.classList.remove('drop-over');
      t?.classList.add('drop-over');
      target = t;
    }
    useDrag.setState({
      x: ev.clientX,
      y: ev.clientY,
      copy: ev.ctrlKey,
      targetName: t ? (t.dataset.dropName ?? basename(t.dataset.dropPath!)) : null,
    });
  };

  const onUp = (ev: PointerEvent) => {
    const dest = target?.dataset.dropPath;
    const wasActive = active;
    stop();
    if (wasActive && dest) {
      if (ev.ctrlKey) void copyTo(paths, dest);
      else void moveTo(paths, dest);
    }
  };

  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') stop();
    else if (ev.key === 'Control') useDrag.setState({ copy: true });
  };
  const onKeyUp = (ev: KeyboardEvent) => {
    if (ev.key === 'Control') useDrag.setState({ copy: false });
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKeyUp);
}

/**
 * Recebe arquivos arrastados do Windows (Explorer, área de trabalho) para o app.
 * `target` é a pasta sob o cursor (elemento com data-drop-path), se houver.
 */
export function useExternalDrop(onDrop: (paths: string[], target: string | null) => void, enabled = true) {
  useEffect(() => {
    if (!isTauri || !enabled) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;
    let last: HTMLElement | null = null;
    const at = (x: number, y: number) => {
      const r = window.devicePixelRatio || 1;
      return (document.elementFromPoint(x / r, y / r) as HTMLElement | null)?.closest<HTMLElement>('[data-drop-path]') ?? null;
    };
    void import('@tauri-apps/api/webview').then(async ({ getCurrentWebview }) => {
      const u = await getCurrentWebview().onDragDropEvent((ev) => {
        const p = ev.payload;
        if (p.type === 'over' || p.type === 'enter') {
          const el = at(p.position.x, p.position.y);
          if (el !== last) {
            last?.classList.remove('drop-over');
            el?.classList.add('drop-over');
            last = el;
          }
          document.body.classList.add('external-drag');
        } else if (p.type === 'drop') {
          const el = at(p.position.x, p.position.y);
          last?.classList.remove('drop-over');
          last = null;
          document.body.classList.remove('external-drag');
          onDrop(p.paths, el?.dataset.dropPath ?? null);
        } else {
          last?.classList.remove('drop-over');
          last = null;
          document.body.classList.remove('external-drag');
        }
      });
      if (disposed) u();
      else unlisten = u;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [onDrop, enabled]);
}
