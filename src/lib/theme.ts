/** Temas disponíveis e aplicação das preferências de aparência no <html>. */

export type ThemeId =
  | 'sistema'
  | 'claro'
  | 'escuro'
  | 'oceano'
  | 'floresta'
  | 'por-do-sol'
  | 'lavanda'
  | 'grafite'
  | 'alto-contraste';

export type ConcreteTheme = Exclude<ThemeId, 'sistema'>;
export type MotionPref = 'auto' | 'completa' | 'reduzida' | 'desligada';
export type Density = 'confortavel' | 'compacta';

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  description: string;
  /** Cores para a miniatura do seletor de temas. */
  preview: { bg: string; surface: string; text: string; accent: string; accent2: string; dark: boolean };
}

export const THEMES: ThemeMeta[] = [
  {
    id: 'sistema',
    name: 'Sistema',
    description: 'Segue o modo claro/escuro do Windows',
    preview: { bg: '#e9eef5', surface: '#141b28', text: '#0e1726', accent: '#2dd4bf', accent2: '#818cf8', dark: false },
  },
  {
    id: 'claro',
    name: 'Claro',
    description: 'Limpo e luminoso',
    preview: { bg: '#e9eef5', surface: '#ffffff', text: '#0e1726', accent: '#0d857a', accent2: '#4f46e5', dark: false },
  },
  {
    id: 'escuro',
    name: 'Escuro',
    description: 'Confortável para os olhos',
    preview: { bg: '#07090f', surface: '#141b28', text: '#e8edf6', accent: '#2dd4bf', accent2: '#818cf8', dark: true },
  },
  {
    id: 'oceano',
    name: 'Oceano',
    description: 'Azuis profundos e ciano',
    preview: { bg: '#030d17', surface: '#0a2033', text: '#e4f3ff', accent: '#38bdf8', accent2: '#22d3ee', dark: true },
  },
  {
    id: 'floresta',
    name: 'Floresta',
    description: 'Verdes calmos',
    preview: { bg: '#050b08', surface: '#0f1f17', text: '#e7f5ec', accent: '#34d399', accent2: '#a3e635', dark: true },
  },
  {
    id: 'por-do-sol',
    name: 'Pôr do sol',
    description: 'Laranja e rosa quentes',
    preview: { bg: '#0d080b', surface: '#20151b', text: '#fbeff3', accent: '#fb923c', accent2: '#f472b6', dark: true },
  },
  {
    id: 'lavanda',
    name: 'Lavanda',
    description: 'Claro com toques violeta',
    preview: { bg: '#ebe6fa', surface: '#ffffff', text: '#1c1530', accent: '#7c3aed', accent2: '#db2777', dark: false },
  },
  {
    id: 'grafite',
    name: 'Grafite',
    description: 'Neutro com âmbar',
    preview: { bg: '#0a0a0b', surface: '#18181b', text: '#ececef', accent: '#fbbf24', accent2: '#f97316', dark: true },
  },
  {
    id: 'alto-contraste',
    name: 'Alto contraste',
    description: 'Máxima legibilidade',
    preview: { bg: '#000000', surface: '#000000', text: '#ffffff', accent: '#ffd400', accent2: '#ffd400', dark: true },
  },
];

const darkQuery = () => window.matchMedia?.('(prefers-color-scheme: dark)');
const motionQuery = () => window.matchMedia?.('(prefers-reduced-motion: reduce)');

export function resolveTheme(id: ThemeId): ConcreteTheme {
  if (id !== 'sistema') return id;
  return darkQuery()?.matches ? 'escuro' : 'claro';
}

export function resolveMotion(pref: MotionPref): Exclude<MotionPref, 'auto'> {
  if (pref !== 'auto') return pref;
  return motionQuery()?.matches ? 'reduzida' : 'completa';
}

export function isDarkTheme(id: ConcreteTheme): boolean {
  return THEMES.find((t) => t.id === id)?.preview.dark ?? true;
}

export function applyAppearance(theme: ThemeId, motion: MotionPref, density: Density): void {
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(theme);
  root.dataset.motion = resolveMotion(motion);
  root.dataset.density = density;
}

/** Reaplica a aparência quando o Windows muda de tema ou de preferência de movimento. */
export function watchSystemAppearance(onChange: () => void): () => void {
  const qs = [darkQuery(), motionQuery()].filter(Boolean) as MediaQueryList[];
  qs.forEach((q) => q.addEventListener('change', onChange));
  return () => qs.forEach((q) => q.removeEventListener('change', onChange));
}
