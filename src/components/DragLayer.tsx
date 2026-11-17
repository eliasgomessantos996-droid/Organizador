import { AnimatePresence, motion } from 'motion/react';
import { useDrag } from '../lib/dnd';
import { FileIcon } from './FileIcon';
import { Icon } from './Icon';

/** "Fantasma" que acompanha o cursor durante um arraste. */
export function DragLayer() {
  const d = useDrag();
  return (
    <AnimatePresence>
      {d.active ? (
        <motion.div
          className="drag-ghost"
          style={{ left: d.x + 14, top: d.y + 16 }}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.1 } }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        >
          <div className="drag-ghost-stack">
            {d.count > 1 ? <span className="drag-ghost-card back" /> : null}
            <span className="drag-ghost-card">
              <FileIcon category={d.category} size={26} />
            </span>
            {d.count > 1 ? <span className="drag-ghost-count">{d.count}</span> : null}
          </div>
          <div className="drag-ghost-text">
            <div className="truncate" style={{ fontWeight: 650 }}>
              {d.count > 1 ? `${d.count} itens` : d.firstName}
            </div>
            <div className="drag-ghost-hint">
              {d.targetName ? (
                <>
                  <Icon name={d.copy ? 'copy' : 'arrow-right'} size={13} />
                  {d.copy ? 'Copiar para' : 'Mover para'} “{d.targetName}”
                </>
              ) : (
                'Solte sobre uma pasta · Ctrl copia'
              )}
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
