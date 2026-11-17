import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Icon } from '../../components/Icon';
import { PageHeader } from '../../components/layout/PageHeader';
import { EmptyState, Segmented, SearchInput, Spinner, Tabs, Toggle } from '../../components/ui/controls';
import { openDropdown } from '../../components/ui/Menu';
import { api, errorText } from '../../lib/api';
import { copyPathsAsText, revealPath } from '../../lib/fileops';
import { compareNames } from '../../lib/filters';
import { formatBytes, formatDay, plural } from '../../lib/format';
import { launchTool, relaunchAsAdmin } from '../../lib/systemActions';
import type { InstalledProgram, StartupItem } from '../../lib/types';
import { confirm } from '../../store/dialogs';
import { useHealth } from '../../store/health';
import { useNav } from '../../store/nav';
import { toast } from '../../store/toasts';

function StartupTab() {
  const [items, setItems] = useState<StartupItem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const elevated = useHealth((s) => s.snapshot?.system.elevated ?? false);

  const load = useCallback(async () => {
    setItems(await api.startupList().catch(() => []));
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (it: StartupItem, enabled: boolean) => {
    setBusy(it.id);
    try {
      await api.startupSetEnabled(it.id, enabled);
      setItems((list) => list?.map((x) => (x.id === it.id ? { ...x, enabled } : x)) ?? null);
      toast.good(enabled ? `“${it.name}” vai iniciar com o Windows` : `“${it.name}” não vai mais iniciar com o Windows`, 'A mudança vale a partir da próxima inicialização.');
      void useHealth.getState().loadExtras();
    } catch (e) {
      toast.error('Não foi possível alterar', errorText(e), );
    } finally {
      setBusy(null);
    }
  };

  const enabled = items?.filter((i) => i.enabled).length ?? 0;

  return (
    <>
      <section className="card card-pad startup-hero">
        <div className="icon-tile icon-tile-lg anim-hover">
          <Icon name="rocket" size={24} />
        </div>
        <div style={{ flex: 1 }}>
          <div className="card-title">
            {items ? `${plural(enabled, 'programa ativo', 'programas ativos')} de ${items.length}` : 'Carregando…'}
          </div>
          <div className="card-subtitle">
            Cada programa que inicia junto com o Windows deixa o computador mais lento para ligar. Desative os que você não precisa logo de cara — eles continuam
            instalados e funcionam normalmente quando abertos.
          </div>
        </div>
        <button type="button" className="btn btn-sm" onClick={() => void launchTool('startup-apps')}>
          <Icon name="external-link" size={14} />
          Configurações do Windows
        </button>
      </section>
      {!elevated && items?.some((i) => i.needsAdmin) ? (
        <div className="callout info">
          <Icon name="shield" size={18} />
          <div style={{ flex: 1 }}>Itens marcados com cadeado valem para todos os usuários e só podem ser alterados com o Organizador como administrador.</div>
          <button type="button" className="btn btn-sm" onClick={() => void relaunchAsAdmin()}>
            Abrir como administrador
          </button>
        </div>
      ) : null}
      <div className="card startup-list">
        {items === null ? (
          <div className="ct-items-loading" style={{ padding: 20 }}>
            <Spinner size={15} /> Lendo os programas de inicialização…
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon="rocket" title="Nenhum programa inicia com o Windows" text="Ótimo! A inicialização está o mais leve possível." />
        ) : (
          items.map((it, i) => (
            <motion.div key={it.id} className={`startup-row ${it.enabled ? '' : 'off'}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 15) * 0.02 }}>
              <div className="startup-app">
                <Icon name="app-window" size={20} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row" style={{ gap: 8 }}>
                  <span className="truncate" style={{ fontWeight: 650 }}>
                    {it.name}
                  </span>
                  {it.needsAdmin ? (
                    <span className="badge" data-tip="Vale para todos os usuários">
                      <Icon name="lock" size={11} />
                      Todos os usuários
                    </span>
                  ) : null}
                  {!it.exists ? (
                    <span className="badge badge-warning" data-tip="O programa apontado não existe mais">
                      <Icon name="alert-triangle" size={11} />
                      Não encontrado
                    </span>
                  ) : null}
                </div>
                <div className="faint truncate" style={{ fontSize: 12 }}>
                  {[it.publisher, it.description !== it.name ? it.description : null, it.location].filter(Boolean).join(' · ')}
                </div>
                <div className="startup-cmd truncate mono" data-tip={it.command}>
                  {it.command}
                </div>
              </div>
              <span className={`badge ${it.enabled ? 'badge-good' : ''}`}>{it.enabled ? 'Ativado' : 'Desativado'}</span>
              {busy === it.id ? <Spinner size={16} /> : <Toggle checked={it.enabled} onChange={(v) => void toggle(it, v)} label={`Iniciar ${it.name} com o Windows`} />}
              <button
                type="button"
                className="icon-btn"
                aria-label="Mais opções"
                onClick={(e) =>
                  openDropdown(
                    e.currentTarget,
                    [
                      { label: 'Abrir o local do arquivo', icon: 'folder-search', disabled: !it.path || !it.exists, onSelect: () => it.path && void revealPath(it.path) },
                      { label: 'Copiar o comando', icon: 'link', onSelect: () => void copyPathsAsText([it.command]) },
                    ],
                    'right',
                  )
                }
              >
                <Icon name="more-v" size={16} />
              </button>
            </motion.div>
          ))
        )}
      </div>
    </>
  );
}

function ProgramsTab() {
  const [list, setList] = useState<InstalledProgram[] | null>(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'nome' | 'tamanho' | 'data'>('tamanho');

  const load = useCallback(async () => setList(await api.programsList().catch(() => [])), []);
  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const t = q.trim().toLowerCase();
    const f = (list ?? []).filter((p) => !t || p.name.toLowerCase().includes(t) || (p.publisher ?? '').toLowerCase().includes(t));
    return f.sort((a, b) =>
      sort === 'nome' ? compareNames(a.name, b.name) : sort === 'tamanho' ? (b.size ?? 0) - (a.size ?? 0) : (b.installDate ?? '').localeCompare(a.installDate ?? ''),
    );
  }, [list, q, sort]);

  const total = (list ?? []).reduce((s, p) => s + (p.size ?? 0), 0);
  const maxSize = Math.max(1, ...visible.map((p) => p.size ?? 0));

  const uninstall = async (p: InstalledProgram) => {
    const ok = await confirm({
      title: `Desinstalar “${p.name}”?`,
      text: 'O desinstalador do próprio programa será aberto para concluir a remoção. Siga as instruções dele.',
      tone: 'danger',
      icon: 'package',
      confirmLabel: 'Abrir desinstalador',
    });
    if (!ok) return;
    try {
      await api.programUninstall(p.id);
      toast.info('Desinstalador aberto', `Conclua a remoção de “${p.name}” na janela que apareceu. Depois clique em Atualizar.`);
      window.setTimeout(() => void load(), 4000);
    } catch (e) {
      toast.error('Não foi possível desinstalar', errorText(e));
    }
  };

  return (
    <>
      <div className="row" style={{ gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <SearchInput value={q} onChange={setQ} placeholder="Procurar programa ou fabricante" width={300} />
        <Segmented
          size="sm"
          value={sort}
          onChange={setSort}
          options={[
            { value: 'tamanho', label: 'Maiores' },
            { value: 'nome', label: 'Nome' },
            { value: 'data', label: 'Mais recentes' },
          ]}
        />
        <div className="spacer" />
        <span className="faint" style={{ fontSize: 12.5 }}>
          {list ? `${plural(list.length, 'programa', 'programas')} · ${formatBytes(total)} informados` : ''}
        </span>
        <button type="button" className="icon-btn" onClick={() => void load()} data-tip="Atualizar">
          <Icon name="refresh" size={16} />
        </button>
        <button type="button" className="btn btn-sm" onClick={() => void launchTool('apps')}>
          <Icon name="external-link" size={14} />
          Aplicativos do Windows
        </button>
      </div>
      <div className="card programs-list">
        {list === null ? (
          <div className="ct-items-loading" style={{ padding: 20 }}>
            <Spinner size={15} /> Lendo os programas instalados…
          </div>
        ) : visible.length === 0 ? (
          <EmptyState icon="package" title="Nenhum programa encontrado" text={q ? `Nada com “${q}”.` : 'Não foi possível listar os programas.'} />
        ) : (
          visible.map((p) => (
            <div key={p.id} className="program-row">
              <div className="startup-app">
                <Icon name="package" size={19} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="truncate" style={{ fontWeight: 650 }}>
                  {p.name}
                </div>
                <div className="faint truncate" style={{ fontSize: 12 }}>
                  {[p.publisher, p.version ? `versão ${p.version}` : null, p.installDate ? `instalado em ${formatDay(new Date(`${p.installDate}T12:00:00`).getTime())}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
              <div className="program-size">
                {p.size ? (
                  <>
                    <span className="tabular">{formatBytes(p.size)}</span>
                    <div className="ml-track" style={{ width: 120 }}>
                      <div className="ml-fill" style={{ width: `${((p.size ?? 0) / maxSize) * 100}%`, background: 'var(--series-1)' }} />
                    </div>
                  </>
                ) : (
                  <span className="faint">—</span>
                )}
              </div>
              <button type="button" className="btn btn-sm btn-ghost" disabled={!p.canUninstall} onClick={() => void uninstall(p)}>
                Desinstalar
              </button>
            </div>
          ))
        )}
      </div>
    </>
  );
}

export function Startup() {
  const params = useNav((s) => s.params);
  const [tab, setTab] = useState<'inicializacao' | 'programas'>(params.tab === 'programas' ? 'programas' : 'inicializacao');
  return (
    <div className="page-scroll">
      <PageHeader icon="rocket" title="Inicialização e apps" subtitle="Deixe o Windows ligar mais rápido e remova programas que você não usa." />
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'inicializacao', label: 'Inicialização', icon: 'rocket' },
          { value: 'programas', label: 'Programas instalados', icon: 'package' },
        ]}
      />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
          {tab === 'inicializacao' ? <StartupTab /> : <ProgramsTab />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
