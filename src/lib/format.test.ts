import { describe, expect, it } from 'vitest';
import { basename, dirname, formatBytes, formatDuration, formatRelative, isInside, joinPath, pathCrumbs, samePath } from './format';

describe('formatBytes', () => {
  it('usa base 1024 e vírgula decimal', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1,50 KB');
    expect(formatBytes(15 * 1024 * 1024)).toBe('15,0 MB');
    expect(formatBytes(150 * 1024 * 1024)).toBe('150 MB');
    expect(formatBytes(2.5 * 1024 ** 3)).toBe('2,50 GB');
  });
  it('não mostra 1.024 KB', () => {
    expect(formatBytes(1024 * 1024 - 1)).toBe('1,00 MB');
  });
});

describe('datas e durações', () => {
  const now = new Date('2026-11-16T12:00:00').getTime();
  it('formata tempo relativo', () => {
    expect(formatRelative(now - 30_000, now)).toBe('agora');
    expect(formatRelative(now - 5 * 60_000, now)).toBe('há 5 min');
    expect(formatRelative(now - 3 * 3_600_000, now)).toBe('há 3 h');
    expect(formatRelative(now - 30 * 3_600_000, now)).toBe('ontem');
    expect(formatRelative(now - 10 * 86_400_000, now)).toBe('há 10 dias');
    expect(formatRelative(now - 400 * 86_400_000, now)).toBe('há 1 ano');
    expect(formatRelative(0, now)).toBe('nunca');
  });
  it('formata durações', () => {
    expect(formatDuration(42)).toBe('42 s');
    expect(formatDuration(3720)).toBe('1 h 2 min');
    expect(formatDuration(90000)).toBe('1 d 1 h');
  });
});

describe('caminhos', () => {
  it('trata caminhos do Windows', () => {
    expect(basename('C:\\Users\\Ana\\foto.jpg')).toBe('foto.jpg');
    expect(dirname('C:\\Users\\Ana\\foto.jpg')).toBe('C:\\Users\\Ana');
    expect(dirname('C:\\Users')).toBe('C:\\');
    expect(basename('C:\\')).toBe('C:\\');
    expect(joinPath('C:\\', 'Users')).toBe('C:\\Users');
    expect(joinPath('C:\\Users', 'Ana')).toBe('C:\\Users\\Ana');
    expect(pathCrumbs('C:\\Users\\Ana').map((c) => c.label)).toEqual(['C:', 'Users', 'Ana']);
    expect(pathCrumbs('C:\\Users\\Ana')[1].path).toBe('C:\\Users');
    expect(samePath('C:\\Users\\', 'c:\\users')).toBe(true);
    expect(isInside('C:\\Users\\Ana\\Docs', 'c:\\users\\ana')).toBe(true);
    expect(isInside('C:\\Users\\Anabela', 'C:\\Users\\Ana')).toBe(false);
  });
  it('trata caminhos Unix', () => {
    expect(basename('/home/ana/x.txt')).toBe('x.txt');
    expect(dirname('/home/ana')).toBe('/home');
    expect(pathCrumbs('/home/ana').map((c) => c.path)).toEqual(['/', '/home', '/home/ana']);
  });
});
