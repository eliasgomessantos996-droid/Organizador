import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Icon, type IconName } from '../../components/Icon';
import { PageHeader } from '../../components/layout/PageHeader';
import { EmptyState, Spinner, Toggle } from '../../components/ui/controls';
import { openDropdown } from '../../components/ui/Menu';
import { DialogHeader, Modal } from '../../components/ui/Modal';
import { api, errorText } from '../../lib/api';
import { CATEGORY_BY_ID } from '../../lib/categories';
import { basename, dirname, formatBytes, plural } from '../../lib/format';
import { applyPlan } from '../../lib/rulesApply';
import type { PlannedAction, Rule } from '../../lib/types';
import { confirm } from '../../store/dialogs';
import { usePlaces } from '../../store/places';
import { blankRule, TEMPLATES, useRules } from '../../store/rules';
import { useSettings } from '../../store/settings';
import { toast } from '../../store/toasts';
import { RuleEditor } from './RuleEditor';

const ACTION_ICON: Record<Rule['action']['type'], IconName> = { move: 'arrow-right', copy: 'copy', trash: 'trash' };

function summary(r: Rule): string[] {
  const out: string[] = [];
  const c = r.conditions;
  if (c.categories.length) out.push([...new Set(c.categories.map((x) => CATEGORY_BY_ID[x].plural))].slice(0, 3).join(', ') + (c.categories.length > 3 ? '…' : ''));
  if (c.extensions.length) out.push(c.extensions.map((e) => `.${e}`).join(' '));
  if (c.nameContains) out.push(`nome contém “${c.nameContains}”`);
  if (c.olderThanDays) out.push(`mais de ${c.olderThanDays} dias`);
  if (r.recursive) out.push('com subpastas');
  if (!out.length) out.push('todos os arquivos');
  return out;
}

export function Rules() {
  const rules = useRules();
  const special = usePlaces((s) => s.special);
  const runOnStart = useSettings((s) => s.runRulesOnStart);
  const setSettings = useSettings((s) => s.set);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [plan, setPlan] = useState<PlannedAction[] | null>(null);
  const [planning, setPlanning] = useState(false);
  const [applying, setApplying] = useState(false);

  const preview = async (only?: Rule) => {
    setPlanning(true);
    try {
      const list = only ? [{ ...only, enabled: true }] : rules.rules;
      if (!list.some((r) => r.enabled)) {
        toast.info('Nenhuma regra ativa', 'Ative pelo menos uma regra para pré-visualizar.');
        return;
      }
      setPlan(await api.rulesPreview(list));
    } catch (e) {
      toast.error('Não foi possível pré-visualizar', errorText(e));
    } finally {
      setPlanning(false);
    }
  };

  const apply = async () => {
    if (!plan?.length) return;
    setApplying(true);
    try {
      await applyPlan(plan);
      setPlan(null);
    } catch (e) {
      toast.error('Não foi possível aplicar as regras', errorText(e));
    } finally {
      setApplying(false);
    }
  };

  const byRule = useMemo(() => {
    const m = new Map<string, { name: string; count: number; size: number }>();
    for (const p of plan ?? []) {
      const cur = m.get(p.ruleId) ?? { name: p.ruleName, count: 0, size: 0 };
      cur.count++;
      cur.size += p.size;
      m.set(p.ruleId, cur);
    }
    return [...m.values()];
  }, [plan]);

  const save = (r: Rule) => {
    if (rules.rules.some((x) => x.id === r.id)) rules.update(r.id, r);
    else rules.add(r);
    setEditing(null);
    toast.good('Regra salva', r.name);
  };

  const fromTemplate = (id: string) => {
    const t = TEMPLATES.find((x) => x.id === id);
    const r = special ? t?.make(special) : null;
    if (!r) {
      toast.error('Não foi possível criar a partir do modelo', 'A pasta usada pelo modelo não foi encontrada.');
      return;
    }
    setEditing(r);
  };

  return (
    <div className="page-scroll">
      <PageHeader
        icon="wand"
        title="Regras automáticas"
        subtitle="Ensine o Organizador a arrumar pastas sozinho: mover por tipo, separar por data, limpar instaladores antigos…"
        actions={
          <>
            <button type="button" className="btn btn-sm" onClick={() => setEditing(blankRule(special?.downloads ?? ''))}>
              <Icon name="plus" size={15} />
              Nova regra
            </button>
            <button type="button" className="btn btn-sm btn-primary anim-hover" disabled={!rules.rules.length || planning} onClick={() => void preview()}>
              {planning ? <Spinner size={14} /> : <Icon name="wand" size={15} />}
              Pré-visualizar e aplicar
            </button>
          </>
        }
      />

      {rules.rules.length === 0 ? (
        <div className="card">
          <EmptyState icon="wand" title="Nenhuma regra ainda" text="Comece com um modelo pronto abaixo ou crie a sua. Nada é alterado sem você ver a prévia antes." />
        </div>
      ) : (
        <div className="rules-list">
          <AnimatePresence initial={false}>
            {rules.rules.map((r, i) => (
              <motion.div key={r.id} layout className={`card rule-card ${r.enabled ? '' : 'off'}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}>
                <Toggle checked={r.enabled} onChange={(v) => rules.update(r.id, { enabled: v })} label={`Ativar ${r.name}`} />
                <div className="rule-icon anim-hover">
                  <Icon name={ACTION_ICON[r.action.type]} size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="rule-name">{r.name}</div>
                  <div className="rule-flow">
                    <span className="badge">
                      <Icon name="folder" size={11} />
                      {basename(r.source) || '—'}
                    </span>
                    <Icon name="arrow-right" size={13} className="faint" />
                    {r.action.type === 'trash' ? (
                      <span className="badge badge-critical">
                        <Icon name="trash" size={11} />
                        Lixeira
                      </span>
                    ) : (
                      <span className="badge badge-accent mono">{r.action.dest}</span>
                    )}
                  </div>
                  <div className="rule-conds">{summary(r).join(' · ')}</div>
                </div>
                <span className="faint" style={{ fontSize: 12 }}>
                  #{i + 1}
                </span>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => void preview(r)}>
                  Executar
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Mais opções"
                  onClick={(e) =>
                    openDropdown(
                      e.currentTarget,
                      [
                        { label: 'Editar', icon: 'pencil', onSelect: () => setEditing(r) },
                        { label: 'Duplicar', icon: 'copy', onSelect: () => rules.duplicate(r.id) },
                        { label: 'Subir na prioridade', icon: 'arrow-up', disabled: i === 0, onSelect: () => rules.move(r.id, -1) },
                        { label: 'Descer na prioridade', icon: 'arrow-down', disabled: i === rules.rules.length - 1, onSelect: () => rules.move(r.id, 1) },
                        { separator: true },
                        {
                          label: 'Excluir regra',
                          icon: 'trash',
                          danger: true,
                          onSelect: async () => {
                            if (await confirm({ title: `Excluir a regra “${r.name}”?`, text: 'Os arquivos já organizados não mudam.', tone: 'danger', confirmLabel: 'Excluir regra' })) rules.remove(r.id);
                          },
                        },
                      ],
                      'right',
                    )
                  }
                >
                  <Icon name="more-h" size={17} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
          <label className="row rules-auto">
            <Toggle checked={runOnStart} onChange={(v) => setSettings({ runRulesOnStart: v })} label="Aplicar regras ao abrir o Organizador" />
            <span>
              <strong>Aplicar automaticamente ao abrir o Organizador</strong>
              <span className="faint"> — as regras ativas rodam sozinhas e você pode desfazer pelo Histórico.</span>
            </span>
          </label>
        </div>
      )}

      <div className="section-label" style={{ margin: '24px 0 10px' }}>
        Modelos prontos
      </div>
      <div className="grid-3">
        {TEMPLATES.map((t, i) => (
          <motion.button
            key={t.id}
            type="button"
            className="card card-pad card-hover anim-hover template-card"
            onClick={() => fromTemplate(t.id)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
          >
            <div className="icon-tile">
              <Icon name={t.icon} size={19} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="card-title">{t.name}</div>
              <div className="card-subtitle" style={{ marginTop: 3 }}>
                {t.description}
              </div>
            </div>
            <Icon name="plus" size={16} className="home-action-arrow" />
          </motion.button>
        ))}
      </div>

      <RuleEditor rule={editing} open={!!editing} onClose={() => setEditing(null)} onSave={save} />

      <Modal open={!!plan} onClose={() => !applying && setPlan(null)} width="xwide" locked={applying}>
        <div className="dialog-body">
          <DialogHeader
            icon="wand"
            title={plan?.length ? `Prévia: ${plural(plan.length, 'arquivo será organizado', 'arquivos serão organizados')}` : 'Nada para organizar'}
            text={plan?.length ? 'Confira o que vai acontecer. Você pode desfazer depois com Ctrl+Z ou pelo Histórico.' : 'Nenhum arquivo corresponde às regras ativas (ou eles já estão no lugar certo).'}
          />
          {plan?.length ? (
            <>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap', margin: '14px 0 10px' }}>
                {byRule.map((b) => (
                  <span key={b.name} className="badge badge-accent">
                    {b.name}: {plural(b.count, 'arquivo', 'arquivos')} · {formatBytes(b.size)}
                  </span>
                ))}
              </div>
              <div className="plan-table">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Arquivo</th>
                      <th style={{ width: 40 }} />
                      <th>Destino</th>
                      <th className="num">Tamanho</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.slice(0, 500).map((p) => (
                      <tr key={p.from}>
                        <td className="truncate" style={{ maxWidth: 300 }} data-tip={p.from}>
                          {basename(p.from)}
                        </td>
                        <td>
                          <Icon name={ACTION_ICON[p.action]} size={14} className="faint" />
                        </td>
                        <td className="truncate muted" style={{ maxWidth: 380 }} data-tip={p.to ?? 'Lixeira'}>
                          {p.to ? dirname(p.to) : 'Lixeira'}
                        </td>
                        <td className="num muted">{formatBytes(p.size)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {plan.length > 500 ? <div className="faint" style={{ padding: 10 }}>e mais {plan.length - 500} arquivos…</div> : null}
              </div>
            </>
          ) : null}
        </div>
        <div className="dialog-footer">
          <button type="button" className="btn" onClick={() => setPlan(null)} disabled={applying}>
            {plan?.length ? 'Cancelar' : 'Fechar'}
          </button>
          {plan?.length ? (
            <button type="button" className="btn btn-primary" onClick={() => void apply()} disabled={applying}>
              {applying ? <Spinner size={14} /> : <Icon name="check" size={15} />}
              Aplicar {plural(plan.length, 'ação', 'ações')}
            </button>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
