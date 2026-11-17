/** Barramento simples: avisa as telas quando arquivos mudam em alguma pasta. */

type Listener = (dirs: string[]) => void;
const listeners = new Set<Listener>();

export function onFsChanged(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emitFsChanged(dirs: string[]) {
  listeners.forEach((l) => l(dirs));
}
