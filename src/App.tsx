import { useEffect, type ComponentType } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { Titlebar } from './components/layout/Titlebar';
import { Sidebar } from './components/layout/Sidebar';
import { MenuHost } from './components/ui/Menu';
import { DialogHost } from './components/ui/Modal';
import { ToastHost } from './components/ui/ToastHost';
import { TooltipHost } from './components/ui/TooltipHost';
import { CommandPalette, useCommandPalette } from './components/CommandPalette';
import { useNav, type PageId } from './store/nav';
import { useSettings } from './store/settings';
import { applyAppearance, resolveMotion, watchSystemAppearance } from './lib/theme';
import { showWindow } from './lib/platform';
import { Placeholder } from './pages/Placeholder';
import { Inicio } from './pages/Inicio';
import { Explorer } from './pages/explorer/Explorer';
import { Organizer } from './pages/organizer/Organizer';
import { DragLayer } from './components/DragLayer';
import { TasksPanel } from './components/TasksPanel';
import { wireTaskProgress } from './store/tasks';
import { usePlaceCommands, useProtectedSync } from './lib/appHooks';

// Atalho usado pelos testes visuais no navegador (somente em desenvolvimento).
if (import.meta.env.DEV) (window as unknown as { __go: typeof useNav.getState extends () => infer S ? S extends { go: infer G } ? G : never : never }).__go = useNav.getState().go;

const PAGES: Record<PageId, ComponentType> = {
  inicio: Inicio,
  explorador: Explorer,
  organizador: Organizer,
  duplicados: () => <Placeholder icon="copies" title="Duplicados" />,
  mapa: () => <Placeholder icon="treemap" title="Mapa de espaço" />,
  regras: () => <Placeholder icon="wand" title="Regras automáticas" />,
  otimizar: () => <Placeholder icon="bolt" title="One Click Optimize" />,
  limpeza: () => <Placeholder icon="broom" title="Limpeza" />,
  saude: () => <Placeholder icon="heart-pulse" title="Saúde do PC" />,
  inicializacao: () => <Placeholder icon="rocket" title="Inicialização e apps" />,
  historico: () => <Placeholder icon="history" title="Histórico" />,
  configuracoes: () => <Placeholder icon="settings" title="Configurações" />,
};

const pageVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] as const } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.12, ease: [0.65, 0, 0.35, 1] as const } },
};

export default function App() {
  const page = useNav((s) => s.page);
  const theme = useSettings((s) => s.theme);
  const motionPref = useSettings((s) => s.motion);
  const density = useSettings((s) => s.density);
  const collapsed = useSettings((s) => s.sidebarCollapsed);

  useEffect(() => {
    applyAppearance(theme, motionPref, density);
    return watchSystemAppearance(() => applyAppearance(theme, motionPref, density));
  }, [theme, motionPref, density]);

  // Mostra a janela só depois do primeiro desenho (sem tela branca).
  useEffect(() => {
    wireTaskProgress();
    requestAnimationFrame(() => void showWindow());
  }, []);

  usePlaceCommands();
  useProtectedSync();

  // Atalhos globais e bloqueio de comportamentos de navegador.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        useCommandPalette.getState().setOpen(!useCommandPalette.getState().open);
        return;
      }
      if (e.key === 'F5' || e.key === 'F7' || (ctrl && ['r', 'p', 'u', 'g', 'j', 's', 'o'].includes(e.key.toLowerCase()))) {
        e.preventDefault();
      }
      if (ctrl && e.key === ',') {
        e.preventDefault();
        useNav.getState().go('configuracoes');
      }
    };
    const onContext = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('input, textarea, .selectable')) e.preventDefault();
    };
    const onDragStart = (e: DragEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'IMG' || t.tagName === 'A') e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('contextmenu', onContext);
    window.addEventListener('dragstart', onDragStart);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('contextmenu', onContext);
      window.removeEventListener('dragstart', onDragStart);
    };
  }, []);

  const Page = PAGES[page];
  const reduced = resolveMotion(motionPref) !== 'completa';

  return (
    <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>
      <div className={`app-shell ${collapsed ? 'collapsed' : ''}`}>
        <Titlebar />
        <Sidebar />
        <main className="main">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={page} className="page" variants={pageVariants} initial="initial" animate="animate" exit="exit">
              <Page />
            </motion.div>
          </AnimatePresence>
          <TasksPanel />
        </main>
      </div>
      <MenuHost />
      <DialogHost />
      <CommandPalette />
      <ToastHost />
      <TooltipHost />
      <DragLayer />
    </MotionConfig>
  );
}
