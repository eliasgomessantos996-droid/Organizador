import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { FileIcon } from '../../components/FileIcon';
import { Icon } from '../../components/Icon';
import { Spinner } from '../../components/ui/controls';
import { api, fileUrl, newTaskId } from '../../lib/api';
import { typeLabel } from '../../lib/categories';
import { copyPathsAsText, openPath, revealPath } from '../../lib/fileops';
import { basename, formatBytes, formatDate, formatNumber, plural } from '../../lib/format';
import type { FileEntry, SizeInfo } from '../../lib/types';
import { specialOf } from '../../store/places';
import { useSettings } from '../../store/settings';

const TEXT_EXT = new Set(['txt', 'md', 'log', 'csv', 'json', 'xml', 'ini', 'cfg', 'conf', 'yml', 'yaml', 'toml', 'js', 'ts', 'tsx', 'jsx', 'py', 'html', 'css', 'bat', 'ps1', 'sql', 'rs', 'java', 'c', 'cpp', 'h', 'cs', 'go', 'php', 'rb', 'sh']);

function FolderSize({ path }: { path: string }) {
  const [info, setInfo] = useState<SizeInfo | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setInfo(null);
    setBusy(false);
  }, [path]);
  if (info) return <span>{`${formatBytes(info.size)} · ${plural(info.files, 'arquivo', 'arquivos')}, ${plural(info.dirs, 'pasta', 'pastas')}`}</span>;
  return (
    <button
      type="button"
      className="btn btn-soft btn-sm"
      disabled={busy}
      data-tip="Soma esta pasta com todas as subpastas"
      onClick={async () => {
        setBusy(true);
        try {
          setInfo(await api.folderSize(newTaskId(), path));
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Spinner size={13} /> : <Icon name="ruler" size={14} />}
      {busy ? 'Calculando…' : 'Calcular'}
    </button>
  );
}

function Preview({ entry }: { entry: FileEntry }) {
  const thumbs = useSettings((s) => s.thumbnails);
  const [text, setText] = useState<string | null>(null);
  const url = thumbs && entry.category === 'image' && entry.size < 40 * 1024 * 1024 ? fileUrl(entry.path) : null;
  useEffect(() => {
    setText(null);
    if (!entry.isDir && TEXT_EXT.has(entry.ext) && entry.size < 20 * 1024 * 1024) {
      let alive = true;
      api
        .readTextPreview(entry.path)
        .then((t) => alive && setText(t))
        .catch(() => {});
      return () => {
        alive = false;
      };
    }
  }, [entry.path, entry.ext, entry.isDir, entry.size]);

  if (url) {
    return (
      <div className="dp-preview dp-image">
        <img src={url} alt="" draggable={false} />
      </div>
    );
  }
  if (text !== null) {
    return (
      <div className="dp-preview dp-text selectable">
        <pre>{text.slice(0, 3000)}</pre>
      </div>
    );
  }
  return (
    <div className="dp-preview">
      <FileIcon category={entry.category} ext={entry.ext} size={88} special={entry.isDir ? specialOf(entry.path) : null} />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="dp-row">
      <div className="dp-key">{label}</div>
      <div className="dp-val selectable">{children}</div>
    </div>
  );
}

/** Painel de detalhes (pré-visualização e propriedades do item selecionado). */
export function DetailsPane({ selected, folderPath, folderEntries }: { selected: FileEntry[]; folderPath: string; folderEntries: FileEntry[] }) {
  const single = selected.length === 1 ? selected[0] : null;
  const multi = selected.length > 1;

  const multiInfo = useMemo(() => {
    if (!multi) return null;
    const files = selected.filter((e) => !e.isDir);
    const types = new Map<string, number>();
    for (const e of selected) types.set(typeLabel(e.category, e.ext), (types.get(typeLabel(e.category, e.ext)) ?? 0) + 1);
    return {
      size: files.reduce((s, e) => s + e.size, 0),
      folders: selected.length - files.length,
      types: [...types].sort((a, b) => b[1] - a[1]).slice(0, 6),
    };
  }, [multi, selected]);

  const folderInfo = useMemo(() => {
    const files = folderEntries.filter((e) => !e.isDir);
    return { files: files.length, folders: folderEntries.length - files.length, size: files.reduce((s, e) => s + e.size, 0) };
  }, [folderEntries]);

  const key = single?.path ?? (multi ? `multi-${selected.length}` : `folder-${folderPath}`);

  return (
    <aside className="details-pane" aria-label="Painel de detalhes">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={key} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
          {single ? (
            <>
              <Preview entry={single} />
              <div className="dp-title selectable">{single.name}</div>
              <div className="dp-sub">{typeLabel(single.category, single.ext)}</div>
              <div className="row" style={{ gap: 6, margin: '12px 0 4px', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-sm" onClick={() => void openPath(single.path)}>
                  <Icon name="external-link" size={14} />
                  Abrir
                </button>
                <button type="button" className="btn btn-sm" onClick={() => void revealPath(single.path)}>
                  <Icon name="folder-search" size={14} />
                  Mostrar
                </button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => void copyPathsAsText([single.path])} data-tip="Copiar caminho">
                  <Icon name="link" size={14} />
                </button>
              </div>
              <div className="dp-props">
                <Row label="Tamanho">{single.isDir ? <FolderSize path={single.path} /> : formatBytes(single.size)}</Row>
                <Row label="Modificado">{formatDate(single.modified)}</Row>
                <Row label="Criado">{formatDate(single.created)}</Row>
                <Row label="Último acesso">{formatDate(single.accessed)}</Row>
                <Row label="Local">{single.parent}</Row>
                {single.hidden || single.readonly || single.system ? (
                  <Row label="Atributos">{[single.hidden && 'Oculto', single.readonly && 'Somente leitura', single.system && 'Sistema'].filter(Boolean).join(', ')}</Row>
                ) : null}
              </div>
            </>
          ) : multi && multiInfo ? (
            <>
              <div className="dp-preview dp-multi">
                <div className="dp-stack">
                  {selected.slice(0, 3).map((e, i) => (
                    <span key={e.path} className="dp-stack-card" style={{ transform: `rotate(${(i - 1) * 7}deg) translateY(${i * -2}px)` }}>
                      <FileIcon category={e.category} ext={e.ext} size={44} />
                    </span>
                  ))}
                </div>
              </div>
              <div className="dp-title">{plural(selected.length, 'item selecionado', 'itens selecionados')}</div>
              <div className="dp-props">
                <Row label="Arquivos">{formatBytes(multiInfo.size)}</Row>
                {multiInfo.folders ? <Row label="Pastas">{plural(multiInfo.folders, 'pasta', 'pastas')} (tamanho não incluído)</Row> : null}
                <Row label="Tipos">
                  <div className="stack" style={{ gap: 2 }}>
                    {multiInfo.types.map(([t, n]) => (
                      <span key={t}>
                        {t} <span className="faint">· {formatNumber(n)}</span>
                      </span>
                    ))}
                  </div>
                </Row>
              </div>
            </>
          ) : folderPath ? (
            <>
              <div className="dp-preview">
                <FileIcon category="folder" size={88} special={specialOf(folderPath)} />
              </div>
              <div className="dp-title selectable">{basename(folderPath)}</div>
              <div className="dp-sub">Pasta atual</div>
              <div className="dp-props">
                <Row label="Conteúdo">
                  {plural(folderInfo.files, 'arquivo', 'arquivos')}, {plural(folderInfo.folders, 'pasta', 'pastas')}
                </Row>
                <Row label="Arquivos">{formatBytes(folderInfo.size)}</Row>
                <Row label="Tamanho total">
                  <FolderSize path={folderPath} />
                </Row>
                <Row label="Local">{folderPath}</Row>
              </div>
              <div className="dp-hint">Selecione um item para ver os detalhes e a pré-visualização.</div>
            </>
          ) : (
            <div className="dp-hint" style={{ marginTop: 24 }}>
              Selecione uma unidade ou pasta para ver os detalhes.
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </aside>
  );
}
