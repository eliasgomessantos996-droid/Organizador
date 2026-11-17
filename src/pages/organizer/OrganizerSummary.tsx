import { useMemo, useState } from 'react';
import { MeterList, SegmentedBar } from '../../components/charts';
import { FileIcon } from '../../components/FileIcon';
import { Segmented } from '../../components/ui/controls';
import { FAMILIES, familyOf, type Family } from '../../lib/categories';
import { formatBytes, formatNumber, formatPercent, plural } from '../../lib/format';
import type { Summary } from '../../lib/types';
import { go } from '../../store/nav';
import { useOrganizer } from '../../store/organizer';

type Tab = 'tipos' | 'idade' | 'pastas' | 'extensoes' | 'maiores';

/** Painel de resumo do Organizador: para onde vai o espaço e como agrupar. */
export function OrganizerSummary({ summary }: { summary: Summary }) {
  const [tab, setTab] = useState<Tab>('tipos');
  const ui = useOrganizer((s) => s.ui);
  const setUi = useOrganizer((s) => s.setUi);

  const families = useMemo(() => {
    const acc = new Map<Family, { count: number; size: number }>();
    for (const c of summary.categories) {
      const f = familyOf(c.category);
      const cur = acc.get(f) ?? { count: 0, size: 0 };
      cur.count += c.count;
      cur.size += c.size;
      acc.set(f, cur);
    }
    // Ordem fixa da paleta (a cor segue a família, nunca a posição).
    return FAMILIES.map((f) => ({ ...f, ...(acc.get(f.id) ?? { count: 0, size: 0 }) }));
  }, [summary]);

  const toggleFamily = (id: string) => {
    const f = id as Family;
    setUi({ families: ui.families.includes(f) ? ui.families.filter((x) => x !== f) : [...ui.families, f] });
  };

  return (
    <aside className="org-summary">
      <div className="org-summary-head">
        <div className="section-label">Resumo do resultado</div>
        <div className="org-total">
          <span className="stat-value">{formatBytes(summary.size)}</span>
          <span className="muted">{plural(summary.count, 'arquivo', 'arquivos')}</span>
        </div>
      </div>

      <Segmented
        size="sm"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'tipos', label: 'Tipos' },
          { value: 'idade', label: 'Idade' },
          { value: 'pastas', label: 'Pastas' },
          { value: 'extensoes', label: 'Ext.' },
          { value: 'maiores', label: 'Maiores' },
        ]}
      />

      <div className="org-summary-body">
        {tab === 'tipos' ? (
          <>
            <SegmentedBar
              parts={families.map((f) => ({ id: f.id, label: f.label, value: f.size, color: f.color, display: formatBytes(f.size) }))}
              onSelect={toggleFamily}
            />
            <div className="fam-list">
              {families
                .filter((f) => f.count > 0)
                .sort((a, b) => b.size - a.size)
                .map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={`fam-row ${ui.families.includes(f.id) ? 'selected' : ''}`}
                    onClick={() => toggleFamily(f.id)}
                    data-tip={ui.families.includes(f.id) ? 'Remover filtro' : `Mostrar só ${f.label.toLowerCase()}`}
                  >
                    <span className="chip-swatch" style={{ background: f.color }} />
                    <span className="truncate" style={{ flex: 1 }}>
                      {f.label}
                    </span>
                    <span className="faint tabular">{formatNumber(f.count)}</span>
                    <span className="tabular fam-size">{formatBytes(f.size)}</span>
                    <span className="faint tabular fam-pct">{summary.size ? formatPercent(f.size / summary.size) : '0%'}</span>
                  </button>
                ))}
            </div>
            <p className="org-hint">Clique em um tipo para filtrar a lista.</p>
          </>
        ) : null}

        {tab === 'idade' ? (
          <>
            <MeterList
              rows={summary.ages.map((a) => ({ id: a.id, label: a.label, value: a.size, display: formatBytes(a.size), sub: plural(a.count, 'arquivo', 'arquivos') }))}
              selected={ui.modified.startsWith('age:') ? ui.modified.slice(4) : null}
              onSelect={(id) => setUi({ modified: ui.modified === `age:${id}` ? '' : `age:${id}` })}
            />
            <p className="org-hint">Pela data de modificação. Arquivos antigos são bons candidatos para arquivar ou excluir.</p>
          </>
        ) : null}

        {tab === 'pastas' ? (
          <>
            <MeterList
              rows={summary.folders.map((f) => ({ id: f.path, label: f.name, value: f.size, display: formatBytes(f.size), sub: plural(f.count, 'arquivo', 'arquivos'), title: f.path }))}
              selected={ui.folder}
              onSelect={(id) => {
                const f = summary.folders.find((x) => x.path === id);
                setUi(ui.folder === id ? { folder: null, folderName: null } : { folder: id, folderName: f?.name ?? id });
              }}
            />
            <p className="org-hint">Subpastas que mais ocupam espaço. Clique para ver só uma delas.</p>
          </>
        ) : null}

        {tab === 'extensoes' ? (
          <MeterList
            rows={summary.extensions.map((e) => ({ id: e.ext, label: e.ext ? `.${e.ext}` : '(sem extensão)', value: e.size, display: formatBytes(e.size), sub: plural(e.count, 'arquivo', 'arquivos') }))}
            selected={ui.ext}
            onSelect={(id) => setUi({ ext: ui.ext === id ? null : id })}
          />
        ) : null}

        {tab === 'maiores' ? (
          <div className="largest-list">
            {summary.largest.map((e) => (
              <button key={e.path} type="button" className="largest-row" onClick={() => go('explorador', { path: e.parent })} data-tip={e.path}>
                <FileIcon category={e.category} ext={e.ext} size={22} />
                <span className="truncate" style={{ flex: 1 }}>
                  {e.name}
                </span>
                <span className="tabular faint">{formatBytes(e.size)}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
