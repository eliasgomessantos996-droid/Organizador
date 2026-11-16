import { useEffect } from 'react';
import { create } from 'zustand';
import { api } from '../lib/api';
import { computeHealth, type MetricScore, type Status } from '../lib/health-score';
import { formatBytes, formatDuration } from '../lib/format';
import type { BatteryInfo, HealthSnapshot, JunkInfo, ProcessInfo } from '../lib/types';
import type { PageId } from './nav';

export interface Sample {
  t: number;
  v: number;
}

export interface Tip {
  id: string;
  status: Status;
  title: string;
  text: string;
  action?: { label: string; page?: PageId; tab?: string; run?: 'trim' | 'processes' };
}

interface HealthState {
  snapshot: HealthSnapshot | null;
  cpuSamples: Sample[];
  memSamples: Sample[];
  junk: JunkInfo | null;
  startupEnabled: number | null;
  battery: BatteryInfo | null | undefined;
  processes: ProcessInfo[];
  score: number | null;
  metrics: MetricScore[];
  polling: boolean;
  setScore: (s: number | null) => void;
  poll: () => Promise<void>;
  loadExtras: (force?: boolean) => Promise<void>;
  loadProcesses: () => Promise<void>;
}

const MAX_SAMPLES = 60;

function recompute(s: Pick<HealthState, 'snapshot' | 'cpuSamples' | 'junk' | 'startupEnabled'>) {
  if (!s.snapshot) return { score: null, metrics: [] };
  // Média dos últimos ~20 s evita que um pico momentâneo derrube a nota.
  const recent = s.cpuSamples.slice(-10);
  const cpu = recent.length ? recent.reduce((a, x) => a + x.v, 0) / recent.length : s.snapshot.cpu.usage;
  const mem = s.snapshot.memory.total ? (s.snapshot.memory.used / s.snapshot.memory.total) * 100 : 0;
  const r = computeHealth({
    cpuPct: cpu,
    memPct: mem,
    disks: s.snapshot.disks,
    junkBytes: s.junk ? s.junk.recycleBytes + s.junk.tempBytes : null,
    startupEnabled: s.startupEnabled,
  });
  return { score: r.score, metrics: r.metrics };
}

export const useHealth = create<HealthState>((set, get) => ({
  snapshot: null,
  cpuSamples: [],
  memSamples: [],
  junk: null,
  startupEnabled: null,
  battery: undefined,
  processes: [],
  score: null,
  metrics: [],
  polling: false,

  setScore: (score) => set({ score }),

  poll: async () => {
    if (get().polling) return;
    set({ polling: true });
    try {
      const snap = await api.healthSnapshot();
      const t = Date.now();
      const cpuSamples = [...get().cpuSamples, { t, v: snap.cpu.usage }].slice(-MAX_SAMPLES);
      const memPct = snap.memory.total ? (snap.memory.used / snap.memory.total) * 100 : 0;
      const memSamples = [...get().memSamples, { t, v: memPct }].slice(-MAX_SAMPLES);
      const next = { ...get(), snapshot: snap, cpuSamples, memSamples };
      set({ snapshot: snap, cpuSamples, memSamples, ...recompute(next) });
    } catch {
      /* mantém os últimos valores */
    } finally {
      set({ polling: false });
    }
  },

  loadExtras: async (force = false) => {
    const [junk, startup, battery] = await Promise.all([
      api.junkEstimate(force).catch(() => get().junk),
      api.startupList().catch(() => null),
      api.batteryInfo().catch(() => null),
    ]);
    const startupEnabled = startup ? startup.filter((s) => s.enabled).length : get().startupEnabled;
    const next = { ...get(), junk, startupEnabled };
    set({ junk, startupEnabled, battery, ...recompute(next) });
  },

  loadProcesses: async () => {
    const processes = await api.topProcesses(40).catch(() => get().processes);
    set({ processes });
  },
}));

/** Mantém as medições atualizadas enquanto o componente estiver na tela. */
export function useHealthPolling(intervalMs: number, opts: { processes?: boolean } = {}) {
  useEffect(() => {
    const st = useHealth.getState();
    void st.poll();
    if (st.junk === null) void st.loadExtras();
    if (opts.processes) void st.loadProcesses();
    const t = window.setInterval(() => {
      if (document.hidden) return;
      void useHealth.getState().poll();
      if (opts.processes) void useHealth.getState().loadProcesses();
    }, intervalMs);
    const t2 = window.setInterval(() => !document.hidden && void useHealth.getState().loadExtras(), 90_000);
    return () => {
      window.clearInterval(t);
      window.clearInterval(t2);
    };
  }, [intervalMs, opts.processes]);
}

/** Recomendações a partir das medições (cada uma com uma ação concreta). */
export function healthTips(s: Pick<HealthState, 'snapshot' | 'cpuSamples' | 'junk' | 'startupEnabled' | 'battery'>): Tip[] {
  const tips: Tip[] = [];
  const snap = s.snapshot;
  if (!snap) return tips;
  for (const d of snap.disks.filter((x) => !x.removable && x.total > 0)) {
    const freePct = d.free / d.total;
    const name = d.mount.replace(/\\$/, '');
    if (freePct < 0.1 || (d.isSystem && d.free < 10 * 1024 ** 3)) {
      tips.push({
        id: `disk-${d.mount}`,
        status: 'critical',
        title: `Disco ${name} quase cheio`,
        text: `Restam só ${formatBytes(d.free)}. Com pouco espaço o Windows fica lento e pode falhar ao atualizar.`,
        action: { label: 'Ver o que ocupa espaço', page: 'mapa' },
      });
    } else if (freePct < 0.2) {
      tips.push({
        id: `disk-${d.mount}`,
        status: 'warning',
        title: `Pouco espaço livre em ${name}`,
        text: `${formatBytes(d.free)} livres (${Math.round(freePct * 100)}%). Uma limpeza pode recuperar bastante espaço.`,
        action: { label: 'Limpar agora', page: 'otimizar' },
      });
    }
  }
  const memPct = snap.memory.total ? snap.memory.used / snap.memory.total : 0;
  if (memPct > 0.85)
    tips.push({
      id: 'mem',
      status: memPct > 0.95 ? 'critical' : 'serious',
      title: 'Memória quase esgotada',
      text: `${Math.round(memPct * 100)}% da RAM em uso. Feche programas pesados ou libere memória ociosa.`,
      action: { label: 'Liberar memória', run: 'trim' },
    });
  const recent = s.cpuSamples.slice(-10);
  const cpuAvg = recent.length ? recent.reduce((a, x) => a + x.v, 0) / recent.length : 0;
  if (recent.length >= 5 && cpuAvg > 80)
    tips.push({
      id: 'cpu',
      status: 'serious',
      title: 'Processador sobrecarregado',
      text: `Uso médio de ${Math.round(cpuAvg)}% nos últimos segundos. Veja quais programas estão consumindo mais.`,
      action: { label: 'Ver processos', run: 'processes' },
    });
  if (s.junk) {
    const junk = s.junk.recycleBytes + s.junk.tempBytes;
    if (junk > 1024 ** 3)
      tips.push({
        id: 'junk',
        status: junk > 5 * 1024 ** 3 ? 'serious' : 'warning',
        title: `${formatBytes(junk)} em arquivos desnecessários`,
        text: `Lixeira com ${formatBytes(s.junk.recycleBytes)} e temporários com ${formatBytes(s.junk.tempBytes)}.`,
        action: { label: 'One Click Optimize', page: 'otimizar' },
      });
  }
  if (s.startupEnabled !== null && s.startupEnabled > 8)
    tips.push({
      id: 'startup',
      status: s.startupEnabled > 15 ? 'serious' : 'warning',
      title: `${s.startupEnabled} programas iniciam com o Windows`,
      text: 'Desativar os que você não usa logo ao ligar deixa a inicialização mais rápida.',
      action: { label: 'Gerenciar inicialização', page: 'inicializacao' },
    });
  if (snap.system.uptimeSecs > 7 * 86400)
    tips.push({
      id: 'uptime',
      status: 'warning',
      title: `Ligado há ${formatDuration(snap.system.uptimeSecs)}`,
      text: 'Reiniciar de vez em quando libera memória, conclui atualizações e resolve lentidões.',
    });
  if (s.battery?.health != null && s.battery.health < 70)
    tips.push({
      id: 'battery',
      status: s.battery.health < 50 ? 'serious' : 'warning',
      title: 'Bateria desgastada',
      text: `A bateria guarda ${Math.round(s.battery.health)}% da carga original. Considere substituí-la se a autonomia estiver curta.`,
    });
  const order: Status[] = ['critical', 'serious', 'warning', 'good'];
  return tips.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
}
