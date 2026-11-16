import { AnimatePresence, motion } from 'motion/react';
import { useToasts } from '../../store/toasts';
import { Icon, type IconName } from '../Icon';

const ICON: Record<string, IconName> = {
  info: 'info',
  good: 'check-circle',
  warning: 'alert-triangle',
  critical: 'x-circle',
};

/** Notificações no canto inferior direito, com barra de tempo. */
export function ToastHost() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div className="toast-host" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            className="toast"
            role={t.kind === 'critical' ? 'alert' : 'status'}
            initial={{ opacity: 0, x: 40, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, transition: { duration: 0.16 } }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          >
            <div className={`toast-icon ${t.kind}`}>
              <Icon name={ICON[t.kind]} size={17} className={t.kind === 'good' ? 'draw' : undefined} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="toast-title">{t.title}</div>
              {t.text ? <div className="toast-text">{t.text}</div> : null}
              {t.action ? (
                <button
                  type="button"
                  className="btn btn-soft btn-sm"
                  style={{ marginTop: 8 }}
                  onClick={() => {
                    t.action?.run();
                    dismiss(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              ) : null}
            </div>
            <button type="button" className="icon-btn icon-btn-sm" onClick={() => dismiss(t.id)} aria-label="Fechar notificação">
              <Icon name="x" size={14} />
            </button>
            <motion.div
              className="toast-progress"
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: t.duration / 1000, ease: 'linear' }}
              style={{ width: '100%' }}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
