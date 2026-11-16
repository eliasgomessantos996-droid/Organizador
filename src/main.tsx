import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/plus-jakarta-sans';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/layout.css';
import './styles/icons.css';
import './styles/brand.css';
import './styles/pages/home.css';
import './styles/filetable.css';
import './styles/pages/explorer.css';
import './styles/pages/organizer.css';
import './styles/pages/health.css';
import { useSettings } from './store/settings';
import { applyAppearance } from './lib/theme';
import App from './App';

// Aplica o tema salvo antes do primeiro desenho (evita piscar a tela).
const s = useSettings.getState();
applyAppearance(s.theme, s.motion, s.density);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
