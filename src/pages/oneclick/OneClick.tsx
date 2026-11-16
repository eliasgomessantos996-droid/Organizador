import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Icon, type IconName } from '../../components/Icon';
import { PageHeader } from '../../components/layout/PageHeader';
import { AnimatedNumber, ProgressBar, Spinner } from '../../components/ui/controls';
import { api, errorText, newTaskId } from '../../lib/api';
import { cleanOptions, PROFILES, profileTargets, runCleanup } from '../../lib/cleanup';
import { bandOf, STATUS_COLOR, STATUS_ICON } from '../../lib/health-score';
import { formatBytes, formatRelative, plural, splitBytes } from '../../lib/format';
import { trimMemory } from '../../lib/systemActions';
import type { CleanReport, TargetInfo, TargetReport, TrimReport } from '../../lib/types';
import { useHealth } from '../../store/health';
import { useHistory } from '../../store/history';
import { go } from '../../store/nav';
import { useSettings } from '../../store/settings';
import { useTasks } from '../../store/tasks';
import { toast } from '../../store/toasts';

type Phase = 'idle' | 'analyzing' | 'review' | 'cleaning' | 'done';

function Burst() {
  // Pequena explosão de brilhos ao concluir.
  return (
    <div className="burst" aria-hidden>
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className="burst-dot" style={{ ['--a' as string]: `${i * 36}deg`, ['--d' as string]: `${i % 2 ? 120 : 150}px`, animationDelay: `${(i % 3) * 40}ms` }}>
          <svg viewBox="0 0 24 24" width={i % 2 ? 12 : 16} height={i % 2 ? 12 : 16}>
            <path d="M12 2Q13.5 10.5 22 12Q13.5 13.5 12 22Q10.5 13.5 2 12Q10.5 10.5 12 2Z" fill="currentColor" />
          </svg>
        </span>
      ))}
    </div>
  );
}

export function OneClick() {
  const profile = useSettings((s) => s.oneClickProfile);
  const confirmFirst = useSettings((s) => s.confirmBeforeClean);
  const trimAfter = useSettings((s) => s.trimMemoryOnOneClick);
  const setSettings = useSettings((s) => s.set);
  const records = useHistory((s) => s.records);
  const [phase, setPhase] = useState<Phase>('idle');
  const [targets, setTargets] = useState<TargetInfo[]>([]);
  const [reports, setReports] = useState<TargetReport[]>([]);
  const [report, setReport] = useState<CleanReport | null>(null);
  const [trim, setTrim] = useState<TrimReport | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [scores, setScores] = useState<{ before: number | null; after: number | null }>({ before: null, after: null });
  const task = useTasks((s) => s.tasks.find((t) => t.id === taskId));
  const ids = useRef<string[]>([]);

  useEffect(() => {
    void api.cleanupTargets(cleanOptions()).then(setTargets).catch(() => {});
  }, []);

  const planned = useMemo(() => {
    const want = new Set(profileTargets(profile));
    return targets.filter((t) => want.has(t.id) && t.available);
  }, [targets, profile]);

  const found = useMemo(() => reports.reduce((s, r) => s + r.bytes, 0), [reports]);
  const lastRun = records.find((r) => r.source === 'oneclick');

  const start = async () => {
    if (phase !== 'idle' && phase !== 'done') return;
    setReport(null);
    setTrim(null);
    setReports([]);
    setScores({ before: useHealth.getState().score, after: null });
    ids.current = planned.map((t) => t.id);
    const id = newTaskId();
    setTaskId(id);
    setPhase('analyzing');
    useTasks.getState().start({ id, title: 'One Click Optimize', icon: 'bolt', cancellable: false });
    try {
      const list = await api.cleanupAnalyze(id, ids.current, cleanOptions());
      setReports(list);
      if (confirmFirst) {
        setPhase('review');
        useTasks.getState().finish(id);
        setTaskId(null);
      } else {
        await clean(id, list);
      }
    } catch (e) {
      toast.error('Não foi possível analisar', errorText(e));
      useTasks.getState().finish(id);
      setTaskId(null);
      setPhase('idle');
    }
  };

  const clean = async (existingTask?: string, list = reports) => {
    const id = existingTask ?? newTaskId();
    if (!existingTask) useTasks.getState().start({ id, title: 'One Click Optimize', icon: 'bolt', cancellable: false });
    setTaskId(id);
    setPhase('cleaning');
    const withContent = list.filter((r) => r.files > 0 || r.id === 'lixeira').map((r) => r.id);
    const r = await runCleanup(withContent, 'oneclick', { silent: true, taskId: id });
    let t: TrimReport | null = null;
    if (trimAfter) t = await trimMemory(true);
    await useHealth.getState().loadExtras(true);
    await useHealth.getState().poll();
    useTasks.getState().finish(id);
    setTaskId(null);
    setReport(r);
    setTrim(t);
    setScores((s) => ({ ...s, after: useHealth.getState().score }));
    setPhase('done');
  };

  const pct = task && task.bytesTotal ? task.bytesDone / task.bytesTotal : task && task.total ? task.done / task.total : undefined;
  const reportFor = (id: string) => reports.find((r) => r.id === id);
  const activeName = task?.phase.split(': ')[1];

  const stepState = (t: TargetInfo): 'pending' | 'active' | 'done' => {
    if (phase === 'idle') return 'pending';
    if (phase === 'done') return 'done';
    if (activeName === t.name) return 'active';
    if (phase === 'analyzing') return reportFor(t.id) ? 'done' : 'pending';
    if (phase === 'cleaning') {
      const i = planned.findIndex((p) => p.name === activeName);
      const mine = planned.indexOf(t);
      return i >= 0 && mine < i ? 'done' : 'pending';
    }
    return 'done';
  };

  const orbLabel: Record<Phase, string> = { idle: 'Otimizar', analyzing: 'Analisando', review: 'Encontrado', cleaning: 'Limpando', done: 'Pronto!' };
  const big = splitBytes(phase === 'done' ? (report?.freed ?? 0) : found);

  return (
    <div className="page-scroll">
      <PageHeader
        icon="bolt"
        title="One Click Optimize"
        subtitle="Analisa e limpa o computador em um clique, sem precisar escolher arquivo por arquivo."
        playing={phase === 'analyzing' || phase === 'cleaning'}
        actions={
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => go('limpeza')}>
            <Icon name="broom" size={15} />
            Limpeza detalhada
          </button>
        }
      />

      <div className="oneclick">
        <section className="card oneclick-stage">
          <div className={`orb orb-${phase}`}>
            <div className="orb-halo" />
            <div className="orb-ring" />
            {phase === 'done' ? <Burst /> : null}
            <button type="button" className="orb-core" onClick={() => void start()} disabled={phase === 'analyzing' || phase === 'cleaning' || phase === 'review'}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={phase}
                  className="orb-content"
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.22 }}
                >
                  {phase === 'idle' ? (
                    <Icon name="bolt" size={52} strokeWidth={1.6} className="orb-bolt" />
                  ) : phase === 'analyzing' ? (
                    <Icon name="scan" size={48} strokeWidth={1.6} className="playing" />
                  ) : phase === 'cleaning' ? (
                    <span className="orb-num">{pct !== undefined ? `${Math.round(pct * 100)}%` : <Spinner size={30} />}</span>
                  ) : phase === 'done' ? (
                    <Icon name="check" size={56} strokeWidth={2.2} className="draw" />
                  ) : (
                    <span className="orb-num">
                      {big.value}
                      <small>{big.unit}</small>
                    </span>
                  )}
                  <span className="orb-label">{orbLabel[phase]}</span>
                </motion.div>
              </AnimatePresence>
            </button>
          </div>

          <AnimatePresence mode="wait">
            {phase === 'idle' ? (
              <motion.div key="idle" className="oneclick-under" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="profile-pick">
                  {PROFILES.map((p) => (
                    <button key={p.id} type="button" className={`profile-card anim-hover ${profile === p.id ? 'active' : ''}`} onClick={() => setSettings({ oneClickProfile: p.id })}>
                      <Icon name={p.icon} size={18} />
                      <span className="profile-name">{p.label}</span>
                      {profile === p.id ? <motion.span layoutId="profile-dot" className="profile-dot" /> : null}
                    </button>
                  ))}
                </div>
                <p className="muted oneclick-desc">{PROFILES.find((p) => p.id === profile)?.description}</p>
                <div className="faint" style={{ fontSize: 12.5 }}>
                  {lastRun ? `Última otimização ${formatRelative(lastRun.at)} · liberou ${formatBytes(lastRun.freed)}` : 'Você ainda não otimizou este computador com o Organizador.'}
                </div>
              </motion.div>
            ) : phase === 'analyzing' || phase === 'cleaning' ? (
              <motion.div key="work" className="oneclick-under" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="oneclick-phase">{task?.phase || (phase === 'analyzing' ? 'Analisando…' : 'Limpando…')}</div>
                <div style={{ width: 360 }}>
                  <ProgressBar value={pct} indeterminate={pct === undefined} />
                </div>
                {phase === 'cleaning' && task?.bytesTotal ? (
                  <div className="faint tabular" style={{ fontSize: 12.5 }}>
                    {formatBytes(task.bytesDone)} de {formatBytes(task.bytesTotal)}
                  </div>
                ) : null}
              </motion.div>
            ) : phase === 'review' ? (
              <motion.div key="review" className="oneclick-under" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <div className="oneclick-phase">
                  Encontramos <strong>{formatBytes(found)}</strong> que podem ser liberados
                </div>
                <div className="row" style={{ gap: 10 }}>
                  <button type="button" className="btn" onClick={() => setPhase('idle')}>
                    Cancelar
                  </button>
                  <button type="button" className="btn" onClick={() => go('limpeza')}>
                    Revisar itens
                  </button>
                  <button type="button" className="btn btn-primary btn-lg anim-hover" disabled={!found && !reports.some((r) => r.files > 0)} onClick={() => void clean()}>
                    <Icon name="broom" size={18} />
                    Limpar agora
                  </button>
                </div>
                <label className="row faint" style={{ fontSize: 12.5, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!confirmFirst} onChange={(e) => setSettings({ confirmBeforeClean: !e.target.checked })} />
                  Da próxima vez, limpar direto sem perguntar
                </label>
              </motion.div>
            ) : (
              <motion.div key="done" className="oneclick-under" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <div className="done-headline">
                  <AnimatedNumber
                    value={report?.freed ?? 0}
                    duration={1200}
                    render={(v) => {
                      const b = splitBytes(v);
                      return (
                        <>
                          <span className="done-num">{b.value}</span>
                          <span className="done-unit">{b.unit}</span>
                        </>
                      );
                    }}
                  />
                  <span className="muted">liberados</span>
                </div>
                <div className="done-stats">
                  <div>
                    <Icon name="trash" size={16} />
                    {plural(report?.deleted ?? 0, 'item removido', 'itens removidos')}
                  </div>
                  {trim ? (
                    <div>
                      <Icon name="memory" size={16} />
                      {trim.freedBytes > 0 ? `${formatBytes(trim.freedBytes)} de RAM liberados` : 'Memória otimizada'}
                    </div>
                  ) : null}
                  {scores.before !== null && scores.after !== null ? (
                    <div>
                      <Icon name="heart-pulse" size={16} />
                      Saúde
                      <ScoreChip score={scores.before} />
                      <Icon name="arrow-right" size={14} />
                      <ScoreChip score={scores.after} />
                    </div>
                  ) : null}
                  {report?.failed ? (
                    <div className="faint">
                      <Icon name="lock" size={15} />
                      {plural(report.failed, 'item em uso foi', 'itens em uso foram')} mantidos
                    </div>
                  ) : null}
                </div>
                <div className="row" style={{ gap: 10 }}>
                  <button type="button" className="btn" onClick={() => go('historico')}>
                    Ver histórico
                  </button>
                  <button type="button" className="btn btn-primary" onClick={() => setPhase('idle')}>
                    Concluir
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        <section className="card card-pad oneclick-steps">
          <div className="card-header">
            <Icon name="list" size={18} />
            <div className="card-title">O que será feito</div>
            <span className="badge">{PROFILES.find((p) => p.id === profile)?.label}</span>
          </div>
          <div className="steps">
            {planned.map((t, i) => {
              const st = stepState(t);
              const r = reportFor(t.id);
              const done = report?.targets.find((x) => x.id === t.id);
              return (
                <motion.div key={t.id} className={`step ${st}`} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
                  <span className="step-mark">{st === 'active' ? <Spinner size={14} /> : st === 'done' ? <Icon name="check" size={13} strokeWidth={2.6} /> : null}</span>
                  <Icon name={t.icon as IconName} size={16} className="faint" />
                  <span className="truncate" style={{ flex: 1 }}>
                    {t.name}
                  </span>
                  <span className="faint tabular" style={{ fontSize: 12 }}>
                    {done ? formatBytes(done.freed) : r ? formatBytes(r.bytes) : ''}
                  </span>
                </motion.div>
              );
            })}
            {trimAfter ? (
              <div className={`step ${phase === 'done' ? 'done' : 'pending'}`}>
                <span className="step-mark">{phase === 'done' ? <Icon name="check" size={13} strokeWidth={2.6} /> : null}</span>
                <Icon name="memory" size={16} className="faint" />
                <span style={{ flex: 1 }}>Liberar memória RAM ociosa</span>
              </div>
            ) : null}
          </div>
          <label className="row oneclick-opt">
            <input type="checkbox" checked={trimAfter} onChange={(e) => setSettings({ trimMemoryOnOneClick: e.target.checked })} />
            Liberar memória RAM ao final
          </label>
        </section>
      </div>
    </div>
  );
}

function ScoreChip({ score }: { score: number }) {
  const b = bandOf(score);
  return (
    <span className="score-chip" style={{ color: STATUS_COLOR[b.status] }}>
      <Icon name={STATUS_ICON[b.status]} size={13} />
      <strong style={{ color: 'var(--text)' }}>{score}%</strong>
      <span className="faint">{b.label}</span>
    </span>
  );
}
