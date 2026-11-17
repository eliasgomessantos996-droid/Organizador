import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { FileIcon } from '../../components/FileIcon';
import { Icon } from '../../components/Icon';
import { Checkbox, EmptyState, SearchInput, Spinner } from '../../components/ui/controls';
import { api, errorText } from '../../lib/api';
import { emitFsChanged } from '../../lib/events';
import { formatBytes, formatDate, plural } from '../../lib/format';
import { launchTool } from '../../lib/systemActions';
import type { RecycleInfo, TrashEntry } from '../../lib/types';
import { confirm } from '../../store/dialogs';
import { useHealth } from '../../store/health';
import { useHistory } from '../../store/history';
import { toast } from '../../store/toasts';

/** Conteúdo da Lixeira: restaurar, excluir definitivamente ou esvaziar de uma vez. */
export function RecycleBin() {
  const [info, setInfo] = useState<RecycleInfo | null>(null);
  const [items, setItems] = useState<TrashEntry[] | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setItems(null);
    const [i, list] = await Promise.all([api.recycleInfo().catch(() => null), api.trashList(true).catch((e) => (toast.error('Não foi possível ler a Lixeira', errorText(e)), []))]);
    setInfo(i);
    setItems(list);
    setSel(new Set());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (items ?? []).filter((x) => !t || x.name.toLowerCase().includes(t) || x.originalParent.toLowerCase().includes(t));
  }, [items, q]);

  const emptyAll = async () => {
    const ok = await confirm({
      title: 'Esvaziar a Lixeira?',
      text: `${info ? `${plural(info.items, 'item', 'itens')} (${formatBytes(info.bytes)}) serão` : 'Todos os itens serão'} excluídos permanentemente. Esta ação não pode ser desfeita.`,
      tone: 'danger',
      icon: 'trash-x',
      confirmLabel: 'Esvaziar a Lixeira',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await api.emptyRecycleBin();
      useHistory.getState().add({ source: 'lixeira', freed: r.bytes, items: r.items, targets: [{ id: 'lixeira', name: 'Lixeira', freed: r.bytes }] });
      toast.good('Lixeira esvaziada', `${formatBytes(r.bytes)} liberados.`);
      void useHealth.getState().loadExtras(true);
      await load();
    } catch (e) {
      toast.error('Não foi possível esvaziar a Lixeira', errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    setBusy(true);
    try {
      const chosen = (items ?? []).filter((x) => sel.has(x.id));
      const r = await api.trashRestore([...sel]);
      if (r.done) toast.good(`${plural(r.done, 'item restaurado', 'itens restaurados')}`, 'Os arquivos voltaram para o local original.');
      if (r.failed.length) toast.warning(`${r.failed.length} itens não puderam ser restaurados`, r.failed[0]);
      emitFsChanged([...new Set(chosen.map((x) => x.originalParent))]);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const purge = async () => {
    const chosen = (items ?? []).filter((x) => sel.has(x.id));
    const ok = await confirm({
      title: `Excluir ${plural(chosen.length, 'item', 'itens')} definitivamente?`,
      text: 'Eles sairão da Lixeira e não poderão ser recuperados.',
      tone: 'danger',
      icon: 'trash-x',
      confirmLabel: 'Excluir definitivamente',
      details: chosen.map((x) => x.name),
    });
    if (!ok) return;
    setBusy(true);
    try {
      const freed = chosen.reduce((s, x) => s + (x.size ?? 0), 0);
      const r = await api.trashPurge([...sel]);
      useHistory.getState().add({ source: 'lixeira', freed, items: r.done, targets: [] });
      toast.good(`${plural(r.done, 'item excluído', 'itens excluídos')}`, freed ? `${formatBytes(freed)} liberados.` : undefined);
      await load();
    } catch (e) {
      toast.error('Não foi possível excluir', errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const allSelected = visible.length > 0 && visible.every((x) => sel.has(x.id));

  return (
    <div className="recycle">
      <section className="card card-pad recycle-hero">
        <div className="recycle-art anim-hover">
          <Icon name="trash" size={34} />
        </div>
        <div style={{ flex: 1 }}>
          <div className="section-label">Lixeira</div>
          <div className="stat-value" style={{ fontSize: 28 }}>
            {info ? formatBytes(info.bytes) : '—'}
          </div>
          <div className="muted">{info ? plural(info.items, 'item', 'itens') : 'Calculando…'} em todas as unidades</div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn" onClick={() => void launchTool('recyclebin')}>
            <Icon name="external-link" size={15} />
            Abrir no Windows
          </button>
          <button type="button" className="btn btn-danger anim-hover" disabled={busy || !info?.items} onClick={() => void emptyAll()}>
            {busy ? <Spinner size={15} /> : <Icon name="trash-x" size={16} />}
            Esvaziar a Lixeira
          </button>
        </div>
      </section>

      <section className="card recycle-list">
        <div className="recycle-toolbar">
          <Checkbox
            checked={allSelected}
            indeterminate={!allSelected && sel.size > 0}
            onChange={() => setSel(allSelected ? new Set() : new Set(visible.map((x) => x.id)))}
            label="Selecionar todos"
          />
          <SearchInput value={q} onChange={setQ} placeholder="Procurar na Lixeira" small width={240} />
          <div className="spacer" />
          <button type="button" className="btn btn-sm" disabled={!sel.size || busy} onClick={() => void restore()}>
            <Icon name="restore" size={14} />
            Restaurar
          </button>
          <button type="button" className="btn btn-sm btn-danger-soft" disabled={!sel.size || busy} onClick={() => void purge()}>
            <Icon name="trash-x" size={14} />
            Excluir definitivamente
          </button>
          <button type="button" className="icon-btn" onClick={() => void load()} data-tip="Atualizar">
            <Icon name="refresh" size={16} />
          </button>
        </div>
        {items === null ? (
          <div className="ct-items-loading" style={{ padding: 24 }}>
            <Spinner size={16} /> Lendo a Lixeira…
          </div>
        ) : visible.length === 0 ? (
          <EmptyState icon="sparkles" title={items.length ? 'Nada encontrado' : 'A Lixeira está vazia'} text={items.length ? 'Nenhum item corresponde à busca.' : 'Nenhum arquivo excluído ocupando espaço. 🎉'} />
        ) : (
          <div className="recycle-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 36 }} />
                  <th>Nome</th>
                  <th>Local original</th>
                  <th>Excluído em</th>
                  <th className="num">Tamanho</th>
                </tr>
              </thead>
              <tbody>
                {visible.slice(0, 2000).map((x, i) => (
                  <motion.tr
                    key={x.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(i, 20) * 0.015 }}
                    className={sel.has(x.id) ? 'selected-row' : ''}
                    onClick={() => {
                      const s = new Set(sel);
                      if (s.has(x.id)) s.delete(x.id);
                      else s.add(x.id);
                      setSel(s);
                    }}
                  >
                    <td>
                      <Checkbox checked={sel.has(x.id)} onChange={() => {}} label={x.name} />
                    </td>
                    <td>
                      <span className="row" style={{ gap: 8 }}>
                        <FileIcon category={x.category} size={18} />
                        <span className="truncate">{x.name}</span>
                      </span>
                    </td>
                    <td className="muted truncate" style={{ maxWidth: 320 }} data-tip={x.originalPath}>
                      {x.originalParent}
                    </td>
                    <td className="muted tabular">{formatDate(x.deletedAt)}</td>
                    <td className="num muted">{x.size === null ? (x.isDir ? 'pasta' : '—') : formatBytes(x.size)}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
