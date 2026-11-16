import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Icon, type IconName } from '../Icon';
import { useDialogs } from '../../store/dialogs';
import { Checkbox } from './controls';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: 'normal' | 'wide' | 'xwide';
  /** Impede fechar clicando fora (ex.: durante uma operação). */
  locked?: boolean;
  labelledBy?: string;
}

/** Janela modal com animação de entrada e foco preso no conteúdo. */
export function Modal({ open, onClose, children, width = 'normal', locked, labelledBy }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => {
      const root = ref.current;
      const el =
        root?.querySelector<HTMLElement>('[data-autofocus]') ?? root?.querySelector<HTMLElement>('input, textarea, button:not(:disabled)');
      el?.focus();
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !locked) {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab' && ref.current) {
        const f = Array.from(ref.current.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, select, [tabindex="0"]'));
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey, true);
      prev?.focus?.();
    };
  }, [open, locked, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="dialog-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !locked) onClose();
          }}
        >
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            className={`dialog ${width === 'wide' ? 'dialog-wide' : width === 'xwide' ? 'dialog-xwide' : ''}`}
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          >
            {children}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function DialogHeader({ icon, tone, title, text, id }: { icon?: IconName; tone?: 'danger' | 'warning'; title: ReactNode; text?: ReactNode; id?: string }) {
  return (
    <div className="dialog-head">
      {icon ? (
        <div className={`dialog-icon anim-hover ${tone ?? ''}`}>
          <Icon name={icon} size={21} className="playing" />
        </div>
      ) : null}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="dialog-title" id={id}>
          {title}
        </div>
        {text ? <div className="dialog-text">{text}</div> : null}
      </div>
    </div>
  );
}

/** Renderiza os diálogos de confirmação e de texto pedidos via store. */
export function DialogHost() {
  const current = useDialogs((s) => s.current);
  const close = useDialogs((s) => s.close);
  const [value, setValue] = useState('');
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (current?.kind === 'prompt') {
      setValue(current.options.initial ?? '');
      setError(null);
      const sel = current.options.selectBaseName;
      window.setTimeout(() => {
        const el = inputRef.current;
        if (!el) return;
        el.focus();
        const v = el.value;
        const dot = v.lastIndexOf('.');
        if (sel && dot > 0) el.setSelectionRange(0, dot);
        else el.select();
      }, 60);
    }
    setChecked(false);
  }, [current]);

  const finish = (ok: boolean) => {
    if (!current) return;
    if (current.kind === 'choose') {
      current.resolve(null);
    } else if (current.kind === 'confirm') {
      current.resolve({ ok, checked });
    } else {
      if (ok) {
        const v = value.trim();
        const err = current.options.validate?.(v) ?? (v ? null : 'Digite um nome.');
        if (err) {
          setError(err);
          return;
        }
        current.resolve(v);
      } else current.resolve(null);
    }
    close();
  };

  const o = current?.options;
  const tone = current?.kind === 'confirm' || current?.kind === 'choose' ? current.options.tone : undefined;

  if (current?.kind === 'choose') {
    const c = current.options;
    return (
      <Modal open onClose={() => finish(false)} labelledBy="dlg-title">
        <div className="dialog-body">
          <DialogHeader id="dlg-title" icon={c.icon ?? 'info'} tone={c.tone === 'danger' ? 'danger' : c.tone === 'warning' ? 'warning' : undefined} title={c.title} text={c.text} />
          {c.details?.length ? (
            <div className="dialog-details selectable">
              {c.details.slice(0, 6).map((d) => (
                <div key={d} className="truncate">
                  {d}
                </div>
              ))}
              {c.details.length > 6 ? <div className="faint">e mais {c.details.length - 6}…</div> : null}
            </div>
          ) : null}
          <div className="choose-list">
            {c.options.map((op) => (
              <button
                key={op.id}
                type="button"
                className={`choose-item ${op.tone === 'danger' ? 'danger' : ''} ${op.tone === 'primary' ? 'primary' : ''}`}
                data-autofocus={op.tone === 'primary' ? true : undefined}
                onClick={() => {
                  current.resolve(op.id);
                  close();
                }}
              >
                <span className="choose-label">{op.label}</span>
                {op.description ? <span className="choose-desc">{op.description}</span> : null}
              </button>
            ))}
          </div>
        </div>
        <div className="dialog-footer">
          <button type="button" className="btn" onClick={() => finish(false)}>
            Cancelar
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={!!current} onClose={() => finish(false)} labelledBy="dlg-title">
      {current && o ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            finish(true);
          }}
        >
          <div className="dialog-body">
            <DialogHeader
              id="dlg-title"
              icon={o.icon ?? (tone === 'danger' ? 'trash' : tone === 'warning' ? 'alert-triangle' : current.kind === 'prompt' ? 'pencil' : 'info')}
              tone={tone === 'danger' ? 'danger' : tone === 'warning' ? 'warning' : undefined}
              title={o.title}
              text={o.text}
            />
            {current.kind === 'confirm' && current.options.details?.length ? (
              <div className="dialog-details selectable">
                {current.options.details.slice(0, 8).map((d) => (
                  <div key={d} className="truncate">
                    {d}
                  </div>
                ))}
                {current.options.details.length > 8 ? <div className="faint">e mais {current.options.details.length - 8}…</div> : null}
              </div>
            ) : null}
            {current.kind === 'confirm' && current.options.checkbox ? (
              <label className="row" style={{ marginTop: 14, cursor: 'pointer' }}>
                <Checkbox checked={checked} onChange={setChecked} />
                <span className="muted" onClick={() => setChecked(!checked)}>
                  {current.options.checkbox}
                </span>
              </label>
            ) : null}
            {current.kind === 'prompt' ? (
              <div className="field" style={{ marginTop: 16 }}>
                {current.options.label ? <label className="field-label">{current.options.label}</label> : null}
                <input
                  ref={inputRef}
                  className="input"
                  value={value}
                  placeholder={current.options.placeholder}
                  spellCheck={false}
                  onChange={(e) => {
                    setValue(e.target.value);
                    setError(null);
                  }}
                />
                {error ? <div className="field-hint text-danger">{error}</div> : null}
              </div>
            ) : null}
          </div>
          <div className="dialog-footer">
            <button type="button" className="btn" onClick={() => finish(false)}>
              {current.kind === 'confirm' ? (current.options.cancelLabel ?? 'Cancelar') : 'Cancelar'}
            </button>
            <button type="submit" className={`btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}`} data-autofocus>
              {('confirmLabel' in o ? o.confirmLabel : undefined) ?? (current.kind === 'prompt' ? 'Salvar' : 'Confirmar')}
            </button>
          </div>
        </form>
      ) : null}
    </Modal>
  );
}
