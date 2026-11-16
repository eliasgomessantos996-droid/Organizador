import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { openDropdown, type MenuEntry } from '../../components/ui/Menu';
import { api } from '../../lib/api';
import { compareNames } from '../../lib/filters';
import { pathCrumbs, samePath } from '../../lib/format';
import { quickPlaces, usePlaces } from '../../store/places';
import { useSettings } from '../../store/settings';
import { toast } from '../../store/toasts';
import { driveLabel } from './NavPane';

/** Barra de endereço: trilha clicável que vira um campo de texto ao clicar no espaço vazio. */
export function AddressBar({ path, onNavigate }: { path: string; onNavigate: (p: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(path);
  const inputRef = useRef<HTMLInputElement>(null);
  const drives = usePlaces((s) => s.drives);
  const showHidden = useSettings((s) => s.showHidden);

  useEffect(() => {
    const onEdit = () => {
      setText(path);
      setEditing(true);
    };
    window.addEventListener('explorer:edit-address', onEdit);
    return () => window.removeEventListener('explorer:edit-address', onEdit);
  }, [path]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const submit = async () => {
    const t = text.trim().replace(/^"|"$/g, '');
    setEditing(false);
    if (!t || samePath(t, path)) return;
    if (/^este computador$/i.test(t)) return onNavigate('');
    if (await api.isDir(t).catch(() => false)) onNavigate(t);
    else toast.error('Pasta não encontrada', `Verifique o endereço “${t}”.`);
  };

  const subfolderMenu = async (el: HTMLElement, dir: string) => {
    try {
      const list = await api.listDir(dir, showHidden);
      const dirs = list.filter((e) => e.isDir).sort((a, b) => compareNames(a.name, b.name));
      const items: MenuEntry[] = dirs.length
        ? dirs.slice(0, 60).map((d) => ({ label: d.name, icon: 'folder' as const, onSelect: () => onNavigate(d.path) }))
        : [{ label: 'Nenhuma subpasta', disabled: true }];
      if (dirs.length > 60) items.push({ separator: true }, { label: `e mais ${dirs.length - 60}…`, disabled: true });
      openDropdown(el, items);
    } catch {
      /* pasta inacessível */
    }
  };

  const drivesMenu = (el: HTMLElement) =>
    openDropdown(
      el,
      drives.map((d) => ({ label: driveLabel(d), icon: d.removable ? ('usb' as const) : ('hard-drive' as const), onSelect: () => onNavigate(d.mount) })),
    );

  const crumbs = pathCrumbs(path);

  if (editing) {
    return (
      <div className="address-bar editing">
        <Icon name="folder" size={16} />
        <input
          ref={inputRef}
          className="address-input"
          value={text}
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') void submit();
            if (e.key === 'Escape') setEditing(false);
          }}
          onBlur={() => setEditing(false)}
          placeholder="Digite um caminho, como C:\Users"
        />
      </div>
    );
  }

  return (
    <div
      className="address-bar"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          setText(path);
          setEditing(true);
        }
      }}
    >
      <button type="button" className="crumb" onClick={() => onNavigate('')}>
        <Icon name="monitor" size={15} />
        {crumbs.length === 0 ? <span>Este computador</span> : null}
      </button>
      <button type="button" className="crumb-sep" onClick={(e) => drivesMenu(e.currentTarget)} aria-label="Unidades">
        <Icon name="chevron-right" size={13} />
      </button>
      {crumbs.map((c, i) => {
        const isRoot = i === 0;
        const drive = isRoot ? drives.find((d) => samePath(d.mount, c.path)) : undefined;
        const quick = quickPlaces(usePlaces.getState().special).find((q) => samePath(q.path, c.path));
        const label = drive ? driveLabel(drive) : (quick?.label ?? c.label);
        return (
          <span key={c.path} className="crumb-wrap">
            <button type="button" className={`crumb ${i === crumbs.length - 1 ? 'current' : ''}`} onClick={() => onNavigate(c.path)}>
              <span className="truncate">{label}</span>
            </button>
            <button type="button" className="crumb-sep" onClick={(e) => void subfolderMenu(e.currentTarget, c.path)} aria-label={`Subpastas de ${label}`}>
              <Icon name="chevron-right" size={13} />
            </button>
          </span>
        );
      })}
    </div>
  );
}
