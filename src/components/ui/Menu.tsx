import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { create } from 'zustand';
import { Icon, type IconName } from '../Icon';

/** Item de menu (suspenso ou de contexto). */
export type MenuEntry =
  | {
      label: string;
      icon?: IconName;
      shortcut?: string;
      danger?: boolean;
      disabled?: boolean;
      checked?: boolean;
      onSelect?: () => void;
      submenu?: MenuEntry[];
    }
  | { separator: true }
  | { header: string };

interface MenuState {
  open: { x: number; y: number; items: MenuEntry[]; key: number; minWidth?: number } | null;
  show: (x: number, y: number, items: MenuEntry[], minWidth?: number) => void;
  hide: () => void;
}

export const useMenu = create<MenuState>((set) => ({
  open: null,
  show: (x, y, items, minWidth) => set({ open: { x, y, items, key: Date.now(), minWidth } }),
  hide: () => set({ open: null }),
}));

/** Abre um menu de contexto na posição do mouse. */
export function openContextMenu(e: { clientX: number; clientY: number; preventDefault: () => void }, items: MenuEntry[]) {
  e.preventDefault();
  useMenu.getState().show(e.clientX, e.clientY, items);
}

/** Abre um menu suspenso logo abaixo do elemento. */
export function openDropdown(el: HTMLElement, items: MenuEntry[], align: 'left' | 'right' = 'left') {
  const r = el.getBoundingClientRect();
  const st = useMenu.getState();
  // Clicar de novo no mesmo botão fecha o menu.
  if (st.open && Math.abs(st.open.y - (r.bottom + 6)) < 1 && Math.abs(st.open.x - (align === 'left' ? r.left : r.right)) < 1) {
    st.hide();
    return;
  }
  st.show(align === 'left' ? r.left : -r.right, r.bottom + 6, items, Math.max(200, r.width));
}

const isAction = (e: MenuEntry): e is Extract<MenuEntry, { label: string }> => 'label' in e;

function MenuPanel({
  x,
  y,
  items,
  minWidth,
  onClose,
  level,
  onLeaveLeft,
}: {
  x: number;
  y: number;
  items: MenuEntry[];
  minWidth?: number;
  onClose: () => void;
  level: number;
  onLeaveLeft?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: Math.abs(x), top: y, origin: 'top left' });
  const [focus, setFocus] = useState(-1);
  const [sub, setSub] = useState<{ index: number; x: number; y: number } | null>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Mantém o menu dentro da janela.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = x < 0 ? -x - w : x;
    let top = y;
    let ox = 'left';
    let oy = 'top';
    if (left + w > window.innerWidth - 8) {
      left = level > 0 ? Math.max(8, left - w - (minWidth ?? 0)) : window.innerWidth - w - 8;
      ox = 'right';
    }
    if (top + h > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - h - 8);
      oy = 'bottom';
    }
    setPos({ left: Math.max(8, left), top, origin: `${oy} ${ox}` });
  }, [x, y, level, minWidth]);

  const actionable = items.map((it, i) => (isAction(it) && !it.disabled ? i : -1)).filter((i) => i >= 0);

  const openSub = (i: number) => {
    const el = itemRefs.current[i];
    if (!el) return;
    const r = el.getBoundingClientRect();
    setSub({ index: i, x: r.right + 2, y: r.top - 6 });
  };

  useEffect(() => {
    if (level !== 0 && sub === null && focus === -1) return;
    const onKey = (e: KeyboardEvent) => {
      if (sub) return; // o submenu cuida do teclado
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!actionable.length) return;
        const cur = actionable.indexOf(focus);
        const next = e.key === 'ArrowDown' ? actionable[(cur + 1) % actionable.length] : actionable[(cur - 1 + actionable.length) % actionable.length];
        setFocus(next);
      } else if (e.key === 'Enter' && focus >= 0) {
        e.preventDefault();
        const it = items[focus];
        if (isAction(it)) {
          if (it.submenu) openSub(focus);
          else {
            onClose();
            it.onSelect?.();
          }
        }
      } else if (e.key === 'ArrowRight' && focus >= 0) {
        const it = items[focus];
        if (isAction(it) && it.submenu) {
          e.preventDefault();
          openSub(focus);
        }
      } else if (e.key === 'ArrowLeft' && level > 0) {
        e.preventDefault();
        onLeaveLeft?.();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  return (
    <>
      <motion.div
        ref={ref}
        className="menu"
        role="menu"
        style={{ left: pos.left, top: pos.top, minWidth, transformOrigin: pos.origin }}
        initial={{ opacity: 0, scale: 0.96, y: -4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.09 } }}
        transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {items.map((it, i) => {
          if ('separator' in it) return <div key={i} className="menu-sep" />;
          if ('header' in it) return <div key={i} className="menu-label">{it.header}</div>;
          return (
            <button
              key={i}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              role="menuitem"
              className={`menu-item anim-hover ${it.danger ? 'danger' : ''} ${focus === i ? 'focused' : ''}`}
              disabled={it.disabled}
              onMouseEnter={() => {
                setFocus(i);
                if (it.submenu) openSub(i);
                else setSub(null);
              }}
              onClick={() => {
                if (it.submenu) {
                  openSub(i);
                  return;
                }
                onClose();
                it.onSelect?.();
              }}
            >
              {it.icon ? <Icon name={it.icon} size={16} /> : <span style={{ width: 16 }} />}
              <span className="truncate">{it.label}</span>
              {it.checked ? <Icon name="check" size={15} className="menu-check" /> : null}
              {it.shortcut ? <span className="menu-shortcut">{it.shortcut}</span> : null}
              {it.submenu ? <Icon name="chevron-right" size={14} style={{ marginLeft: it.shortcut || it.checked ? 4 : 'auto' }} /> : null}
            </button>
          );
        })}
      </motion.div>
      <AnimatePresence>
        {sub && isAction(items[sub.index]) && (items[sub.index] as { submenu?: MenuEntry[] }).submenu ? (
          <MenuPanel
            key={sub.index}
            x={sub.x}
            y={sub.y}
            items={(items[sub.index] as { submenu: MenuEntry[] }).submenu}
            onClose={onClose}
            level={level + 1}
            minWidth={ref.current?.offsetWidth}
            onLeaveLeft={() => setSub(null)}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}

/** Renderiza o menu aberto (um por vez) e fecha ao clicar fora ou com Esc. */
export function MenuHost() {
  const open = useMenu((s) => s.open);
  const hide = useMenu((s) => s.hide);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.menu')) hide();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        hide();
      }
    };
    const onBlur = () => hide();
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', onBlur);
    window.addEventListener('resize', onBlur);
    return () => {
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', onBlur);
    };
  }, [open, hide]);

  return (
    <AnimatePresence>
      {open ? <MenuPanel key={open.key} x={open.x} y={open.y} items={open.items} minWidth={open.minWidth} onClose={hide} level={0} /> : null}
    </AnimatePresence>
  );
}
