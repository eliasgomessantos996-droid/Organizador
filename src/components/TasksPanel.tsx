import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useTasks } from '../store/tasks';
import { Icon } from './Icon';
import { ProgressBar } from './ui/controls';
import { formatBytes, formatNumber } from '../lib/format';

/** Operações em andamento (copiar, mover, excluir, analisar...). */
export function TasksPanel() {
  const tasks = useTasks((s) => s.tasks);
  const cancel = useTasks((s) => s.cancel);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!tasks.length) return;
    const t = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(t);
  }, [tasks.length]);

  // Só mostra operações que demoram (evita piscar em ações rápidas).
  const visible = tasks.filter((t) => now - t.started > 350);

  return (
    <div className="tasks-panel">
      <AnimatePresence>
        {visible.map((t) => {
          const pct = t.bytesTotal > 0 ? t.bytesDone / t.bytesTotal : t.total > 0 ? t.done / t.total : undefined;
          return (
            <motion.div
              key={t.id}
              layout
              className="task-card"
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, transition: { duration: 0.15 } }}
            >
              <div className="row" style={{ gap: 10 }}>
                <div className="task-icon anim-hover">
                  <Icon name={t.icon} size={16} className="playing" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="truncate" style={{ fontWeight: 650, fontSize: 13 }}>
                    {t.title}
                  </div>
                  <div className="truncate faint" style={{ fontSize: 12 }}>
                    {t.cancelling
                      ? 'Cancelando…'
                      : [
                          t.phase,
                          t.total ? `${formatNumber(t.done)} de ${formatNumber(t.total)}` : t.done ? formatNumber(t.done) : '',
                          t.bytesTotal ? `${formatBytes(t.bytesDone)} de ${formatBytes(t.bytesTotal)}` : t.bytesDone ? formatBytes(t.bytesDone) : '',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                  </div>
                </div>
                {t.cancellable ? (
                  <button type="button" className="icon-btn icon-btn-sm" onClick={() => cancel(t.id)} disabled={t.cancelling} data-tip="Cancelar">
                    <Icon name="x" size={14} />
                  </button>
                ) : null}
              </div>
              <div style={{ marginTop: 10 }}>
                <ProgressBar value={pct} indeterminate={pct === undefined} height={5} />
              </div>
              {t.current ? (
                <div className="truncate faint" style={{ fontSize: 11.5, marginTop: 6 }}>
                  {t.current}
                </div>
              ) : null}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
