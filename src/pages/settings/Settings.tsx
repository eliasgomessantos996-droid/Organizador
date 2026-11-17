import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Icon } from '../../components/Icon';
import { Logo } from '../../components/Logo';
import { PageHeader } from '../../components/layout/PageHeader';
import { Checkbox, Segmented, Tabs, Toggle } from '../../components/ui/controls';
import { api, errorText } from '../../lib/api';
import { cleanOptions, GROUPS, PROFILES, PROFILE_TARGETS } from '../../lib/cleanup';
import { pickFolder, pickSaveFile } from '../../lib/fileops';
import { formatRelative } from '../../lib/format';
import { isTauri, modKey } from '../../lib/platform';
import { relaunchAsAdmin } from '../../lib/systemActions';
import { THEMES, type ThemeId } from '../../lib/theme';
import type { AppInfo, TargetInfo } from '../../lib/types';
import { confirm } from '../../store/dialogs';
import { useHealth } from '../../store/health';
import { useNav } from '../../store/nav';
import { useRules } from '../../store/rules';
import { DEFAULT_SETTINGS, useSettings, type Settings as SettingsData } from '../../store/settings';
import { toast } from '../../store/toasts';

type Tab = 'aparencia' | 'explorador' | 'limpeza' | 'protecao' | 'sistema' | 'sobre';

function Row({ title, text, children }: { title: string; text?: ReactNode; children: ReactNode }) {
  return (
    <div className="set-row">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="set-title">{title}</div>
        {text ? <div className="set-text">{text}</div> : null}
      </div>
      <div className="set-control">{children}</div>
    </div>
  );
}

function ThemeCard({ id, active, onPick }: { id: ThemeId; active: boolean; onPick: () => void }) {
  const t = THEMES.find((x) => x.id === id)!;
  const p = t.preview;
  return (
    <button type="button" className={`theme-card ${active ? 'active' : ''}`} onClick={onPick} aria-pressed={active}>
      <div className="theme-preview" style={{ background: p.bg }}>
        {id === 'sistema' ? <div className="theme-split" style={{ background: '#07090f' }} /> : null}
        <div className="tp-side" style={{ background: p.bg }}>
          <span style={{ background: p.accent, opacity: 0.9 }} />
          <span style={{ background: p.text, opacity: 0.25 }} />
          <span style={{ background: p.text, opacity: 0.25 }} />
        </div>
        <div className="tp-main" style={{ background: id === 'sistema' ? 'linear-gradient(90deg,#ffffff 50%,#141b28 50%)' : p.surface }}>
          <span className="tp-line" style={{ background: id === 'sistema' ? '#7c8597' : p.text, opacity: 0.55 }} />
          <span className="tp-line short" style={{ background: id === 'sistema' ? '#7c8597' : p.text, opacity: 0.3 }} />
          <span className="tp-pill" style={{ background: `linear-gradient(135deg, ${p.accent}, ${p.accent2})` }} />
        </div>
        {active ? (
          <motion.span layoutId="theme-check" className="theme-check">
            <Icon name="check" size={13} strokeWidth={3} />
          </motion.span>
        ) : null}
      </div>
      <div className="theme-name">{t.name}</div>
      <div className="theme-desc">{t.description}</div>
    </button>
  );
}

export function Settings() {
  const s = useSettings();
  const set = s.set;
  const params = useNav((x) => x.params);
  const [tab, setTab] = useState<Tab>((params.tab as Tab) ?? 'aparencia');
  const [targets, setTargets] = useState<TargetInfo[]>([]);
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const elevated = useHealth((h) => h.snapshot?.system.elevated ?? false);

  useEffect(() => {
    void api.cleanupTargets(cleanOptions()).then(setTargets).catch(() => {});
    void api.selfAutostartGet().then(setAutostart).catch(() => setAutostart(false));
    void api.appInfo().then(setInfo).catch(() => {});
  }, []);

  const custom = s.customTargets.length ? s.customTargets : PROFILE_TARGETS.equilibrado;
  const toggleCustom = (id: string) => set({ customTargets: custom.includes(id) ? custom.filter((x) => x !== id) : [...custom, id] });

  const exportSettings = async () => {
    const path = await pickSaveFile('Exportar configurações', 'organizador-configuracoes.json', 'json', 'Configurações');
    if (!path) return;
    const { set: _a, toggleFavorite: _b, reset: _c, ...data } = useSettings.getState();
    const payload = JSON.stringify({ app: 'Organizador', version: 1, settings: data, rules: useRules.getState().rules }, null, 2);
    try {
      await api.saveTextFile(path, payload);
      toast.good('Configurações exportadas', path);
    } catch (e) {
      toast.error('Não foi possível exportar', errorText(e));
    }
  };

  const importSettings = async () => {
    if (!isTauri) {
      toast.info('Disponível no aplicativo instalado');
      return;
    }
    const { open } = await import('@tauri-apps/plugin-dialog');
    const path = await open({ multiple: false, filters: [{ name: 'Configurações', extensions: ['json'] }] });
    if (typeof path !== 'string') return;
    try {
      const data = JSON.parse(await api.readTextFile(path));
      if (data?.app !== 'Organizador' || !data.settings) throw new Error('Este arquivo não é uma exportação do Organizador.');
      const known = Object.keys(DEFAULT_SETTINGS) as (keyof SettingsData)[];
      const patch = Object.fromEntries(Object.entries(data.settings).filter(([k]) => known.includes(k as keyof SettingsData)));
      set(patch as Partial<SettingsData>);
      if (Array.isArray(data.rules)) useRules.setState({ rules: data.rules });
      toast.good('Configurações importadas');
    } catch (e) {
      toast.error('Não foi possível importar', errorText(e));
    }
  };

  return (
    <div className="page-scroll">
      <PageHeader icon="settings" title="Configurações" subtitle="Deixe o Organizador do seu jeito." />
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'aparencia', label: 'Aparência', icon: 'palette' },
          { value: 'explorador', label: 'Explorador', icon: 'folder-open' },
          { value: 'limpeza', label: 'Limpeza', icon: 'broom' },
          { value: 'protecao', label: 'Proteção', icon: 'shield' },
          { value: 'sistema', label: 'Sistema', icon: 'monitor' },
          { value: 'sobre', label: 'Sobre', icon: 'info' },
        ]}
      />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="settings-body">
          {tab === 'aparencia' ? (
            <>
              <section className="card card-pad">
                <div className="card-title" style={{ marginBottom: 14 }}>
                  Tema
                </div>
                <div className="theme-grid">
                  {THEMES.map((t) => (
                    <ThemeCard key={t.id} id={t.id} active={s.theme === t.id} onPick={() => set({ theme: t.id })} />
                  ))}
                </div>
              </section>
              <section className="card set-card">
                <Row title="Animações" text="Movimento das telas, ícones e gráficos. “Automático” segue a acessibilidade do Windows.">
                  <Segmented
                    size="sm"
                    value={s.motion}
                    onChange={(v) => set({ motion: v })}
                    options={[
                      { value: 'auto', label: 'Automático' },
                      { value: 'completa', label: 'Completas' },
                      { value: 'reduzida', label: 'Reduzidas' },
                      { value: 'desligada', label: 'Desligadas' },
                    ]}
                  />
                </Row>
                <Row title="Densidade das listas" text="Compacta mostra mais arquivos por vez.">
                  <Segmented
                    size="sm"
                    value={s.density}
                    onChange={(v) => set({ density: v })}
                    options={[
                      { value: 'confortavel', label: 'Confortável' },
                      { value: 'compacta', label: 'Compacta' },
                    ]}
                  />
                </Row>
                <Row title="Menu lateral recolhido" text="Mostra só os ícones para ganhar espaço.">
                  <Toggle checked={s.sidebarCollapsed} onChange={(v) => set({ sidebarCollapsed: v })} />
                </Row>
              </section>
            </>
          ) : null}

          {tab === 'explorador' ? (
            <section className="card set-card">
              <Row title="Abrir o Explorador em">
                <Segmented
                  size="sm"
                  value={s.explorerStart}
                  onChange={(v) => set({ explorerStart: v })}
                  options={[
                    { value: 'computador', label: 'Este computador' },
                    { value: 'downloads', label: 'Downloads' },
                    { value: 'ultima', label: 'Última pasta' },
                  ]}
                />
              </Row>
              <Row title="Mostrar itens ocultos" text="Arquivos e pastas marcados como ocultos ou de sistema.">
                <Toggle checked={s.showHidden} onChange={(v) => set({ showHidden: v })} />
              </Row>
              <Row title="Mostrar extensões dos arquivos" text="Exibe “.pdf”, “.jpg”… no fim dos nomes.">
                <Toggle checked={s.showExtensions} onChange={(v) => set({ showExtensions: v })} />
              </Row>
              <Row title="Pastas sempre no topo">
                <Toggle checked={s.foldersFirst} onChange={(v) => set({ foldersFirst: v })} />
              </Row>
              <Row title="Miniaturas de imagens" text="Mostra a própria foto nos ícones grandes e no painel de detalhes.">
                <Toggle checked={s.thumbnails} onChange={(v) => set({ thumbnails: v })} />
              </Row>
              <Row title="Tecla Delete envia para a Lixeira" text="Desligado, Delete exclui permanentemente (Shift+Delete sempre exclui permanentemente).">
                <Toggle checked={s.deleteToTrash} onChange={(v) => set({ deleteToTrash: v })} />
              </Row>
              <Row title="Pedir confirmação antes de excluir">
                <Toggle checked={s.confirmDelete} onChange={(v) => set({ confirmDelete: v })} />
              </Row>
            </section>
          ) : null}

          {tab === 'limpeza' ? (
            <>
              <section className="card set-card">
                <Row title="Perfil do One Click Optimize">
                  <Segmented size="sm" value={s.oneClickProfile} onChange={(v) => set({ oneClickProfile: v })} options={PROFILES.map((p) => ({ value: p.id, label: p.label }))} />
                </Row>
                <Row title="Mostrar o que foi encontrado antes de limpar" text="Desligado, o One Click limpa direto após a análise.">
                  <Toggle checked={s.confirmBeforeClean} onChange={(v) => set({ confirmBeforeClean: v })} />
                </Row>
                <Row title="Liberar memória RAM ao final do One Click">
                  <Toggle checked={s.trimMemoryOnOneClick} onChange={(v) => set({ trimMemoryOnOneClick: v })} />
                </Row>
                <Row title="Limpeza automática" text={s.lastAutoClean ? `Última execução ${formatRelative(s.lastAutoClean)}. Nunca apaga arquivos pessoais.` : 'Roda ao abrir o Organizador. Nunca apaga arquivos pessoais.'}>
                  <Segmented
                    size="sm"
                    value={s.autoClean}
                    onChange={(v) => set({ autoClean: v })}
                    options={[
                      { value: 'desligada', label: 'Desligada' },
                      { value: 'diaria', label: 'Diária' },
                      { value: 'semanal', label: 'Semanal' },
                      { value: 'mensal', label: 'Mensal' },
                    ]}
                  />
                </Row>
                <Row title="Temporários: idade mínima" text="Arquivos temporários mais novos que isso são mantidos (podem estar em uso por instalações).">
                  <Segmented
                    size="sm"
                    value={String(s.tempMinAgeHours)}
                    onChange={(v) => set({ tempMinAgeHours: Number(v) })}
                    options={[
                      { value: '0', label: 'Todos' },
                      { value: '24', label: '1 dia' },
                      { value: '72', label: '3 dias' },
                      { value: '168', label: '7 dias' },
                    ]}
                  />
                </Row>
                <Row title="Downloads esquecidos" text="Sem uso há mais de…">
                  <Segmented
                    size="sm"
                    value={String(s.oldDownloadsDays)}
                    onChange={(v) => set({ oldDownloadsDays: Number(v) })}
                    options={[
                      { value: '30', label: '30 dias' },
                      { value: '90', label: '3 meses' },
                      { value: '180', label: '6 meses' },
                      { value: '365', label: '1 ano' },
                    ]}
                  />
                </Row>
              </section>
              <section className="card card-pad">
                <div className="card-title">Itens do perfil Personalizado</div>
                <p className="card-subtitle" style={{ margin: '4px 0 14px' }}>
                  Escolha o que o One Click limpa quando o perfil “Personalizado” está selecionado.
                </p>
                {GROUPS.map((g) => {
                  const list = targets.filter((t) => t.group === g.id);
                  if (!list.length) return null;
                  return (
                    <div key={g.id} className="custom-group">
                      <div className="section-label">{g.label}</div>
                      <div className="custom-grid">
                        {list.map((t) => (
                          <label key={t.id} className="custom-item">
                            <Checkbox checked={custom.includes(t.id)} onChange={() => toggleCustom(t.id)} label={t.name} />
                            <span>{t.name}</span>
                            {t.risk === 'moderado' ? <span className="badge badge-warning">Revise</span> : null}
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </section>
            </>
          ) : null}

          {tab === 'protecao' ? (
            <>
              <section className="card card-pad">
                <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
                  <div className="icon-tile icon-tile-lg">
                    <Icon name="shield-check" size={24} className="draw" />
                  </div>
                  <div>
                    <div className="card-title">Proteção sempre ativa</div>
                    <p className="card-subtitle" style={{ marginTop: 4 }}>
                      O Organizador nunca exclui, move ou renomeia a pasta do Windows, as raízes das unidades (C:\, D:\…), Arquivos de Programas, a pasta de usuários e as
                      suas pastas pessoais principais. Exclusões vão para a Lixeira por padrão e toda limpeza mostra uma prévia.
                    </p>
                  </div>
                </div>
              </section>
              <section className="card card-pad">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div>
                    <div className="card-title">Pastas protegidas</div>
                    <p className="card-subtitle">Nada dentro delas é apagado, movido ou limpo — nem pelo One Click, regras ou limpeza automática.</p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={async () => {
                      const f = await pickFolder('Pasta para proteger');
                      if (f && !s.protectedPaths.includes(f)) set({ protectedPaths: [...s.protectedPaths, f] });
                    }}
                  >
                    <Icon name="plus" size={14} />
                    Proteger pasta
                  </button>
                </div>
                <div className="protected-list">
                  {s.protectedPaths.length === 0 ? (
                    <div className="faint" style={{ fontSize: 13, padding: '10px 2px' }}>
                      Nenhuma pasta adicionada. Dica: proteja a pasta de fotos da família ou de trabalhos importantes.
                    </div>
                  ) : (
                    s.protectedPaths.map((p) => (
                      <div key={p} className="protected-item">
                        <Icon name="lock" size={15} className="text-accent" />
                        <span className="truncate mono" style={{ flex: 1 }}>
                          {p}
                        </span>
                        <button type="button" className="icon-btn icon-btn-sm" onClick={() => set({ protectedPaths: s.protectedPaths.filter((x) => x !== p) })} aria-label={`Remover ${p}`}>
                          <Icon name="x" size={14} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </>
          ) : null}

          {tab === 'sistema' ? (
            <section className="card set-card">
              <Row title="Iniciar com o Windows" text="Abre o Organizador ao ligar o computador (útil com a limpeza automática).">
                <Toggle
                  checked={!!autostart}
                  disabled={autostart === null || !isTauri}
                  onChange={async (v) => {
                    try {
                      await api.selfAutostartSet(v);
                      setAutostart(v);
                    } catch (e) {
                      toast.error('Não foi possível alterar', errorText(e));
                    }
                  }}
                />
              </Row>
              <Row title="Permissão de administrador" text={elevated ? 'O Organizador está rodando como administrador.' : 'Necessária para limpar pastas do sistema e alterar itens de todos os usuários.'}>
                {elevated ? (
                  <span className="badge badge-good">
                    <Icon name="shield-check" size={12} />
                    Ativa
                  </span>
                ) : (
                  <button type="button" className="btn btn-sm" onClick={() => void relaunchAsAdmin()}>
                    <Icon name="shield" size={14} />
                    Reiniciar como administrador
                  </button>
                )}
              </Row>
              <Row title="Aplicar regras automáticas ao abrir" text="As regras ativas organizam as pastas sozinhas ao iniciar o app.">
                <Toggle checked={s.runRulesOnStart} onChange={(v) => set({ runRulesOnStart: v })} />
              </Row>
              <Row title="Backup das configurações" text="Exporte suas preferências e regras para usar em outro computador.">
                <div className="row" style={{ gap: 6 }}>
                  <button type="button" className="btn btn-sm" onClick={() => void exportSettings()}>
                    <Icon name="upload" size={14} />
                    Exportar
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => void importSettings()}>
                    <Icon name="import" size={14} />
                    Importar
                  </button>
                </div>
              </Row>
              <Row title="Redefinir configurações" text="Volta tudo ao padrão (regras e histórico são mantidos).">
                <button
                  type="button"
                  className="btn btn-sm btn-danger-soft"
                  onClick={async () => {
                    if (await confirm({ title: 'Redefinir todas as configurações?', tone: 'warning', confirmLabel: 'Redefinir' })) {
                      s.reset();
                      toast.good('Configurações redefinidas');
                    }
                  }}
                >
                  Redefinir
                </button>
              </Row>
            </section>
          ) : null}

          {tab === 'sobre' ? (
            <>
              <section className="card about">
                <Logo size={96} animated twinkle />
                <div>
                  <div className="about-name">Organizador</div>
                  <div className="muted">Versão {info?.version ?? '1.0.0'} · {info?.os ?? 'Windows'}</div>
                  <p className="about-text">
                    Explorador de arquivos com foco em organização, limpeza e otimização. Feito para deixar o seu computador leve e as suas pastas em ordem — sem
                    complicação.
                  </p>
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <span className="badge badge-good">
                      <Icon name="wifi-off" size={12} />
                      100% off-line
                    </span>
                    <span className="badge badge-accent">
                      <Icon name="shield-check" size={12} />
                      Nenhum dado sai do computador
                    </span>
                    <span className="badge">
                      <Icon name="code" size={12} />
                      Tauri · Rust · React
                    </span>
                  </div>
                </div>
              </section>
              <section className="card card-pad">
                <div className="card-title" style={{ marginBottom: 12 }}>
                  Atalhos de teclado
                </div>
                <div className="shortcuts">
                  {[
                    [`${modKey}+K`, 'Pesquisar páginas, pastas e ações'],
                    [`${modKey}+C / ${modKey}+X / ${modKey}+V`, 'Copiar, recortar e colar arquivos'],
                    [`${modKey}+Z`, 'Desfazer a última operação'],
                    ['Delete / Shift+Delete', 'Lixeira / excluir permanentemente'],
                    ['F2', 'Renomear'],
                    [`${modKey}+Shift+N`, 'Nova pasta'],
                    ['Alt+← / Alt+→ / Alt+↑', 'Voltar, avançar, pasta acima'],
                    [`${modKey}+L`, 'Editar o endereço'],
                    [`${modKey}+F`, 'Pesquisar na pasta'],
                    ['F5', 'Atualizar'],
                    [`${modKey}+A`, 'Selecionar tudo'],
                    [`${modKey}+,`, 'Abrir as Configurações'],
                  ].map(([k, d]) => (
                    <div key={k} className="shortcut">
                      <span className="kbd">{k}</span>
                      <span className="muted">{d}</span>
                    </div>
                  ))}
                </div>
              </section>
            </>
          ) : null}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
