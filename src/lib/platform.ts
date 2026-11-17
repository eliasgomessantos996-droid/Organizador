/** Integração com a janela nativa (Tauri). No navegador, vira no-op. */

export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

async function currentWindow() {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  return getCurrentWindow();
}

export async function minimizeWindow() {
  if (isTauri) await (await currentWindow()).minimize();
}

export async function toggleMaximizeWindow() {
  if (isTauri) await (await currentWindow()).toggleMaximize();
}

export async function closeWindow() {
  if (isTauri) await (await currentWindow()).close();
}

export async function showWindow() {
  if (!isTauri) return;
  const w = await currentWindow();
  await w.show();
  await w.setFocus();
}

export async function isWindowMaximized(): Promise<boolean> {
  if (!isTauri) return false;
  return (await currentWindow()).isMaximized();
}

/** Observa redimensionamentos para atualizar o botão maximizar/restaurar. */
export async function onWindowResized(cb: () => void): Promise<() => void> {
  if (!isTauri) return () => {};
  return (await currentWindow()).onResized(cb);
}

export const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);
export const modKey = isMac ? '⌘' : 'Ctrl';
