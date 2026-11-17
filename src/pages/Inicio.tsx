import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Icon, type IconName } from '../components/Icon';
import { Logo } from '../components/Logo';
import { ScoreRing } from '../components/ScoreRing';
import { Meter } from '../components/ui/controls';
import { api, errorText } from '../lib/api';
import { formatBytes, formatLongDay, formatPercent, formatRelative, greeting, plural } from '../lib/format';
import { bandOf, STATUS_ICON } from '../lib/health-score';
import type { RecycleInfo } from '../lib/types';
import { confirm } from '../store/dialogs';
import { useHealth } from '../store/health';
import { SOURCE_LABEL, totalFreed, useHistory } from '../store/history';
import { go, type PageId } from '../store/nav';
import { usePlaces } from '../store/places';
import { toast } from '../store/toasts';
import { driveColor, driveLabel, driveUsage } from './explorer/NavPane';

const ACTIONS: { page: PageId; icon: IconName; title: string; text: string }[] = [
  { page: 'explorador', icon: 'folder-open', title: 'Explorar arquivos', text: 'Navegue, copie, mova e exclua como no Explorer.' },
  { page: 'organizador', icon: 'layers', title: 'Organizar pastas', text: 'Todos os arquivos de várias pastas em uma lista só.' },
  { page: 'limpeza', icon: 'broom', title: 'Limpeza', text: 'Temporários, caches, Lixeira e arquivos esquecidos.' },
  { page: 'duplicados', icon: 'copies', title: 'Duplicados', text: 'Encontre arquivos idênticos e libere espaço.' },
  { page: 'mapa', icon: 'treemap', title: 'Mapa de espaço', text: 'Descubra o que ocupa mais espaço no disco.' },
  { page: 'regras', icon: 'wand', title: 'Regras automáticas', text: 'Pastas que se organizam sozinhas.' },
];

const container = { animate: { transition: { staggerChildren: 0.045, delayChildren: 0.04 } } };
const item = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] as const } } };

export function Inicio() {
  const h = useHealth();
  const drives = usePlaces((s) => s.drives);
  const records = useHistory((s) => s.records);
  const [recycle, setRecycle] = useState<RecycleInfo | null>(null);
  const [emptying, setEmptying] = useState(false);

  useEffect(() => {
    void api.recycleInfo().then(setRecycle).catch(() => {});
    void useHealth.getState().loadExtras();
  }, []);

  const band = h.score !== null ? bandOf(h.score) : null;
  const system = drives.find((d) => d.isSystem) ?? drives[0];
  const sysUse = system ? driveUsage(system) : null;
  const junk = h.junk ? h.junk.recycleBytes + h.junk.tempBytes : null;
  const lastOneClick = records.find((r) => r.source === 'oneclick');

  const emptyBin = async () => {
    if (!recycle?.items) return;
    const ok = await confirm({
      title: 'Esvaziar a Lixeira?',
      text: `${plural(recycle.items, 'item', 'itens')} (${formatBytes(recycle.bytes)}) serão excluídos permanentemente.`,
      tone: 'danger',
      icon: 'trash-x',
      confirmLabel: 'Esvaziar',
    });
    if (!ok) return;
    setEmptying(true);
    try {
      const r = await api.emptyRecycleBin();
      useHistory.getState().add({ source: 'lixeira', freed: r.bytes, items: r.items, targets: [{ id: 'lixeira', name: 'Lixeira', freed: r.bytes }] });
      toast.good('Lixeira esvaziada', `${formatBytes(r.bytes)} liberados.`);
      setRecycle({ bytes: 0, items: 0 });
      void useHealth.getState().loadExtras(true);
    } catch (e) {
      toast.error('Não foi possível esvaziar', errorText(e));
    } finally {
      setEmptying(false);
    }
  };

  return (
    <div className="page-scroll">
      <motion.div variants={container} initial="initial" animate="animate">
        <motion.section variants={item} className="card home-hero">
          <div className="home-hero-glow" />
          <Logo size={72} animated twinkle />
          <div style={{ position: 'relative', minWidth: 0 }}>
            <div className="faint" style={{ fontWeight: 600 }}>
              {formatLongDay(Date.now())}
            </div>
            <h1 className="home-title">{greeting()}! Vamos deixar seu PC em ordem?</h1>
            <p className="muted" style={{ marginTop: 6, maxWidth: 560 }}>
              {junk !== null && junk > 512 * 1024 * 1024
                ? `Encontramos ${formatBytes(junk)} em arquivos desnecessários. Um clique resolve.`
                : 'Organize pastas, encontre o que ocupa espaço e limpe o que não serve mais. Tudo off-line.'}
            </p>
          </div>
          <div className="home-hero-cta">
            <button type="button" className="btn btn-primary btn-xl anim-hover" onClick={() => go('otimizar')}>
              <Icon name="bolt" size={20} />
              One Click Optimize
            </button>
            <div className="faint" style={{ fontSize: 12, textAlign: 'center', marginTop: 8 }}>
              {lastOneClick ? `Última: ${formatRelative(lastOneClick.at)} · ${formatBytes(lastOneClick.freed)}` : 'Analisa e limpa em segundos'}
            </div>
          </div>
        </motion.section>

        <div className="home-row">
          <motion.button variants={item} type="button" className="card card-pad card-hover anim-hover home-health" onClick={() => go('saude')}>
            <ScoreRing score={h.score} size={128} stroke={11} />
            <div style={{ minWidth: 0 }}>
              <div className="section-label">Saúde do PC</div>
              <div className="home-health-title">
                {band ? (
                  <>
                    <Icon name={STATUS_ICON[band.status]} size={18} />
                    {band.label}
                  </>
                ) : (
                  'Analisando…'
                )}
              </div>
              <div className="stack" style={{ gap: 6, marginTop: 8 }}>
                {h.metrics.slice(0, 3).map((m) => (
                  <div key={m.id} className="row" style={{ justifyContent: 'space-between', fontSize: 12.5 }}>
                    <span className="muted">{m.label}</span>
                    <span className="tabular">{Math.round(m.score)}</span>
                  </div>
                ))}
              </div>
              <span className="link-btn" style={{ marginTop: 8, display: 'inline-block' }}>
                Ver detalhes →
              </span>
            </div>
          </motion.button>

          <div className="home-tiles">
            <motion.div variants={item} className="card card-pad home-tile">
              <div className="row">
                <div className="icon-tile">
                  <Icon name="hard-drive" size={18} />
                </div>
                <div className="stack" style={{ gap: 0, minWidth: 0 }}>
                  <span className="stat-label truncate">{system ? `Livre em ${driveLabel(system)}` : 'Disco do sistema'}</span>
                  <span className="stat-value">{system ? formatBytes(system.free) : '—'}</span>
                </div>
              </div>
              {system && sysUse ? (
                <>
                  <Meter value={sysUse.fraction} color={driveColor(sysUse.status)} height={6} />
                  <span className="stat-sub">
                    {formatPercent(sysUse.fraction)} usado de {formatBytes(system.total)}
                  </span>
                </>
              ) : null}
            </motion.div>

            <motion.div variants={item} className="card card-pad home-tile">
              <div className="row">
                <div className="icon-tile">
                  <Icon name="trash" size={18} />
                </div>
                <div className="stack" style={{ gap: 0 }}>
                  <span className="stat-label">Lixeira</span>
                  <span className="stat-value">{recycle ? formatBytes(recycle.bytes) : '—'}</span>
                </div>
              </div>
              <span className="stat-sub">{recycle ? plural(recycle.items, 'item', 'itens') : ''}</span>
              <button type="button" className="btn btn-sm btn-danger-soft anim-hover" disabled={!recycle?.items || emptying} onClick={() => void emptyBin()}>
                <Icon name="trash-x" size={14} />
                {emptying ? 'Esvaziando…' : 'Esvaziar agora'}
              </button>
            </motion.div>

            <motion.div variants={item} className="card card-pad home-tile">
              <div className="row">
                <div className="icon-tile">
                  <Icon name="broom" size={18} />
                </div>
                <div className="stack" style={{ gap: 0 }}>
                  <span className="stat-label">Lixo encontrado</span>
                  <span className="stat-value">{junk !== null ? formatBytes(junk) : '—'}</span>
                </div>
              </div>
              <span className="stat-sub">Lixeira + temporários</span>
              <button type="button" className="btn btn-sm btn-soft anim-hover" onClick={() => go('limpeza')}>
                <Icon name="broom" size={14} />
                Ver limpeza
              </button>
            </motion.div>

            <motion.div variants={item} className="card card-pad home-tile">
              <div className="row">
                <div className="icon-tile" style={{ background: 'var(--success-soft)', color: 'var(--success-text)' }}>
                  <Icon name="sparkles" size={18} />
                </div>
                <div className="stack" style={{ gap: 0 }}>
                  <span className="stat-label">Já liberado</span>
                  <span className="stat-value">{formatBytes(totalFreed(records))}</span>
                </div>
              </div>
              <span className="stat-sub">{plural(records.length, 'limpeza', 'limpezas')} com o Organizador</span>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => go('historico')}>
                <Icon name="history" size={14} />
                Histórico
              </button>
            </motion.div>
          </div>
        </div>

        <motion.div variants={item} className="section-label" style={{ margin: '24px 0 12px' }}>
          Atalhos
        </motion.div>
        <div className="grid-3">
          {ACTIONS.map((a) => (
            <motion.button key={a.page} variants={item} type="button" className="card card-pad card-hover anim-hover home-action" onClick={() => go(a.page)}>
              <div className="icon-tile icon-tile-lg">
                <Icon name={a.icon} size={24} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="card-title">{a.title}</div>
                <div className="card-subtitle" style={{ marginTop: 3 }}>
                  {a.text}
                </div>
              </div>
              <Icon name="chevron-right" size={18} className="home-action-arrow" />
            </motion.button>
          ))}
        </div>

        <div className="home-bottom">
          <motion.section variants={item} className="card card-pad">
            <div className="card-header">
              <Icon name="hard-drive" size={18} />
              <div className="card-title">Unidades</div>
              <div className="spacer" />
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => go('mapa')}>
                Mapa de espaço
              </button>
            </div>
            <div className="stack" style={{ gap: 14 }}>
              {drives.map((d) => {
                const u = driveUsage(d);
                return (
                  <button key={d.mount} type="button" className="home-drive" onClick={() => go('explorador', { path: d.mount })}>
                    <Icon name={d.removable ? 'usb' : 'hard-drive'} size={18} className="faint" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="row" style={{ justifyContent: 'space-between', fontSize: 13 }}>
                        <span className="truncate" style={{ fontWeight: 600 }}>
                          {driveLabel(d)}
                        </span>
                        <span className="faint tabular">
                          {formatBytes(d.free)} livres
                        </span>
                      </div>
                      <div style={{ marginTop: 6 }}>
                        <Meter value={u.fraction} color={driveColor(u.status)} height={5} />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.section>

          <motion.section variants={item} className="card card-pad">
            <div className="card-header">
              <Icon name="history" size={18} />
              <div className="card-title">Atividade recente</div>
            </div>
            {records.length === 0 ? (
              <div className="faint" style={{ fontSize: 13 }}>
                Nada ainda. Que tal começar pelo One Click Optimize?
              </div>
            ) : (
              <div className="stack" style={{ gap: 4 }}>
                {records.slice(0, 5).map((r) => (
                  <div key={r.id} className="row recent-row">
                    <Icon name={r.source === 'oneclick' ? 'bolt' : r.source === 'lixeira' ? 'trash' : r.source === 'duplicados' ? 'copies' : 'broom'} size={15} className="text-accent" />
                    <span style={{ flex: 1 }}>{SOURCE_LABEL[r.source]}</span>
                    <span className="faint" style={{ fontSize: 12 }}>
                      {formatRelative(r.at)}
                    </span>
                    <strong className="tabular" style={{ fontSize: 12.5, width: 76, textAlign: 'right' }}>
                      {formatBytes(r.freed)}
                    </strong>
                  </div>
                ))}
              </div>
            )}
          </motion.section>
        </div>
      </motion.div>
    </div>
  );
}
