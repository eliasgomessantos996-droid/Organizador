import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ColumnChart } from '../../components/charts';
import { Icon, type IconName } from '../../components/Icon';
import { PageHeader } from '../../components/layout/PageHeader';
import { EmptyState, StatTile, Tabs } from '../../components/ui/controls';
import { api, errorText } from '../../lib/api';
import { pickSaveFile, undoEntry } from '../../lib/fileops';
import { formatBytes, formatDate, formatMonth, formatRelative, plural } from '../../lib/format';
import { confirm } from '../../store/dialogs';
import { freedByMonth, SOURCE_LABEL, totalFreed, useHistory } from '../../store/history';
import { UNDOABLE, useJournal, type JournalKind } from '../../store/journal';
import { toast } from '../../store/toasts';

const KIND_ICON: Record<JournalKind, IconName> = {
  move: 'arrow-right',
  copy: 'copy',
  rename: 'pencil',
  create: 'plus',
  trash: 'trash',
  delete: 'trash-x',
  restore: 'restore',
  rules: 'wand',
};

function csvEscape(v: string | number) {
  const s = String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function History() {
  const records = useHistory((s) => s.records);
  const clearHistory = useHistory((s) => s.clear);
  const entries = useJournal((s) => s.entries);
  const clearJournal = useJournal((s) => s.clear);
  const [tab, setTab] = useState<'limpezas' | 'operacoes'>('limpezas');
  const [open, setOpen] = useState<number | null>(null);

  const months = useMemo(() => freedByMonth(records, 6), [records]);
  const thisMonth = months[months.length - 1]?.freed ?? 0;

  const exportCsv = async () => {
    const path = await pickSaveFile('Exportar histórico de limpezas', 'historico-organizador.csv', 'csv', 'Planilha CSV');
    if (!path) return;
    const lines = ['Data;Origem;Itens;Liberado (bytes);Liberado'];
    for (const r of records) lines.push([formatDate(r.at), SOURCE_LABEL[r.source], r.items, r.freed, formatBytes(r.freed)].map(csvEscape).join(';'));
    try {
      await api.saveTextFile(path, lines.join('\r\n'));
      toast.good('Histórico exportado', path);
    } catch (e) {
      toast.error('Não foi possível exportar', errorText(e));
    }
  };

  return (
    <div className="page-scroll">
      <PageHeader
        icon="history"
        title="Histórico"
        subtitle="Tudo o que o Organizador limpou e organizou, com opção de desfazer."
        actions={
          <button type="button" className="btn btn-sm" disabled={!records.length} onClick={() => void exportCsv()}>
            <Icon name="upload" size={14} />
            Exportar CSV
          </button>
        }
      />

      <div className="grid-4">
        <StatTile icon="sparkles" tone="good" label="Total liberado" value={formatBytes(totalFreed(records))} sub={plural(records.length, 'limpeza registrada', 'limpezas registradas')} />
        <StatTile icon="calendar" label="Neste mês" value={formatBytes(thisMonth)} sub={formatMonth(Date.now())} />
        <StatTile icon="bolt" label="One Click Optimize" value={String(records.filter((r) => r.source === 'oneclick').length)} sub="otimizações feitas" />
        <StatTile icon="clock" label="Última limpeza" value={records[0] ? formatRelative(records[0].at) : '—'} sub={records[0] ? formatBytes(records[0].freed) : 'Nenhuma ainda'} />
      </div>

      <section className="card card-pad" style={{ marginTop: 16 }}>
        <div className="card-header">
          <Icon name="chart-bar" size={18} />
          <div className="card-title">Espaço liberado por mês</div>
          <span className="card-subtitle">últimos 6 meses</span>
        </div>
        <ColumnChart label="Espaço liberado por mês" data={months.map((m) => ({ key: m.key, label: formatMonth(m.start), value: m.freed, display: formatBytes(m.freed) }))} />
      </section>

      <div style={{ marginTop: 20 }}>
        <Tabs
          value={tab}
          onChange={setTab}
          options={[
            { value: 'limpezas', label: 'Limpezas', icon: 'broom', badge: records.length || undefined },
            { value: 'operacoes', label: 'Operações com arquivos', icon: 'folder', badge: entries.length || undefined },
          ]}
        />
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
          {tab === 'limpezas' ? (
            records.length === 0 ? (
              <div className="card">
                <EmptyState icon="broom" title="Nenhuma limpeza ainda" text="Use o One Click Optimize ou a Limpeza: cada resultado aparece aqui." />
              </div>
            ) : (
              <div className="card history-list">
                {records.slice(0, 200).map((r) => (
                  <div key={r.id} className="history-row">
                    <button type="button" className="history-main" onClick={() => setOpen(open === r.id ? null : r.id)}>
                      <span className="icon-tile" style={{ width: 34, height: 34 }}>
                        <Icon name={r.source === 'oneclick' ? 'bolt' : r.source === 'duplicados' ? 'copies' : r.source === 'lixeira' ? 'trash' : r.source === 'auto' ? 'clock' : 'broom'} size={16} />
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontWeight: 650 }}>{SOURCE_LABEL[r.source]}</span>
                        <span className="faint" style={{ display: 'block', fontSize: 12 }}>
                          {formatDate(r.at)} · {plural(r.items, 'item', 'itens')}
                        </span>
                      </span>
                      <strong className="tabular">{formatBytes(r.freed)}</strong>
                      <Icon name="chevron-down" size={15} className={`faint chev ${open === r.id ? 'open' : ''}`} />
                    </button>
                    <AnimatePresence initial={false}>
                      {open === r.id && r.targets.length ? (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
                          <div className="history-detail">
                            {r.targets.map((t) => (
                              <div key={t.id} className="row" style={{ justifyContent: 'space-between' }}>
                                <span className="muted">{t.name}</span>
                                <span className="tabular">{formatBytes(t.freed)}</span>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            )
          ) : entries.length === 0 ? (
            <div className="card">
              <EmptyState icon="folder" title="Nenhuma operação registrada" text="Cópias, movimentações, renomeações e exclusões feitas pelo Organizador aparecem aqui." />
            </div>
          ) : (
            <div className="card history-list">
              {entries.map((e) => (
                <div key={e.id} className={`history-row ${e.undone ? 'undone' : ''}`}>
                  <div className="history-main static">
                    <span className="icon-tile" style={{ width: 34, height: 34 }}>
                      <Icon name={KIND_ICON[e.kind]} size={16} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="truncate" style={{ display: 'block', fontWeight: 600 }}>
                        {e.label}
                      </span>
                      <span className="faint" style={{ fontSize: 12 }}>
                        {formatDate(e.at)}
                        {e.bytes ? ` · ${formatBytes(e.bytes)}` : ''}
                        {e.undone ? ' · desfeito' : ''}
                      </span>
                    </span>
                    {UNDOABLE.includes(e.kind) && !e.undone ? (
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => void undoEntry(e.id)}>
                        <Icon name="undo" size={14} />
                        Desfazer
                      </button>
                    ) : e.kind === 'delete' ? (
                      <span className="faint" style={{ fontSize: 12 }}>
                        Permanente
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14, gap: 8 }}>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={async () => {
            if (await confirm({ title: 'Apagar o histórico?', text: 'Os registros de limpezas e operações serão apagados. Os arquivos não mudam.', tone: 'danger', confirmLabel: 'Apagar histórico' })) {
              clearHistory();
              clearJournal();
            }
          }}
        >
          <Icon name="trash" size={14} />
          Apagar histórico
        </button>
      </div>
    </div>
  );
}
