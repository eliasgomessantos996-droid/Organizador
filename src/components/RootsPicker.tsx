import { AnimatePresence, motion } from 'motion/react';
import { FileIcon } from './FileIcon';
import { Icon } from './Icon';
import { basename } from '../lib/format';
import { pickFolders } from '../lib/fileops';
import { quickPlaces, specialOf, usePlaces } from '../store/places';

/** Seleção de pastas para analisar: fichas removíveis + sugestões rápidas. */
export function RootsPicker({ roots, onAdd, onRemove, disabled }: { roots: string[]; onAdd: (paths: string[]) => void; onRemove: (p: string) => void; disabled?: boolean }) {
  const special = usePlaces((s) => s.special);
  const drives = usePlaces((s) => s.drives);
  const suggestions = [
    ...quickPlaces(special).map((q) => ({ path: q.path, label: q.label })),
    ...(special?.home ? [{ path: special.home, label: 'Pasta pessoal' }] : []),
    ...drives.map((d) => ({ path: d.mount, label: `Unidade ${d.mount.replace(/\\$/, '')}` })),
  ].filter((s) => !roots.includes(s.path));

  return (
    <div className="roots-picker">
      <div className="roots-chips">
        <AnimatePresence initial={false}>
          {roots.map((r) => (
            <motion.span key={r} className="root-chip" layout initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.85 }} data-tip={r}>
              <FileIcon category="folder" size={18} special={specialOf(r)} />
              <span className="truncate">{basename(r)}</span>
              <button type="button" className="chip-remove" onClick={() => onRemove(r)} disabled={disabled} aria-label={`Remover ${basename(r)}`}>
                <Icon name="x" size={12} />
              </button>
            </motion.span>
          ))}
        </AnimatePresence>
        <button type="button" className="btn btn-sm btn-soft" disabled={disabled} onClick={async () => onAdd(await pickFolders('Escolha as pastas'))}>
          <Icon name="folder-plus" size={15} />
          Adicionar pasta
        </button>
      </div>
      {suggestions.length ? (
        <div className="roots-suggest">
          <span className="faint" style={{ fontSize: 12 }}>
            Sugestões:
          </span>
          {suggestions.slice(0, 8).map((s) => (
            <button key={s.path} type="button" className="chip" disabled={disabled} onClick={() => onAdd([s.path])}>
              <Icon name="plus" size={12} />
              {s.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
