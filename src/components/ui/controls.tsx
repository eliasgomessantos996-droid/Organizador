import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { Icon, type IconName } from '../Icon';

const spring = { type: 'spring' as const, stiffness: 520, damping: 40, mass: 0.8 };

/* ───────────── Interruptor ───────────── */
export function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="toggle"
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  );
}

/* ───────────── Caixa de seleção ───────────── */
export function Checkbox({
  checked,
  indeterminate,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (v: boolean, e: React.MouseEvent) => void;
  label?: string;
  disabled?: boolean;
}) {
  const state = indeterminate ? 'mixed' : checked ? 'true' : 'false';
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state}
      aria-label={label}
      className="checkbox"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked, e);
      }}
    >
      {indeterminate ? <Icon name="minus" size={12} strokeWidth={3} /> : checked ? <Icon name="check" size={12} strokeWidth={3} /> : null}
    </button>
  );
}

/* ───────────── Controle segmentado ───────────── */
export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: IconName;
  tip?: string;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size,
}: {
  value: T;
  options: SegmentOption<T>[];
  onChange: (v: T) => void;
  size?: 'sm';
}) {
  const id = useId();
  return (
    <div className="segmented" role="radiogroup" style={size === 'sm' ? { ['--control-h' as string]: '30px' } : undefined}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={`segmented-item ${value === o.value ? 'active' : ''}`}
          onClick={() => onChange(o.value)}
          data-tip={o.tip}
        >
          {value === o.value ? <motion.span layoutId={`seg-${id}`} className="segmented-pill" transition={spring} /> : null}
          {o.icon ? <Icon name={o.icon} size={15} /> : null}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ───────────── Abas ───────────── */
export interface TabOption<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
  badge?: ReactNode;
}

export function Tabs<T extends string>({ value, options, onChange }: { value: T; options: TabOption<T>[]; onChange: (v: T) => void }) {
  const id = useId();
  return (
    <div className="tabs" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          className={`tab anim-hover ${value === o.value ? 'active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.icon ? <Icon name={o.icon} size={16} /> : null}
          {o.label}
          {o.badge !== undefined && o.badge !== null ? <span className="badge">{o.badge}</span> : null}
          {value === o.value ? <motion.span layoutId={`tab-${id}`} className="tab-underline" transition={spring} /> : null}
        </button>
      ))}
    </div>
  );
}

/* ───────────── Campo de busca ───────────── */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Pesquisar…',
  autoFocus,
  inputRef,
  onKeyDown,
  small,
  width,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  small?: boolean;
  width?: number | string;
}) {
  return (
    <div className="input-group" style={{ width }}>
      <Icon name="search" size={15} />
      <input
        ref={inputRef}
        className={`input ${small ? 'input-sm' : ''}`}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.stopPropagation();
            onChange('');
          }
          onKeyDown?.(e);
        }}
      />
      {value ? (
        <button type="button" className="icon-btn icon-btn-sm input-clear" onClick={() => onChange('')} aria-label="Limpar pesquisa">
          <Icon name="x" size={14} />
        </button>
      ) : null}
    </div>
  );
}

/* ───────────── Progresso ───────────── */
export function ProgressBar({ value, indeterminate, height }: { value?: number; indeterminate?: boolean; height?: number }) {
  const pct = Math.max(0, Math.min(1, value ?? 0)) * 100;
  return (
    <div
      className={`progress ${indeterminate ? 'indeterminate' : ''}`}
      style={height ? { height } : undefined}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(pct)}
    >
      <div className="progress-fill" style={indeterminate ? undefined : { width: `${pct}%` }} />
    </div>
  );
}

/** Medidor: uma razão contra um limite (trilho da mesma rampa). */
export function Meter({ value, color, height = 6, label }: { value: number; color?: string; height?: number; label?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="meter" style={{ height }} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={label}>
      <div className="meter-fill" style={{ width: `${Math.max(pct, pct > 0 ? 1.5 : 0)}%`, background: color }} />
    </div>
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="spin-keep" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/* ───────────── Estado vazio ───────────── */
export function EmptyState({
  icon,
  title,
  text,
  children,
  art,
}: {
  icon?: IconName;
  title: string;
  text?: ReactNode;
  children?: ReactNode;
  art?: ReactNode;
}) {
  return (
    <div className="empty">
      {art ?? (
        <div className="empty-art">
          <Icon name={icon ?? 'folder'} size={34} strokeWidth={1.6} />
        </div>
      )}
      <div className="empty-title">{title}</div>
      {text ? <div className="empty-text">{text}</div> : null}
      {children ? <div className="row" style={{ marginTop: 6 }}>{children}</div> : null}
    </div>
  );
}

/* ───────────── Número animado ───────────── */
function prefersNoMotion() {
  const m = document.documentElement.dataset.motion;
  return m === 'desligada' || m === 'reduzida';
}

/** Conta do valor anterior até o novo (contadores de espaço liberado, nota de saúde...). */
export function AnimatedNumber({
  value,
  format = (v) => Math.round(v).toLocaleString('pt-BR'),
  duration = 800,
}: {
  value: number;
  format?: (v: number) => string;
  duration?: number;
}) {
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);
  useEffect(() => {
    const from = fromRef.current;
    if (from === value || prefersNoMotion()) {
      fromRef.current = value;
      setShown(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = from + (value - from) * eased;
      fromRef.current = v;
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{format(shown)}</>;
}

/* ───────────── Bloco de estatística ───────────── */
export function StatTile({
  icon,
  label,
  value,
  sub,
  tone,
  children,
  onClick,
}: {
  icon: IconName;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'accent' | 'good' | 'warning' | 'critical' | 'info';
  children?: ReactNode;
  onClick?: () => void;
}) {
  const toneStyle =
    tone === 'good'
      ? { background: 'var(--success-soft)', color: 'var(--success-text)' }
      : tone === 'warning'
        ? { background: 'var(--warning-soft)', color: 'var(--warning-text)' }
        : tone === 'critical'
          ? { background: 'var(--danger-soft)', color: 'var(--danger)' }
          : tone === 'info'
            ? { background: 'var(--info-soft)', color: 'var(--info)' }
            : undefined;
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={`card card-pad stat-tile anim-hover ${onClick ? 'card-hover clickable' : ''}`} onClick={onClick}>
      <div className="row" style={{ gap: 12 }}>
        <div className="icon-tile" style={toneStyle}>
          <Icon name={icon} size={19} />
        </div>
        <div className="stack" style={{ gap: 2, minWidth: 0 }}>
          <div className="stat-label truncate">{label}</div>
          <div className="stat-value truncate">{value}</div>
        </div>
      </div>
      {sub ? <div className="stat-sub" style={{ marginTop: 10 }}>{sub}</div> : null}
      {children}
    </Tag>
  );
}
