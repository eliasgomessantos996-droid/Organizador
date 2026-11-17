/**
 * Treemap "squarified" (Bruls, Huizing e van Wijk): divide um retângulo em
 * blocos proporcionais ao tamanho, o mais quadrados possível.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function worst(row: number[], side: number): number {
  const sum = row.reduce((a, b) => a + b, 0);
  if (!sum || !side) return Infinity;
  const max = Math.max(...row);
  const min = Math.min(...row);
  const s2 = side * side;
  return Math.max((s2 * max) / (sum * sum), (sum * sum) / (s2 * min));
}

export function squarify<T extends { size: number }>(items: T[], rect: Rect): (T & Rect)[] {
  const list = items.filter((i) => i.size > 0).sort((a, b) => b.size - a.size);
  const total = list.reduce((s, i) => s + i.size, 0);
  if (!list.length || rect.w <= 0 || rect.h <= 0 || !total) return [];
  const scale = (rect.w * rect.h) / total;
  const areas = list.map((i) => i.size * scale);
  const out: (T & Rect)[] = [];
  let { x, y, w, h } = rect;
  let start = 0;
  while (start < list.length) {
    const side = Math.min(w, h);
    let end = start + 1;
    let row = [areas[start]];
    while (end < list.length) {
      const next = [...row, areas[end]];
      if (worst(next, side) > worst(row, side)) break;
      row = next;
      end++;
    }
    const sum = row.reduce((a, b) => a + b, 0);
    if (w >= h) {
      // Coluna à esquerda.
      const cw = sum / h;
      let cy = y;
      for (let i = start; i < end; i++) {
        const ch = areas[i] / cw;
        out.push({ ...list[i], x, y: cy, w: cw, h: ch });
        cy += ch;
      }
      x += cw;
      w -= cw;
    } else {
      // Linha no topo.
      const rh = sum / w;
      let cx = x;
      for (let i = start; i < end; i++) {
        const cw = areas[i] / rh;
        out.push({ ...list[i], x: cx, y, w: cw, h: rh });
        cx += cw;
      }
      y += rh;
      h -= rh;
    }
    start = end;
  }
  return out;
}
