import { describe, expect, it } from 'vitest';
import { bandOf, computeHealth, diskScore, piecewise, scoreCpu, scoreDisk, scoreJunk, scoreMemory, scoreStartup } from './health-score';

const GB = 1024 ** 3;

describe('faixas da nota', () => {
  it('100% é Perfeito e 0% é Muito ruim', () => {
    expect(bandOf(100).label).toBe('Perfeito');
    expect(bandOf(90).label).toBe('Ótimo');
    expect(bandOf(70).label).toBe('Bom');
    expect(bandOf(50).label).toBe('Regular');
    expect(bandOf(30).label).toBe('Ruim');
    expect(bandOf(0).label).toBe('Muito ruim!');
    expect(bandOf(0).status).toBe('critical');
    expect(bandOf(100).status).toBe('good');
  });
});

describe('métricas', () => {
  it('interpola entre pontos', () => {
    expect(piecewise(5, [[0, 0], [10, 100]])).toBe(50);
    expect(piecewise(-1, [[0, 10], [10, 100]])).toBe(10);
    expect(piecewise(99, [[0, 10], [10, 100]])).toBe(100);
  });

  it('CPU e memória', () => {
    expect(scoreCpu(10)).toBe(100);
    expect(scoreCpu(100)).toBe(10);
    expect(scoreMemory(40)).toBe(100);
    expect(scoreMemory(85)).toBe(55);
    expect(scoreMemory(100)).toBe(5);
  });

  it('disco do sistema com pouco espaço absoluto é penalizado', () => {
    expect(scoreDisk(40, 200 * GB, true)).toBe(100);
    expect(scoreDisk(40, 8 * GB, true)).toBe(40);
    expect(scoreDisk(40, 3 * GB, true)).toBe(20);
    expect(scoreDisk(2, 1 * GB, false)).toBeLessThan(25);
  });

  it('o disco do sistema pesa mais', () => {
    const d = diskScore([
      { mount: 'C:\\', total: 100 * GB, free: 4 * GB, isSystem: true, removable: false },
      { mount: 'D:\\', total: 100 * GB, free: 80 * GB, isSystem: false, removable: false },
      { mount: 'E:\\', total: 8 * GB, free: 0, isSystem: false, removable: true },
    ]);
    expect(d.score).toBeCloseTo(20 * 0.7 + 100 * 0.3);
    expect(d.worst).toBe('C:\\');
  });

  it('lixo e inicialização', () => {
    expect(scoreJunk(0.2 * GB)).toBe(100);
    expect(scoreJunk(5 * GB)).toBe(65);
    expect(scoreStartup(3)).toBe(100);
    expect(scoreStartup(15)).toBe(62);
  });
});

describe('nota geral', () => {
  const disks = [{ mount: 'C:\\', total: 500 * GB, free: 300 * GB, isSystem: true, removable: false }];

  it('computador folgado tira 100', () => {
    expect(computeHealth({ cpuPct: 5, memPct: 30, disks, junkBytes: 0, startupEnabled: 2 }).score).toBe(100);
  });

  it('computador sobrecarregado fica em faixa ruim', () => {
    const r = computeHealth({
      cpuPct: 95,
      memPct: 97,
      disks: [{ mount: 'C:\\', total: 250 * GB, free: 2 * GB, isSystem: true, removable: false }],
      junkBytes: 30 * GB,
      startupEnabled: 30,
    });
    expect(r.score).toBeLessThan(25);
    expect(bandOf(r.score).label).toBe('Muito ruim!');
  });

  it('redistribui o peso de métricas desconhecidas', () => {
    const r = computeHealth({ cpuPct: 5, memPct: 30, disks, junkBytes: null, startupEnabled: null });
    expect(r.metrics).toHaveLength(3);
    expect(r.score).toBe(100);
  });
});
