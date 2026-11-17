import { useEffect, useState } from 'react';
import { Icon } from '../Icon';
import { Logo } from '../Logo';
import { closeWindow, isTauri, isWindowMaximized, minimizeWindow, onWindowResized, toggleMaximizeWindow } from '../../lib/platform';
import { useSettings } from '../../store/settings';
import { resolveTheme, isDarkTheme } from '../../lib/theme';
import { useCommandPalette } from '../CommandPalette';
import { modKey } from '../../lib/platform';

/** Barra de título própria: marca, busca de comandos e controles da janela. */
export function Titlebar() {
  const [maximized, setMaximized] = useState(false);
  const collapsed = useSettings((s) => s.sidebarCollapsed);
  const theme = useSettings((s) => s.theme);
  const set = useSettings((s) => s.set);
  const openPalette = useCommandPalette((s) => s.setOpen);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    isWindowMaximized().then(setMaximized);
    onWindowResized(() => isWindowMaximized().then(setMaximized)).then((u) => (unlisten = u));
    return () => unlisten?.();
  }, []);

  const dark = isDarkTheme(resolveTheme(theme));

  return (
    <header className="titlebar" data-tauri-drag-region>
      <button
        type="button"
        className="icon-btn"
        onClick={() => set({ sidebarCollapsed: !collapsed })}
        data-tip={collapsed ? 'Expandir menu' : 'Recolher menu'}
        data-tip-pos="below"
        aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
      >
        <Icon name="panel-left" size={17} />
      </button>
      <div className="titlebar-brand" data-tauri-drag-region>
        <Logo size={20} />
        <span data-tauri-drag-region>Organizador</span>
      </div>

      <div className="titlebar-center">
        <button type="button" className="command-trigger" onClick={() => openPalette(true)}>
          <Icon name="search" size={14} />
          <span>Pesquisar páginas, pastas e ações</span>
          <span className="kbd">{modKey} K</span>
        </button>
      </div>

      <div className="titlebar-actions" data-tauri-drag-region>
        <button
          type="button"
          className="icon-btn"
          onClick={() => set({ theme: dark ? 'claro' : 'escuro' })}
          data-tip={dark ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'}
          data-tip-pos="below"
          aria-label="Alternar tema claro/escuro"
        >
          <Icon name={dark ? 'sun' : 'moon'} size={17} />
        </button>
        {isTauri ? (
          <div className="window-controls">
            <button type="button" className="window-btn" onClick={minimizeWindow} aria-label="Minimizar">
              <Icon name="win-minimize" size={15} strokeWidth={1.2} />
            </button>
            <button type="button" className="window-btn" onClick={toggleMaximizeWindow} aria-label={maximized ? 'Restaurar' : 'Maximizar'}>
              <Icon name={maximized ? 'win-restore' : 'win-maximize'} size={14} strokeWidth={1.2} />
            </button>
            <button type="button" className="window-btn close" onClick={closeWindow} aria-label="Fechar">
              <Icon name="win-close" size={15} strokeWidth={1.2} />
            </button>
          </div>
        ) : (
          <div style={{ width: 8 }} />
        )}
      </div>
    </header>
  );
}
