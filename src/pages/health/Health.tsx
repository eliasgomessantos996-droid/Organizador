import { useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Icon } from '../../components/Icon';
import { PageHeader } from '../../components/layout/PageHeader';
import { ScoreRing } from '../../components/ScoreRing';
import { Sparkline } from '../../components/Sparkline';
import { AnimatedNumber, Meter, Segmented } from '../../components/ui/controls';
import { bandOf, STATUS_BADGE, STATUS_COLOR, STATUS_ICON } from '../../lib/health-score';
import { formatBytes, formatDay, formatDuration, formatPercent, plural } from '../../lib/format';
import { killProcess, launchTool, relaunchAsAdmin, trimMemory, WINDOWS_TOOLS } from '../../lib/systemActions';
import { go } from '../../store/nav';
import { healthTips, useHealth, useHealthPolling } from '../../store/health';
import { driveColor, driveLabel, driveUsage } from '../explorer/NavPane';

const fade = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } };

function MetricRow({ label, score, detail }: { label: string; score: number; detail: string }) {
  const b = bandOf(score);
  return (
    <div className="metric-row">
      <div className="metric-head">
        <span className="metric-label">{label}</span>
        <span className={`badge ${STATUS_BADGE[b.status]}`}>
          <Icon name={STATUS_ICON[b.status]} size={12} />
          {Math.round(score)} · {b.label}
        </span>
      </div>
      <Meter value={score / 100} color={STATUS_COLOR[b.status]} height={6} label={`${label}: ${Math.round(score)} de 100`} />
      <div className="metric-detail">{detail}</div>
    </div>
  );
}

export function Health() {
  useHealthPolling(2000, { processes: true });
  const h = useHealth();
  const [procSort, setProcSort] = useState<'memory' | 'cpu'>('memory');
  const procRef = useRef<HTMLDivElement>(null);
  const snap = h.snapshot;
  const tips = useMemo(() => healthTips(h), [h]);
  const band = h.score !== null ? bandOf(h.score) : null;

  const processes = useMemo(() => {
    // Agrupa processos de mesmo nome (ex.: várias abas do navegador).
    const map = new Map<string, { name: string; pids: number[]; cpu: number; memory: number; protected: boolean }>();
    for (const p of h.processes) {
      const cur = map.get(p.name) ?? { name: p.name, pids: [], cpu: 0, memory: 0, protected: false };
      cur.pids.push(p.pid);
      cur.cpu += p.cpu;
      cur.memory += p.memory;
      cur.protected ||= p.protected;
      map.set(p.name, cur);
    }
    return [...map.values()].sort((a, b) => (procSort === 'cpu' ? b.cpu - a.cpu : b.memory - a.memory)).slice(0, 12);
  }, [h.processes, procSort]);

  const memPct = snap ? snap.memory.used / snap.memory.total : 0;

  const runTip = (t: (typeof tips)[number]) => {
    if (!t.action) return;
    if (t.action.run === 'trim') void trimMemory();
    else if (t.action.run === 'processes') procRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else if (t.action.page) go(t.action.page, t.action.tab ? { tab: t.action.tab } : undefined);
  };

  return (
    <div className="page-scroll">
      <PageHeader
        icon="heart-pulse"
        playing
        title="Saúde do PC"
        subtitle={snap ? `${snap.system.os} · ${snap.system.hostName || 'Este computador'} · atualizado a cada 2 segundos` : 'Medindo o desempenho…'}
        actions={
          <>
            <button type="button" className="btn btn-sm anim-hover" onClick={() => void trimMemory()}>
              <Icon name="memory" size={15} />
              Liberar memória
            </button>
            <button type="button" className="btn btn-sm btn-primary anim-hover" onClick={() => go('otimizar')}>
              <Icon name="bolt" size={15} />
              Otimizar agora
            </button>
          </>
        }
      />

      <div className="health-top">
        <motion.section {...fade} className="card card-pad health-hero">
          <ScoreRing score={h.score} size={196} stroke={14} />
          <div className="health-hero-text">
            <div className="section-label">Nota geral</div>
            <h2 className="health-verdict">
              {band
                ? band.status === 'good'
                  ? 'Seu computador está em boa forma'
                  : band.status === 'warning'
                    ? 'Seu computador precisa de atenção'
                    : 'Seu computador está sofrendo'
                : 'Calculando a nota…'}
            </h2>
            <p className="muted" style={{ marginBottom: 14 }}>
              100% significa perfeito e 0% muito ruim. A nota combina espaço em disco, memória, processador, arquivos desnecessários e inicialização.
            </p>
            <div className="metric-list">
              {h.metrics.map((m) => (
                <MetricRow key={m.id} label={`${m.label} · ${Math.round(m.weight * 100)}%`} score={m.score} detail={m.detail} />
              ))}
            </div>
          </div>
        </motion.section>

        <motion.section {...fade} transition={{ delay: 0.05 }} className="card card-pad health-tips">
          <div className="card-header">
            <Icon name="sparkles" size={18} className="playing text-accent" />
            <div className="card-title">Recomendações</div>
          </div>
          {tips.length === 0 ? (
            <div className="tip ok">
              <span className="tip-icon good">
                <Icon name="check-circle" size={18} className="draw" />
              </span>
              <div>
                <div className="tip-title">Tudo certo por aqui!</div>
                <div className="tip-text">Nenhum problema encontrado. Continue usando o One Click Optimize de vez em quando.</div>
              </div>
            </div>
          ) : (
            tips.map((t, i) => (
              <motion.div key={t.id} className="tip" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                <span className={`tip-icon ${t.status}`}>
                  <Icon name={STATUS_ICON[t.status]} size={18} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="tip-title">{t.title}</div>
                  <div className="tip-text">{t.text}</div>
                  {t.action ? (
                    <button type="button" className="btn btn-soft btn-sm" style={{ marginTop: 8 }} onClick={() => runTip(t)}>
                      {t.action.label}
                      <Icon name="arrow-right" size={13} />
                    </button>
                  ) : null}
                </div>
              </motion.div>
            ))
          )}
        </motion.section>
      </div>

      <div className="grid-4" style={{ marginTop: 16 }}>
        <motion.div {...fade} className="card card-pad live-card">
          <div className="row">
            <div className="icon-tile">
              <Icon name="cpu" size={19} />
            </div>
            <div className="stack" style={{ gap: 0 }}>
              <span className="stat-label">Processador</span>
              <span className="stat-value">{snap ? <AnimatedNumber value={snap.cpu.usage} format={(v) => `${Math.round(v)}%`} duration={500} /> : '—'}</span>
            </div>
          </div>
          <Sparkline data={h.cpuSamples} label="Uso do processador" />
          <div className="stat-sub truncate">{snap?.cpu.brand}</div>
        </motion.div>

        <motion.div {...fade} className="card card-pad live-card">
          <div className="row">
            <div className="icon-tile">
              <Icon name="memory" size={19} />
            </div>
            <div className="stack" style={{ gap: 0 }}>
              <span className="stat-label">Memória RAM</span>
              <span className="stat-value">{snap ? <AnimatedNumber value={memPct * 100} format={(v) => `${Math.round(v)}%`} duration={500} /> : '—'}</span>
            </div>
          </div>
          <Sparkline data={h.memSamples} label="Uso de memória" />
          <div className="stat-sub">{snap ? `${formatBytes(snap.memory.used)} de ${formatBytes(snap.memory.total)}` : ''}</div>
        </motion.div>

        <motion.div {...fade} className="card card-pad live-card">
          <div className="row">
            <div className="icon-tile">
              <Icon name="trash" size={19} />
            </div>
            <div className="stack" style={{ gap: 0 }}>
              <span className="stat-label">Arquivos desnecessários</span>
              <span className="stat-value">{h.junk ? formatBytes(h.junk.recycleBytes + h.junk.tempBytes) : '—'}</span>
            </div>
          </div>
          <div className="junk-split">
            <div>
              <span className="faint">Lixeira</span>
              <strong>{h.junk ? formatBytes(h.junk.recycleBytes) : '—'}</strong>
            </div>
            <div>
              <span className="faint">Temporários</span>
              <strong>{h.junk ? formatBytes(h.junk.tempBytes) : '—'}</strong>
            </div>
          </div>
          <button type="button" className="btn btn-soft btn-sm btn-block anim-hover" onClick={() => go('limpeza')}>
            <Icon name="broom" size={14} />
            Limpar
          </button>
        </motion.div>

        <motion.div {...fade} className="card card-pad live-card">
          <div className="row">
            <div className="icon-tile">
              <Icon name="clock" size={19} />
            </div>
            <div className="stack" style={{ gap: 0 }}>
              <span className="stat-label">Tempo ligado</span>
              <span className="stat-value">{snap ? formatDuration(snap.system.uptimeSecs) : '—'}</span>
            </div>
          </div>
          <div className="stat-sub" style={{ marginTop: 8 }}>
            {snap ? `Desde ${formatDay(snap.system.bootTime * 1000)} · ${plural(snap.system.processCount, 'processo', 'processos')}` : ''}
          </div>
          <div className="stat-sub">
            {h.startupEnabled !== null ? (
              <button type="button" className="link-btn" onClick={() => go('inicializacao')}>
                {plural(h.startupEnabled, 'programa inicia', 'programas iniciam')} com o Windows
              </button>
            ) : null}
          </div>
        </motion.div>
      </div>

      <div className="health-mid">
        <motion.section {...fade} className="card card-pad">
          <div className="card-header">
            <Icon name="hard-drive" size={18} />
            <div className="card-title">Discos</div>
          </div>
          <div className="stack" style={{ gap: 16 }}>
            {snap?.disks.map((d) => {
              const u = driveUsage(d);
              return (
                <div key={d.mount} className="disk-row">
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="row" style={{ gap: 8 }}>
                      <Icon name={d.removable ? 'usb' : 'hard-drive'} size={16} className="faint" />
                      <strong>{driveLabel(d)}</strong>
                      {d.kind !== 'desconhecido' ? <span className="badge">{d.kind.toUpperCase()}</span> : null}
                      {d.removable ? <span className="badge badge-info">Externo</span> : null}
                    </span>
                    <span className="muted tabular">{formatPercent(u.fraction)} usado</span>
                  </div>
                  <Meter value={u.fraction} color={driveColor(u.status)} height={8} label={`${driveLabel(d)}: ${formatPercent(u.fraction)} usado`} />
                  <div className="row" style={{ justifyContent: 'space-between', fontSize: 12.5 }}>
                    <span className="muted">
                      {formatBytes(d.free)} livres de {formatBytes(d.total)}
                    </span>
                    {u.status !== 'ok' ? (
                      <span className={`badge ${u.status === 'critical' ? 'badge-critical' : 'badge-warning'}`}>
                        <Icon name={u.status === 'critical' ? 'x-circle' : 'alert-triangle'} size={12} />
                        {u.status === 'critical' ? 'Quase cheio' : 'Pouco espaço'}
                      </span>
                    ) : (
                      <span className="badge badge-good">
                        <Icon name="check-circle" size={12} />
                        Saudável
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </motion.section>

        <motion.section {...fade} className="card card-pad">
          <div className="card-header">
            <Icon name="battery" size={18} />
            <div className="card-title">Bateria</div>
          </div>
          {h.battery ? (
            <div className="stack" style={{ gap: 14 }}>
              <div className="row" style={{ gap: 16 }}>
                <div className="battery-gauge">
                  <div className="battery-fill" style={{ width: `${h.battery.percent}%`, background: h.battery.percent < 20 ? 'var(--status-critical)' : 'var(--series-1)' }} />
                  <span>{Math.round(h.battery.percent)}%</span>
                </div>
                <div className="stack" style={{ gap: 2 }}>
                  <strong>{h.battery.charging ? 'Carregando' : h.battery.plugged ? 'Na tomada' : 'Usando bateria'}</strong>
                  <span className="muted" style={{ fontSize: 12.5 }}>
                    {h.battery.minutesLeft ? `${formatDuration(h.battery.minutesLeft * 60)} ${h.battery.charging ? 'para carregar' : 'restantes'}` : ' '}
                  </span>
                </div>
              </div>
              {h.battery.health !== null ? (
                <MetricRow label="Saúde da bateria" score={h.battery.health} detail={`Capacidade atual em relação à original${h.battery.cycles ? ` · ${h.battery.cycles} ciclos de carga` : ''}`} />
              ) : (
                <div className="muted" style={{ fontSize: 12.5 }}>
                  O Windows não informa o desgaste desta bateria.
                </div>
              )}
            </div>
          ) : (
            <div className="muted" style={{ fontSize: 13 }}>
              {h.battery === undefined ? 'Verificando…' : 'Nenhuma bateria encontrada (computador de mesa).'}
            </div>
          )}

          <hr className="divider" />
          <div className="card-header" style={{ marginBottom: 10 }}>
            <Icon name="info" size={18} />
            <div className="card-title">Este computador</div>
          </div>
          {snap ? (
            <div className="sys-grid">
              <span className="faint">Sistema</span>
              <span>{snap.system.os}</span>
              <span className="faint">Processador</span>
              <span className="truncate">{snap.cpu.brand || '—'}</span>
              <span className="faint">Núcleos</span>
              <span>
                {snap.cpu.physicalCores ?? '?'} físicos · {snap.cpu.cores} lógicos
              </span>
              <span className="faint">Memória</span>
              <span>{formatBytes(snap.memory.total)}</span>
              <span className="faint">Permissão</span>
              <span className="row" style={{ gap: 6 }}>
                {snap.system.elevated ? (
                  <span className="badge badge-good">
                    <Icon name="shield-check" size={12} />
                    Administrador
                  </span>
                ) : (
                  <>
                    <span className="badge">Usuário comum</span>
                    <button type="button" className="link-btn" onClick={() => void relaunchAsAdmin()}>
                      Abrir como administrador
                    </button>
                  </>
                )}
              </span>
            </div>
          ) : null}
        </motion.section>
      </div>

      <motion.section {...fade} className="card card-pad" style={{ marginTop: 16 }} ref={procRef}>
        <div className="card-header">
          <Icon name="activity" size={18} />
          <div className="card-title">Programas que mais consomem</div>
          <div className="spacer" />
          <Segmented
            size="sm"
            value={procSort}
            onChange={setProcSort}
            options={[
              { value: 'memory', label: 'Memória', icon: 'memory' },
              { value: 'cpu', label: 'Processador', icon: 'cpu' },
            ]}
          />
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Programa</th>
              <th className="num">Processos</th>
              <th className="num">Processador</th>
              <th className="num">Memória</th>
              <th style={{ width: 120 }} />
            </tr>
          </thead>
          <tbody>
            {processes.map((p) => (
              <tr key={p.name}>
                <td>
                  <span className="row" style={{ gap: 8 }}>
                    <Icon name="app-window" size={16} className="faint" />
                    {p.name}
                  </span>
                </td>
                <td className="num faint">{p.pids.length}</td>
                <td className="num">{p.cpu.toFixed(1).replace('.', ',')}%</td>
                <td className="num">{formatBytes(p.memory)}</td>
                <td style={{ textAlign: 'right' }}>
                  {p.protected ? (
                    <span className="faint row" style={{ gap: 4, justifyContent: 'flex-end', fontSize: 12 }} data-tip="Processo essencial do Windows">
                      <Icon name="lock" size={13} />
                      Protegido
                    </span>
                  ) : (
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => p.pids.forEach((pid, i) => i === 0 && void killProcess(pid, p.name))}>
                      Encerrar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </motion.section>

      <motion.section {...fade} className="card card-pad" style={{ marginTop: 16 }}>
        <div className="card-header">
          <Icon name="settings" size={18} />
          <div className="card-title">Ferramentas do Windows</div>
          <span className="card-subtitle">Atalhos para recursos nativos que complementam o Organizador</span>
        </div>
        <div className="tools-grid">
          {WINDOWS_TOOLS.map((t) => (
            <button key={t.id} type="button" className="tool-btn anim-hover" onClick={() => void launchTool(t.id)}>
              <Icon name={t.icon} size={18} />
              {t.label}
            </button>
          ))}
        </div>
      </motion.section>
    </div>
  );
}
