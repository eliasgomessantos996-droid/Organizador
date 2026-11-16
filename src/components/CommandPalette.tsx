import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { create } from 'zustand';
import { Icon, type IconName } from './Icon';
import { ALL_NAV } from './layout/Sidebar';
import { go } from '../store/nav';
import { useSettings } from '../store/settings';
import { THEMES } from '../lib/theme';

export interface Command {
  id: string;
  label: string;
  group: string;
  icon: IconName;
  hint?: string;
  keywords?: string;
  run: () => void;
}

interface PaletteState {
  open: boolean;
  setOpen: (v: boolean) => void;
  sources: Record<string, Command[]>;
  /** Módulos registram comandos extras (pastas, ações de limpeza...). */
  register: (source: string, commands: Command[]) => void;
}

export const useCommandPalette = create<PaletteState>((set, get) => ({
  open: false,
  setOpen: (open) => set({ open }),
  sources: {},
  register: (source, commands) => set({ sources: { ...get().sources, [source]: commands } }),
}));

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

function score(cmd: Command, q: string): number {
  if (!q) return 1;
  const label = norm(cmd.label);
  const hay = `${label} ${norm(cmd.keywords ?? '')} ${norm(cmd.group)}`;
  if (label.startsWith(q)) return 100 - label.length / 100;
  const words = label.split(/\s+/);
  if (words.some((w) => w.startsWith(q))) return 80;
  if (hay.includes(q)) return 60;
  // Subsequência (ex.: "esvlix" → "Esvaziar a Lixeira")
  let i = 0;
  for (const ch of hay) if (ch === q[i]) i++;
  return i === q.length ? 30 : 0;
}

function baseCommands(): Command[] {
  const s = useSettings.getState();
  const pages: Command[] = ALL_NAV.map((n) => ({
    id: `page:${n.id}`,
    label: n.label,
    group: 'Páginas',
    icon: n.icon,
    hint: 'Abrir',
    run: () => go(n.id),
  }));
  const themes: Command[] = THEMES.map((t) => ({
    id: `theme:${t.id}`,
    label: `Tema: ${t.name}`,
    group: 'Aparência',
    icon: 'palette',
    hint: s.theme === t.id ? 'Atual' : undefined,
    keywords: `tema cor ${t.description}`,
    run: () => useSettings.getState().set({ theme: t.id }),
  }));
  const toggles: Command[] = [
    {
      id: 'toggle:hidden',
      label: s.showHidden ? 'Ocultar arquivos ocultos' : 'Mostrar arquivos ocultos',
      group: 'Preferências',
      icon: s.showHidden ? 'eye-off' : 'eye',
      run: () => useSettings.getState().set({ showHidden: !useSettings.getState().showHidden }),
    },
    {
      id: 'toggle:sidebar',
      label: s.sidebarCollapsed ? 'Expandir o menu lateral' : 'Recolher o menu lateral',
      group: 'Preferências',
      icon: 'panel-left',
      run: () => useSettings.getState().set({ sidebarCollapsed: !useSettings.getState().sidebarCollapsed }),
    },
  ];
  return [...pages, ...toggles, ...themes];
}

/** Paleta de comandos (Ctrl+K): navegação rápida por páginas, pastas e ações. */
export function CommandPalette() {
  const open = useCommandPalette((s) => s.open);
  const setOpen = useCommandPalette((s) => s.setOpen);
  const sources = useCommandPalette((s) => s.sources);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
    }
  }, [open]);

  const results = useMemo(() => {
    if (!open) return [];
    const all = [...baseCommands(), ...Object.values(sources).flat()];
    const nq = norm(q.trim());
    return all
      .map((c) => ({ c, s: score(c, nq) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 40)
      .map((x) => x.c);
  }, [open, q, sources]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const run = (c: Command | undefined) => {
    if (!c) return;
    setOpen(false);
    window.setTimeout(c.run, 10);
  };

  let lastGroup = '';
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="palette-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
          onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <motion.div
            className="palette"
            initial={{ opacity: 0, y: -14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 460, damping: 34 }}
            role="dialog"
            aria-label="Paleta de comandos"
          >
            <div className="palette-input">
              <Icon name="search" size={18} />
              <input
                autoFocus
                value={q}
                placeholder="O que você quer fazer?"
                spellCheck={false}
                onChange={(e) => {
                  setQ(e.target.value);
                  setActive(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setActive((a) => Math.min(results.length - 1, a + 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setActive((a) => Math.max(0, a - 1));
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    run(results[active]);
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setOpen(false);
                  }
                }}
              />
            </div>
            <div className="palette-list" ref={listRef}>
              {results.length === 0 ? <div className="palette-empty">Nada encontrado para “{q}”.</div> : null}
              {results.map((c, i) => {
                const header = c.group !== lastGroup ? c.group : null;
                lastGroup = c.group;
                return (
                  <div key={c.id}>
                    {header ? <div className="menu-label">{header}</div> : null}
                    <button
                      type="button"
                      data-idx={i}
                      className={`palette-item anim-hover ${i === active ? 'active' : ''}`}
                      onMouseMove={() => setActive(i)}
                      onClick={() => run(c)}
                    >
                      <span className="palette-icon">
                        <Icon name={c.icon} size={16} />
                      </span>
                      <span className="truncate">{c.label}</span>
                      {c.hint ? <span className="palette-hint">{c.hint}</span> : null}
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="palette-footer">
              <span>
                <span className="kbd">↑</span> <span className="kbd">↓</span> navegar
              </span>
              <span>
                <span className="kbd">Enter</span> executar
              </span>
              <span>
                <span className="kbd">Esc</span> fechar
              </span>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
