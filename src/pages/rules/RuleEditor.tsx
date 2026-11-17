import { useEffect, useState } from 'react';
import { DialogHeader, Modal } from '../../components/ui/Modal';
import { Icon } from '../../components/Icon';
import { Segmented, Toggle } from '../../components/ui/controls';
import { FAMILIES, categoriesOfFamily, CATEGORY_BY_ID, type Category, type Family } from '../../lib/categories';
import { pickFolder } from '../../lib/fileops';
import { basename, joinPath } from '../../lib/format';
import type { Rule } from '../../lib/types';

const AGE = [
  { value: '', label: 'Qualquer' },
  { value: '7', label: '7 dias' },
  { value: '30', label: '30 dias' },
  { value: '90', label: '3 meses' },
  { value: '180', label: '6 meses' },
  { value: '365', label: '1 ano' },
];

const TOKENS = [
  { token: '{categoria}', label: 'Tipo', hint: 'Imagens, PDFs, Músicas…' },
  { token: '{ano}', label: 'Ano', hint: '2026' },
  { token: '{mes}', label: 'Mês', hint: '03' },
  { token: '{mes_nome}', label: 'Nome do mês', hint: 'Março' },
  { token: '{ext}', label: 'Extensão', hint: 'pdf' },
];

/** Exemplo de destino para um arquivo fictício. */
function example(rule: Rule): string {
  if (rule.action.type === 'trash') return 'Os arquivos vão para a Lixeira (podem ser restaurados).';
  const cat: Category = rule.conditions.categories[0] ?? 'pdf';
  const sampleName = { image: 'foto.jpg', pdf: 'contrato.pdf', executable: 'instalador.exe', audio: 'musica.mp3', video: 'video.mp4' }[cat as string] ?? 'arquivo.pdf';
  const dest = rule.action.dest
    .replace('{categoria}', CATEGORY_BY_ID[cat].folder)
    .replace('{ano}', '2026')
    .replace('{mes_nome}', 'Março')
    .replace('{mes}', '03')
    .replace('{dia}', '15')
    .replace('{ext}', sampleName.split('.').pop()!);
  const absolute = /^[A-Za-z]:\\/.test(dest) || dest.startsWith('/');
  const full = absolute ? dest : joinPath(rule.source || 'C:\\Pasta', dest);
  return `Exemplo: ${sampleName} → ${joinPath(full, sampleName)}`;
}

export function RuleEditor({ rule, open, onClose, onSave }: { rule: Rule | null; open: boolean; onClose: () => void; onSave: (r: Rule) => void }) {
  const [r, setR] = useState<Rule | null>(rule);
  const [exts, setExts] = useState('');
  useEffect(() => {
    setR(rule);
    setExts(rule?.conditions.extensions.join(', ') ?? '');
  }, [rule]);
  if (!r) return null;

  const c = r.conditions;
  const setC = (patch: Partial<Rule['conditions']>) => setR({ ...r, conditions: { ...c, ...patch } });
  const famActive = (f: Family) => categoriesOfFamily(f).every((x) => c.categories.includes(x));
  const toggleFam = (f: Family) => {
    const cats = categoriesOfFamily(f);
    setC({ categories: famActive(f) ? c.categories.filter((x) => !cats.includes(x)) : [...new Set([...c.categories, ...cats])] });
  };
  const dest = r.action.type === 'trash' ? '' : r.action.dest;
  const valid = r.name.trim() && r.source.trim() && (r.action.type === 'trash' || dest.trim());

  return (
    <Modal open={open} onClose={onClose} width="wide">
      <div className="dialog-body">
        <DialogHeader icon="wand" title={r.name.trim() ? r.name : 'Regra'} text="Defina de onde, quais arquivos e para onde. Você sempre vê uma prévia antes de aplicar." />
        <div className="rule-form">
          <label className="field">
            <span className="field-label">Nome da regra</span>
            <input className="input" value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} />
          </label>

          <div className="field">
            <span className="field-label">Pasta de origem</span>
            <div className="row">
              <input className="input" value={r.source} placeholder="Ex.: C:\Users\Você\Downloads" onChange={(e) => setR({ ...r, source: e.target.value })} spellCheck={false} />
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  const f = await pickFolder('Pasta de origem', r.source || undefined);
                  if (f) setR({ ...r, source: f });
                }}
              >
                <Icon name="folder-open" size={15} />
                Escolher
              </button>
            </div>
            <label className="row field-hint" style={{ cursor: 'pointer', marginTop: 4 }}>
              <Toggle checked={r.recursive} onChange={(v) => setR({ ...r, recursive: v })} label="Incluir subpastas" />
              Incluir subpastas
            </label>
          </div>

          <div className="field">
            <span className="field-label">Quais arquivos</span>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {FAMILIES.map((f) => (
                <button key={f.id} type="button" className={`chip ${famActive(f.id) ? 'active' : ''}`} onClick={() => toggleFam(f.id)}>
                  <span className="chip-swatch" style={{ background: f.color }} />
                  {f.label}
                </button>
              ))}
            </div>
            <div className="rule-grid">
              <label className="field">
                <span className="field-hint">Extensões (separadas por vírgula)</span>
                <input
                  className="input input-sm"
                  value={exts}
                  placeholder="pdf, docx"
                  onChange={(e) => {
                    setExts(e.target.value);
                    setC({ extensions: e.target.value.split(/[,;\s]+/).map((x) => x.replace(/^\./, '').trim()).filter(Boolean) });
                  }}
                />
              </label>
              <label className="field">
                <span className="field-hint">Nome contém</span>
                <input className="input input-sm" value={c.nameContains} placeholder="Ex.: Captura de tela" onChange={(e) => setC({ nameContains: e.target.value })} />
              </label>
              <div className="field">
                <span className="field-hint">Mais antigos que</span>
                <Segmented size="sm" value={c.olderThanDays ? String(c.olderThanDays) : ''} onChange={(v) => setC({ olderThanDays: v ? Number(v) : null })} options={AGE} />
              </div>
            </div>
          </div>

          <div className="field">
            <span className="field-label">O que fazer</span>
            <Segmented
              value={r.action.type}
              onChange={(t) => setR({ ...r, action: t === 'trash' ? { type: 'trash' } : { type: t, dest: dest || '{categoria}' } })}
              options={[
                { value: 'move', label: 'Mover', icon: 'arrow-right' },
                { value: 'copy', label: 'Copiar', icon: 'copy' },
                { value: 'trash', label: 'Enviar para a Lixeira', icon: 'trash' },
              ]}
            />
          </div>

          {r.action.type !== 'trash' ? (
            <div className="field">
              <span className="field-label">Destino</span>
              <div className="row">
                <input
                  className="input mono"
                  value={dest}
                  spellCheck={false}
                  placeholder="{categoria}  ou  D:\Arquivo\{ano}"
                  onChange={(e) => setR({ ...r, action: { type: r.action.type as 'move' | 'copy', dest: e.target.value } })}
                />
                <button
                  type="button"
                  className="btn"
                  onClick={async () => {
                    const f = await pickFolder('Pasta de destino');
                    if (f) setR({ ...r, action: { type: r.action.type as 'move' | 'copy', dest: f } });
                  }}
                >
                  <Icon name="folder-open" size={15} />
                  Escolher
                </button>
              </div>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                <span className="field-hint">Inserir:</span>
                {TOKENS.map((t) => (
                  <button
                    key={t.token}
                    type="button"
                    className="chip"
                    data-tip={t.hint}
                    onClick={() => setR({ ...r, action: { type: r.action.type as 'move' | 'copy', dest: `${dest}${dest && !/[\\/]$/.test(dest) ? '\\' : ''}${t.token}` } })}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="field-hint">Caminhos sem unidade (como “{'{categoria}'}”) ficam dentro da pasta de origem.</div>
            </div>
          ) : null}

          <div className="rule-example">
            <Icon name="info" size={15} />
            <span className="truncate">{example(r)}</span>
          </div>
        </div>
      </div>
      <div className="dialog-footer">
        <button type="button" className="btn" onClick={onClose}>
          Cancelar
        </button>
        <button type="button" className="btn btn-primary" disabled={!valid} onClick={() => onSave({ ...r, name: r.name.trim() || basename(r.source) })}>
          Salvar regra
        </button>
      </div>
    </Modal>
  );
}
