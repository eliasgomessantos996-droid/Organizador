import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Icon, type IconName } from '../../components/Icon';
import { AnimatedNumber, Checkbox, Spinner } from '../../components/ui/controls';
import { api } from '../../lib/api';
import { GROUPS, PROFILE_TARGETS, SAFE_TARGETS } from '../../lib/cleanup';
import { formatBytes, formatDate, formatNumber, formatRelative, plural, splitBytes } from '../../lib/format';
import { relaunchAsAdmin } from '../../lib/systemActions';
import type { CleanItem } from '../../lib/types';
import { useCleanup } from '../../store/cleanup';
import { useHealth } from '../../store/health';
import { confirm } from '../../store/dialogs';

function TargetItems({ id }: { id: string }) {
  const [items, setItems] = useState<CleanItem[] | null>(null);
  useEffect(() => {
    void api.cleanupItems(id, 60).then(setItems);
  }, [id]);
  if (!items) return <div className="ct-items-loading"><Spinner size={14} /> Carregando itens…</div>;
  if (!items.length) return <div className="ct-items-loading faint">Nenhum item para mostrar.</div>;
  return (
    <div className="ct-items selectable">
      {items.map((it) => (
        <div key={it.path} className="ct-item">
          <span className="truncate mono" data-tip={it.path}>
            {it.path}
          </span>
          <span className="faint tabular">{it.isDir ? 'pasta' : formatBytes(it.size)}</span>
          <span className="faint tabular">{it.modified ? formatDate(it.modified) : ''}</span>
        </div>
      ))}
      {items.length >= 60 ? <div className="faint" style={{ padding: '6px 4px' }}>Mostrando os 60 maiores.</div> : null}
    </div>
  );
}

/** Limpeza do sistema: alvos agrupados com prévia antes de apagar. */
export function SystemCleanup() {
  const c = useCleanup();
  const elevated = useHealth((s) => s.snapshot?.system.elevated ?? false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    const st = useCleanup.getState();
    if (!st.analyzedAt && !st.analyzing) void st.analyze();
    else void st.load();
  }, []);

  const totals = useMemo(() => {
    let bytes = 0;
    let files = 0;
    for (const id of c.selected) {
      const r = c.reports[id];
      if (r) {
        bytes += r.bytes;
        files += r.files;
      }
    }
    return { bytes, files };
  }, [c.selected, c.reports]);

  const allFound = Object.values(c.reports).reduce((s, r) => s + r.bytes, 0);
  const needsAdmin = c.targets.some((t) => t.needsAdmin && c.selected.has(t.id) && (c.reports[t.id]?.denied ?? 0) > 0);

  const doClean = async () => {
    const moderate = c.targets.filter((t) => t.risk === 'moderado' && c.selected.has(t.id) && (c.reports[t.id]?.files ?? 0) > 0);
    if (moderate.length) {
      const ok = await confirm({
        title: `Limpar ${formatBytes(totals.bytes)}?`,
        text: 'Estes itens incluem coisas que você pode querer revisar antes:',
        details: moderate.map((t) => `${t.name}${t.toTrash ? ' (vão para a Lixeira)' : ''}`),
        tone: 'warning',
        icon: 'broom',
        confirmLabel: 'Limpar agora',
      });
      if (!ok) return;
    }
    await c.clean();
  };

  return (
    <div className="cleanup">
      <section className="card cleanup-hero">
        <div className="cleanup-hero-art anim-hover">
          <Icon name="broom" size={34} className={c.analyzing || c.cleaning ? 'playing' : undefined} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="section-label">{c.analyzing ? 'Analisando…' : 'Selecionado para limpar'}</div>
          <div className="cleanup-total">
            {c.analyzing && !c.analyzedAt ? (
              <span className="cleanup-total-num">—</span>
            ) : (
              <AnimatedNumber
                value={totals.bytes}
                render={(v) => {
                  const b = splitBytes(v);
                  return (
                    <>
                      <span className="cleanup-total-num">{b.value}</span>
                      <span className="cleanup-total-unit">{b.unit}</span>
                    </>
                  );
                }}
              />
            )}
          </div>
          <div className="muted">
            {plural(totals.files, 'item', 'itens')} em {plural(c.targets.filter((t) => c.selected.has(t.id) && (c.reports[t.id]?.files ?? 0) > 0).length, 'categoria', 'categorias')} · {formatBytes(allFound)} encontrados no total
            {c.analyzedAt ? <span className="faint"> · análise {formatRelative(c.analyzedAt)}</span> : null}
          </div>
        </div>
        <div className="cleanup-hero-actions">
          <button type="button" className="btn" onClick={() => void c.analyze()} disabled={c.analyzing || c.cleaning}>
            <Icon name="refresh" size={15} className={c.analyzing ? 'spin' : undefined} />
            Analisar de novo
          </button>
          <button type="button" className="btn btn-primary btn-lg anim-hover" disabled={!totals.bytes && !totals.files ? true : c.analyzing || c.cleaning} onClick={() => void doClean()}>
            <Icon name="broom" size={18} />
            {c.cleaning ? 'Limpando…' : 'Limpar agora'}
          </button>
        </div>
      </section>

      <div className="row" style={{ margin: '16px 0 4px', gap: 8, flexWrap: 'wrap' }}>
        <span className="faint" style={{ fontSize: 12.5 }}>
          Selecionar:
        </span>
        <button type="button" className="chip" onClick={() => c.setSelected(SAFE_TARGETS)}>
          Só itens seguros
        </button>
        <button type="button" className="chip" onClick={() => c.setSelected(PROFILE_TARGETS.equilibrado)}>
          Recomendado
        </button>
        <button type="button" className="chip" onClick={() => c.setSelected(c.targets.map((t) => t.id))}>
          Tudo
        </button>
        <button type="button" className="chip" onClick={() => c.setSelected([])}>
          Nada
        </button>
      </div>

      <AnimatePresence>
        {needsAdmin && !elevated ? (
          <motion.div className="callout warning" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <Icon name="shield" size={18} />
            <div style={{ flex: 1 }}>
              <strong>Alguns itens do sistema exigem administrador.</strong> Sem essa permissão, eles serão limpos só em parte.
            </div>
            <button type="button" className="btn btn-sm" onClick={() => void relaunchAsAdmin()}>
              Reiniciar como administrador
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {GROUPS.map((g) => {
        const list = c.targets.filter((t) => t.group === g.id && t.available);
        if (!list.length) return null;
        const groupBytes = list.reduce((s, t) => s + (c.reports[t.id]?.bytes ?? 0), 0);
        return (
          <section key={g.id} className="ct-group">
            <div className="ct-group-head">
              <Icon name={g.icon} size={16} />
              <span>{g.label}</span>
              <span className="faint tabular">{c.analyzedAt ? formatBytes(groupBytes) : ''}</span>
            </div>
            <div className="card">
              {list.map((t, i) => {
                const r = c.reports[t.id];
                const on = c.selected.has(t.id);
                const open = expanded === t.id;
                return (
                  <div key={t.id} className={`ct-row ${on ? 'on' : ''} ${i ? 'sep' : ''}`}>
                    <div className="ct-main anim-hover" onClick={() => c.toggle(t.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === ' ' && c.toggle(t.id)}>
                      <Checkbox checked={on} onChange={() => c.toggle(t.id)} label={t.name} />
                      <div className="ct-icon">
                        <Icon name={t.icon as IconName} size={18} />
                      </div>
                      <div className="ct-text">
                        <div className="row" style={{ gap: 6 }}>
                          <span className="ct-name">{t.name}</span>
                          {t.risk === 'moderado' ? (
                            <span className="badge badge-warning">
                              <Icon name="alert-triangle" size={11} />
                              Revise
                            </span>
                          ) : (
                            <span className="badge badge-good">
                              <Icon name="shield-check" size={11} />
                              Seguro
                            </span>
                          )}
                          {t.needsAdmin ? (
                            <span className="badge" data-tip="Precisa do Organizador como administrador para limpar tudo">
                              <Icon name="shield" size={11} />
                              Admin
                            </span>
                          ) : null}
                          {t.toTrash ? <span className="badge badge-info">Vai para a Lixeira</span> : null}
                        </div>
                        <div className="ct-desc">{t.description}</div>
                      </div>
                      <div className="ct-size">
                        {c.analyzing && !r ? (
                          <span className="skeleton" style={{ width: 70, height: 14, display: 'inline-block' }} />
                        ) : r ? (
                          <>
                            <strong className="tabular">{formatBytes(r.bytes)}</strong>
                            <span className="faint">{t.id === 'pastas-vazias' ? plural(r.files, 'pasta', 'pastas') : plural(r.files, 'item', 'itens')}</span>
                          </>
                        ) : (
                          <span className="faint">—</span>
                        )}
                      </div>
                      <button
                        type="button"
                        className={`icon-btn ct-expand ${open ? 'open' : ''}`}
                        disabled={!r || r.files === 0 || t.id === 'lixeira'}
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpanded(open ? null : t.id);
                        }}
                        data-tip="Ver itens"
                        aria-label={`Ver itens de ${t.name}`}
                      >
                        <Icon name="chevron-down" size={16} />
                      </button>
                    </div>
                    <AnimatePresence initial={false}>
                      {open ? (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
                          <TargetItems id={t.id} />
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
      {c.targets.length ? (
        <p className="faint" style={{ fontSize: 12, marginTop: 14 }}>
          Arquivos em uso por outros programas são ignorados com segurança. Itens marcados como “Vai para a Lixeira” podem ser restaurados. {formatNumber(c.targets.length)} categorias verificadas.
        </p>
      ) : null}
    </div>
  );
}
