import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

/**
 * Dicas globais: qualquer elemento com `data-tip="texto"` mostra a dica
 * após uma pequena espera. Também usa `aria-label` como alternativa acessível.
 */
export function TooltipHost() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number; below: boolean } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const current = useRef<Element | null>(null);

  useEffect(() => {
    const hide = () => {
      window.clearTimeout(timer.current);
      current.current = null;
      setTip(null);
    };
    const onOver = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.('[data-tip]');
      if (el === current.current) return;
      hide();
      if (!el) return;
      const text = el.getAttribute('data-tip');
      if (!text) return;
      current.current = el;
      timer.current = window.setTimeout(() => {
        const r = el.getBoundingClientRect();
        const below = r.top < 60 || el.getAttribute('data-tip-pos') === 'below';
        setTip({ text, x: r.left + r.width / 2, y: below ? r.bottom + 8 : r.top - 8, below });
      }, 450);
    };
    window.addEventListener('pointerover', onOver);
    window.addEventListener('pointerdown', hide, true);
    window.addEventListener('wheel', hide, { passive: true });
    window.addEventListener('keydown', hide, true);
    window.addEventListener('blur', hide);
    return () => {
      window.removeEventListener('pointerover', onOver);
      window.removeEventListener('pointerdown', hide, true);
      window.removeEventListener('wheel', hide);
      window.removeEventListener('keydown', hide, true);
      window.removeEventListener('blur', hide);
    };
  }, []);

  return (
    <AnimatePresence>
      {tip ? (
        <motion.div
          key={`${tip.x}-${tip.y}`}
          className="tooltip"
          role="tooltip"
          initial={{ opacity: 0, y: tip.below ? -3 : 3 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          style={{
            left: Math.min(Math.max(8, tip.x), window.innerWidth - 8),
            top: tip.y,
            translateX: '-50%',
            translateY: tip.below ? '0%' : '-100%',
          }}
        >
          {tip.text}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
