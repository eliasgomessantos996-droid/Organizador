import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Icon, type IconName } from './Icon';
import { ProgressBar } from './ui/controls';
import { useTasks } from '../store/tasks';
import { formatBytes, formatElapsed, formatNumber } from '../lib/format';

/** Cartão animado de progresso de uma varredura (Organizador, Duplicados, Mapa). */
export function ScanProgress({ taskId, title, icon = 'scan', onCancel }: { taskId: string | null; title: string; icon?: IconName; onCancel: () => void }) {
  const task = useTasks((s) => s.tasks.find((t) => t.id === taskId));
  const [start] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, []);
  const pct = task && task.bytesTotal ? task.bytesDone / task.bytesTotal : task && task.total ? task.done / task.total : undefined;
  return (
    <motion.div className="card scan-progress" initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}>
      <div className="scan-orb">
        <span className="scan-orb-ring" />
        <span className="scan-orb-ring delay" />
        <Icon name={icon} size={30} className="playing" />
      </div>
      <div className="scan-title">{title}</div>
      <div className="scan-phase">{task?.phase || 'Preparando…'}</div>
      <div className="scan-stats">
        <div>
          <div className="stat-value tabular">{formatNumber(task?.done ?? 0)}</div>
          <div className="stat-label">{task?.total ? `de ${formatNumber(task.total)}` : 'arquivos'}</div>
        </div>
        <div>
          <div className="stat-value tabular">{formatBytes(task?.bytesDone ?? 0)}</div>
          <div className="stat-label">{task?.bytesTotal ? `de ${formatBytes(task.bytesTotal)}` : 'lidos'}</div>
        </div>
        <div>
          <div className="stat-value tabular">{formatElapsed(now - start)}</div>
          <div className="stat-label">tempo</div>
        </div>
      </div>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <ProgressBar value={pct} indeterminate={pct === undefined} />
      </div>
      <div className="scan-current truncate">{task?.current || ' '}</div>
      <button type="button" className="btn" onClick={onCancel} disabled={task?.cancelling}>
        <Icon name="stop" size={14} />
        {task?.cancelling ? 'Cancelando…' : 'Cancelar'}
      </button>
    </motion.div>
  );
}
