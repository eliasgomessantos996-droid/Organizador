import { describe, expect, it } from 'vitest';
import { clickSelect, EMPTY_SEL, invertSelection, moveFocus, selectAll, typeAhead } from './selection';

const keys = ['a', 'b', 'c', 'd', 'e'];

describe('seleção estilo Explorer', () => {
  it('clique simples, Ctrl e Shift', () => {
    let s = clickSelect(EMPTY_SEL, keys, 1, { ctrl: false, shift: false });
    expect([...s.selected]).toEqual(['b']);
    s = clickSelect(s, keys, 3, { ctrl: false, shift: true });
    expect([...s.selected]).toEqual(['b', 'c', 'd']);
    s = clickSelect(s, keys, 2, { ctrl: true, shift: false });
    expect([...s.selected].sort()).toEqual(['b', 'd']);
    s = clickSelect(s, keys, 4, { ctrl: true, shift: true });
    expect([...s.selected].sort()).toEqual(['b', 'c', 'd', 'e']);
  });

  it('teclado', () => {
    let s = moveFocus(EMPTY_SEL, keys, 1, { shift: false });
    expect(s.focus).toBe('a');
    s = moveFocus(s, keys, 2, { shift: true });
    expect([...s.selected]).toEqual(['a', 'b', 'c']);
    s = moveFocus(s, keys, 'end', { shift: false });
    expect([...s.selected]).toEqual(['e']);
    expect(selectAll(keys, null).selected.size).toBe(5);
    expect([...invertSelection(s, keys).selected]).toEqual(['a', 'b', 'c', 'd']);
  });

  it('busca por digitação', () => {
    const names = ['Álbum', 'banana', 'Bolo', 'casa', 'dado'];
    expect(typeAhead(names, keys, 'b', null)).toBe('b');
    expect(typeAhead(names, keys, 'b', 'b')).toBe('c');
    expect(typeAhead(names, keys, 'al', null)).toBe('a');
    expect(typeAhead(names, keys, 'zz', null)).toBeNull();
  });
});
