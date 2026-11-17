import { describe, expect, it } from 'vitest';
import { squarify } from './treemap';

describe('treemap squarified', () => {
  it('preenche a área toda com proporções corretas', () => {
    const items = [6, 6, 4, 3, 2, 2, 1].map((size, i) => ({ id: i, size }));
    const r = squarify(items, { x: 0, y: 0, w: 600, h: 400 });
    expect(r).toHaveLength(7);
    const area = r.reduce((s, x) => s + x.w * x.h, 0);
    expect(area).toBeCloseTo(600 * 400, 3);
    const total = 24;
    for (const x of r) expect((x.w * x.h) / (600 * 400)).toBeCloseTo(x.size / total, 6);
    // Nada sai dos limites.
    for (const x of r) {
      expect(x.x).toBeGreaterThanOrEqual(-1e-6);
      expect(x.y).toBeGreaterThanOrEqual(-1e-6);
      expect(x.x + x.w).toBeLessThanOrEqual(600 + 1e-6);
      expect(x.y + x.h).toBeLessThanOrEqual(400 + 1e-6);
    }
  });

  it('ignora itens vazios e áreas nulas', () => {
    expect(squarify([{ size: 0 }], { x: 0, y: 0, w: 10, h: 10 })).toEqual([]);
    expect(squarify([{ size: 5 }], { x: 0, y: 0, w: 0, h: 10 })).toEqual([]);
  });

  it('gera blocos razoavelmente quadrados', () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ size: 20 - i }));
    const r = squarify(items, { x: 0, y: 0, w: 800, h: 500 });
    const ratios = r.map((x) => Math.max(x.w / x.h, x.h / x.w));
    expect(Math.max(...ratios)).toBeLessThan(6);
  });
});
