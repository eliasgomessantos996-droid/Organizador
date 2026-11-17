import { describe, expect, it } from 'vitest';
import { applyExplorerFilter, dateBucketOf, EMPTY_EXPLORER_FILTER, nameRangeOf, sizeBucketOf, sortEntries, textMatcher } from './filters';
import type { FileEntry } from './types';

const now = new Date('2026-11-18T15:00:00'); // quarta-feira
const day = 86_400_000;
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 10).getTime();

function f(name: string, size: number, modified: number, isDir = false): FileEntry {
  const ext = isDir ? '' : (name.split('.').pop() ?? '').toLowerCase();
  return {
    name,
    path: `C:\\x\\${name}`,
    parent: 'C:\\x',
    isDir,
    size,
    modified,
    created: modified,
    accessed: modified,
    ext,
    category: isDir ? 'folder' : ext === 'jpg' ? 'image' : ext === 'pdf' ? 'pdf' : 'other',
    hidden: false,
    system: false,
    readonly: false,
    isLink: false,
  };
}

describe('faixas do Explorer', () => {
  it('classifica tamanhos', () => {
    expect(sizeBucketOf(0)).toBe('vazio');
    expect(sizeBucketOf(10 * 1024)).toBe('minusculo');
    expect(sizeBucketOf(500 * 1024)).toBe('pequeno');
    expect(sizeBucketOf(50 * 1024 * 1024)).toBe('medio');
    expect(sizeBucketOf(600 * 1024 * 1024)).toBe('grande');
    expect(sizeBucketOf(2 * 1024 ** 3)).toBe('enorme');
    expect(sizeBucketOf(8 * 1024 ** 3)).toBe('gigantesco');
  });

  it('classifica datas (faixas exclusivas)', () => {
    expect(dateBucketOf(now.getTime() - 3_600_000, now)).toBe('hoje');
    expect(dateBucketOf(now.getTime() - day, now)).toBe('ontem');
    expect(dateBucketOf(at(2026, 11, 15), now)).toBe('esta-semana'); // domingo desta semana
    expect(dateBucketOf(at(2026, 11, 10), now)).toBe('semana-passada');
    expect(dateBucketOf(at(2026, 11, 3), now)).toBe('este-mes');
    expect(dateBucketOf(at(2026, 10, 20), now)).toBe('mes-passado');
    expect(dateBucketOf(at(2026, 3, 1), now)).toBe('este-ano');
    expect(dateBucketOf(at(2025, 6, 1), now)).toBe('ano-passado');
    expect(dateBucketOf(at(2019, 1, 1), now)).toBe('muito-tempo');
  });

  it('classifica nomes', () => {
    expect(nameRangeOf('Ábaco')).toBe('a-h');
    expect(nameRangeOf('jornal')).toBe('i-p');
    expect(nameRangeOf('Zebra')).toBe('q-z');
    expect(nameRangeOf('2024 fotos')).toBe('0-9');
  });
});

describe('filtro e ordenação', () => {
  const list = [
    f('foto10.jpg', 2_000_000, now.getTime()),
    f('foto2.jpg', 500, at(2024, 1, 1)),
    f('Contrato.pdf', 300_000, at(2026, 11, 17)),
    f('Pasta', 0, at(2020, 1, 1), true),
  ];

  it('busca com coringas e sem acentos', () => {
    expect(textMatcher('*.PDF')('Contrato.pdf')).toBe(true);
    expect(textMatcher('relatorio')('Relatório final.docx')).toBe(true);
    expect(textMatcher('foto?.jpg')('foto10.jpg')).toBe(false);
  });

  it('aplica filtros de coluna', () => {
    expect(applyExplorerFilter(list, { ...EMPTY_EXPLORER_FILTER, sizes: ['medio'] }, now).map((e) => e.name)).toEqual(['foto10.jpg']);
    expect(applyExplorerFilter(list, { ...EMPTY_EXPLORER_FILTER, dates: ['ontem'] }, now).map((e) => e.name)).toEqual(['Contrato.pdf']);
    expect(applyExplorerFilter(list, { ...EMPTY_EXPLORER_FILTER, types: ['Pasta de arquivos'] }, now).map((e) => e.name)).toEqual(['Pasta']);
    expect(applyExplorerFilter(list, { ...EMPTY_EXPLORER_FILTER, text: 'foto' }, now)).toHaveLength(2);
  });

  it('ordena como o Explorer (pastas primeiro, números naturais)', () => {
    expect(sortEntries(list, { key: 'name', desc: false }).map((e) => e.name)).toEqual(['Pasta', 'Contrato.pdf', 'foto2.jpg', 'foto10.jpg']);
    expect(sortEntries(list, { key: 'size', desc: true }).map((e) => e.name)[1]).toBe('foto10.jpg');
    expect(sortEntries(list, { key: 'name', desc: false }, false)[0].name).toBe('Contrato.pdf');
  });
});
