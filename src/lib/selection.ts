/** Seleção no estilo do Explorer: clique, Ctrl+clique, Shift+clique e teclado. */

export interface SelState {
  selected: Set<string>;
  anchor: string | null;
  focus: string | null;
}

export const EMPTY_SEL: SelState = { selected: new Set(), anchor: null, focus: null };

function range(keys: string[], a: number, b: number): string[] {
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return keys.slice(lo, hi + 1);
}

export function clickSelect(state: SelState, keys: string[], index: number, mods: { ctrl: boolean; shift: boolean }): SelState {
  const key = keys[index];
  if (key === undefined) return state;
  if (mods.shift) {
    const anchorKey = state.anchor ?? state.focus ?? key;
    const ai = Math.max(0, keys.indexOf(anchorKey));
    const r = range(keys, ai, index);
    const selected = mods.ctrl ? new Set([...state.selected, ...r]) : new Set(r);
    return { selected, anchor: keys[ai] ?? key, focus: key };
  }
  if (mods.ctrl) {
    const selected = new Set(state.selected);
    if (selected.has(key)) selected.delete(key);
    else selected.add(key);
    return { selected, anchor: key, focus: key };
  }
  return { selected: new Set([key]), anchor: key, focus: key };
}

export type Move = number | 'home' | 'end';

/** Move o foco com as setas; com Shift, estende a seleção a partir da âncora. */
export function moveFocus(state: SelState, keys: string[], move: Move, mods: { shift: boolean; ctrl?: boolean }): SelState {
  if (!keys.length) return state;
  const cur = state.focus ? keys.indexOf(state.focus) : -1;
  let next: number;
  if (move === 'home') next = 0;
  else if (move === 'end') next = keys.length - 1;
  else next = cur < 0 ? (move > 0 ? 0 : keys.length - 1) : Math.max(0, Math.min(keys.length - 1, cur + move));
  const key = keys[next];
  if (mods.shift) {
    const ai = state.anchor ? Math.max(0, keys.indexOf(state.anchor)) : cur < 0 ? next : cur;
    return { selected: new Set(range(keys, ai, next)), anchor: keys[ai], focus: key };
  }
  if (mods.ctrl) return { ...state, focus: key };
  return { selected: new Set([key]), anchor: key, focus: key };
}

export function selectAll(keys: string[], focus: string | null): SelState {
  return { selected: new Set(keys), anchor: keys[0] ?? null, focus: focus ?? keys[0] ?? null };
}

export function invertSelection(state: SelState, keys: string[]): SelState {
  return { ...state, selected: new Set(keys.filter((k) => !state.selected.has(k))) };
}

/** Busca por digitação: pula para o próximo item que começa com o texto. */
export function typeAhead(names: string[], keys: string[], buffer: string, fromKey: string | null): string | null {
  const q = buffer
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  if (!q) return null;
  const norm = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
  const start = fromKey ? keys.indexOf(fromKey) : -1;
  // Uma única letra repetida avança para o próximo; texto maior procura a partir do atual.
  const offset = q.length === 1 ? 1 : 0;
  for (let i = 0; i < names.length; i++) {
    const idx = (start + offset + i + names.length) % names.length;
    if (norm(names[idx]).startsWith(q)) return keys[idx];
  }
  return null;
}
