import type { CSSProperties, ReactNode } from 'react';

/**
 * Conjunto de ícones próprio do Organizador.
 * Grade 24×24, traço de 1,75 px, cantos arredondados.
 * Algumas partes têm classes (i-*) que o CSS anima ao passar o mouse
 * sobre o elemento pai com a classe `anim-hover` ou quando o ícone
 * recebe a classe `playing`.
 */

/** Gera uma engrenagem com dentes trapezoidais (precisão geométrica). */
function gearPath(teeth: number, outer: number, inner: number, cx = 12, cy = 12): string {
  const step = (Math.PI * 2) / teeth;
  const wTop = step * 0.2;
  const wBase = step * 0.32;
  const pts: string[] = [];
  const p = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  for (let i = 0; i < teeth; i++) {
    const a = i * step - Math.PI / 2;
    pts.push(p(inner, a - wBase), p(outer, a - wTop), p(outer, a + wTop), p(inner, a + wBase));
  }
  return `M${pts.join('L')}Z`;
}

/** Brilho de quatro pontas com lados côncavos. */
function sparkle(cx: number, cy: number, r: number): string {
  const k = r * 0.18;
  return `M${cx} ${cy - r}Q${cx + k} ${cy - k} ${cx + r} ${cy}Q${cx + k} ${cy + k} ${cx} ${cy + r}Q${cx - k} ${cy + k} ${cx - r} ${cy}Q${cx - k} ${cy - k} ${cx} ${cy - r}Z`;
}

const GEAR = gearPath(8, 9.6, 7.4);
const dot = (cx: number, cy: number, r = 1.15) => <circle cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />;
const FOLDER = 'M3.5 7.5a2 2 0 0 1 2-2h3.8a2 2 0 0 1 1.4.6l1.6 1.6h6.2a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z';
const DOC = 'M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8Z';

const ICONS = {
  home: (
    <>
      <path d="M3.5 10.5 12 3.5l8.5 7" />
      <path d="M5.5 9v10a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5V9" />
      <path d="M10 20.5V15h4v5.5" />
    </>
  ),
  folder: <path d={FOLDER} />,
  'folder-open': (
    <>
      <path d="M4 18.5v-11a2 2 0 0 1 2-2h3.3a2 2 0 0 1 1.4.6l1.6 1.6h5.2a2 2 0 0 1 2 2v1.3" />
      <path className="i-flap" d="M4 18.5 6.4 12.3A2 2 0 0 1 8.3 11h12.2a1.2 1.2 0 0 1 1.1 1.6l-2.2 5.7a2 2 0 0 1-1.9 1.3H5.1A1.1 1.1 0 0 1 4 18.5Z" />
    </>
  ),
  'folder-plus': (
    <>
      <path d={FOLDER} />
      <path d="M12 10.8v5M9.5 13.3h5" />
    </>
  ),
  'folder-search': (
    <>
      <path d="M11 18.5H5.5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h3.8a2 2 0 0 1 1.4.6l1.6 1.6h6.2a2 2 0 0 1 2 2v1.8" />
      <circle cx="16" cy="15" r="2.8" />
      <path d="m18.1 17.1 2.4 2.4" />
    </>
  ),
  layers: (
    <>
      <path className="i-layer-top" d="M12 3.5 3.5 8 12 12.5 20.5 8Z" />
      <path d="m3.5 12 8.5 4.5 8.5-4.5" />
      <path d="m3.5 16 8.5 4.5 8.5-4.5" />
    </>
  ),
  copies: (
    <>
      <path d="M8.5 7.5V5A1.5 1.5 0 0 1 10 3.5h6.5l4 4v9A1.5 1.5 0 0 1 19 18h-2.5" />
      <rect className="i-copy-front" x="3.5" y="7.5" width="13" height="13" rx="1.6" />
      <path d="M7 12.5h6M7 15.5h6" />
    </>
  ),
  treemap: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
      <path d="M11 3.5v17M11 12h9.5M15.5 12v8.5" />
    </>
  ),
  wand: (
    <>
      <path d="m4.5 19.5 10-10" />
      <path d="m12.6 7.6 3.8 3.8" />
      <path className="i-spark" d="M18.5 3v3.6M16.7 4.8h3.6" />
      <path className="i-spark i-spark-2" d="M20.5 10.5v2.2M19.4 11.6h2.2" />
      <path className="i-spark i-spark-3" d="M10.5 3v2.2M9.4 4.1h2.2" />
    </>
  ),
  broom: (
    <>
      <g className="i-broom">
        <path d="m19.5 3.5-7 7" />
        <path d="M10.3 10.9 14 14.6l-1 4.1a1.3 1.3 0 0 1-1.6.9 9.6 9.6 0 0 1-6.9-6.9 1.3 1.3 0 0 1 .9-1.6Z" />
        <path d="m7.6 16.5 2.2-2.2M9.7 18.7l1.7-1.7" />
      </g>
      <circle className="i-dust" cx="4.2" cy="19.6" r="0.9" fill="currentColor" stroke="none" />
      <circle className="i-dust i-dust-2" cx="6.6" cy="21.2" r="0.7" fill="currentColor" stroke="none" />
    </>
  ),
  bolt: <path className="i-bolt" d="M13 2.5 4.5 13.5H11l-1 8 8.5-11H12Z" />,
  'heart-pulse': (
    <>
      <path className="i-heart" d="M12 20s-7.5-4.6-7.5-10.1A4.4 4.4 0 0 1 12 7.1a4.4 4.4 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20Z" />
      <path className="i-ecg" d="M2.5 12.5h4.3l1.6-2.8 2.4 5.6 2-3.8 1.3 1h7.4" />
    </>
  ),
  rocket: (
    <>
      <g className="i-rocket">
        <path d="M13.6 15.4 8.6 10.4c1.8-4.3 5.3-7 10.9-7.2a.6.6 0 0 1 .6.6c-.2 5.6-2.9 9.1-7.2 10.9Z" />
        <circle cx="15.6" cy="8.4" r="1.5" />
        <path d="M9.1 10.9 6 10.4l2.1-3h3.6" />
        <path d="m13.1 14.9.5 3.1 3-2.1v-3.6" />
      </g>
      <path className="i-flame" d="M6.6 15.4c-1.6.8-2.4 2.6-2.6 4.6 2-.2 3.8-1 4.6-2.6" />
    </>
  ),
  history: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5" />
      <path d="M3.5 3.8v4.7h4.7" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  settings: (
    <>
      <path className="i-gear" d={GEAR} />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  'arrow-left': (
    <>
      <path d="M19 12H5" />
      <path d="m11 6-6 6 6 6" />
    </>
  ),
  'arrow-right': (
    <>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </>
  ),
  'arrow-up': (
    <>
      <path d="M12 19V5" />
      <path d="m6 11 6-6 6 6" />
    </>
  ),
  'arrow-down': (
    <>
      <path d="M12 5v14" />
      <path d="m6 13 6 6 6-6" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11.5A8 8 0 0 0 6.3 6.3L4 8.5" />
      <path d="M4 4v4.5h4.5" />
      <path d="M4 12.5a8 8 0 0 0 13.7 5.2L20 15.5" />
      <path d="M20 20v-4.5h-4.5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.4-4.4" />
    </>
  ),
  x: <path d="M6 6l12 12M18 6 6 18" />,
  'chevron-right': <path d="m9 6 6 6-6 6" />,
  'chevron-left': <path d="m15 6-6 6 6 6" />,
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  'chevron-up': <path d="m6 15 6-6 6 6" />,
  'more-h': (
    <>
      {dot(5.5, 12, 1.4)}
      {dot(12, 12, 1.4)}
      {dot(18.5, 12, 1.4)}
    </>
  ),
  'more-v': (
    <>
      {dot(12, 5.5, 1.4)}
      {dot(12, 12, 1.4)}
      {dot(12, 18.5, 1.4)}
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  file: (
    <>
      <path d={DOC} />
      <path d="M14 3.5V8h4.5" />
    </>
  ),
  'file-text': (
    <>
      <path d={DOC} />
      <path d="M14 3.5V8h4.5" />
      <path d="M9 12.5h6M9 15.5h6M9 9.5h2" />
    </>
  ),
  'file-plus': (
    <>
      <path d={DOC} />
      <path d="M14 3.5V8h4.5" />
      <path d="M12 11.5v5M9.5 14h5" />
    </>
  ),
  scissors: (
    <>
      <circle cx="6" cy="6.5" r="2.6" />
      <circle cx="6" cy="17.5" r="2.6" />
      <path d="M20 4.5 8.1 15.7" />
      <path d="m14.4 14.2 5.6 5.3" />
      <path d="M8.1 8.3 12 12" />
    </>
  ),
  copy: (
    <>
      <rect x="8.5" y="8.5" width="12" height="12" rx="2" />
      <path d="M15.5 8.5v-3a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3" />
    </>
  ),
  paste: (
    <>
      <rect x="8" y="2.5" width="8" height="4" rx="1.2" />
      <path d="M16 4.5h1.5a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2H8" />
    </>
  ),
  pencil: (
    <>
      <path d="M4 20h4L19.3 8.7a2.1 2.1 0 0 0 0-3l-1-1a2.1 2.1 0 0 0-3 0L4 16Z" />
      <path d="m13.5 6.5 4 4" />
    </>
  ),
  trash: (
    <>
      <g className="i-lid">
        <path d="M3.5 6.5h17" />
        <path d="M9 6.5V4.8a1.3 1.3 0 0 1 1.3-1.3h3.4A1.3 1.3 0 0 1 15 4.8v1.7" />
      </g>
      <path d="M5.5 6.5 6.6 19a1.6 1.6 0 0 0 1.6 1.5h7.6a1.6 1.6 0 0 0 1.6-1.5l1.1-12.5" />
      <path d="M10 10.5v6M14 10.5v6" />
    </>
  ),
  'trash-x': (
    <>
      <g className="i-lid">
        <path d="M3.5 6.5h17" />
        <path d="M9 6.5V4.8a1.3 1.3 0 0 1 1.3-1.3h3.4A1.3 1.3 0 0 1 15 4.8v1.7" />
      </g>
      <path d="M5.5 6.5 6.6 19a1.6 1.6 0 0 0 1.6 1.5h7.6a1.6 1.6 0 0 0 1.6-1.5l1.1-12.5" />
      <path d="m10 11 4 5M14 11l-4 5" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  'eye-off': (
    <>
      <path d="M9.9 5.8A9.8 9.8 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4M6.5 7A16.8 16.8 0 0 0 2.5 12S6 18.5 12 18.5a9.2 9.2 0 0 0 4.6-1.2" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m3.5 3.5 17 17" />
    </>
  ),
  list: (
    <>
      <path d="M8.5 6.5h12M8.5 12h12M8.5 17.5h12" />
      {dot(4.5, 6.5)}
      {dot(4.5, 12)}
      {dot(4.5, 17.5)}
    </>
  ),
  grid: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
    </>
  ),
  'panel-right': (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M14.5 4.5v15" />
    </>
  ),
  'panel-left': (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M9.5 4.5v15" />
    </>
  ),
  filter: <path d="M4 5.5h16l-6.2 7.3v5.4l-3.6 1.8v-7.2Z" />,
  sort: (
    <>
      <path d="M7.5 19.5v-15M4 8l3.5-3.5L11 8" />
      <path d="M16.5 4.5v15M13 16l3.5 3.5L20 16" />
    </>
  ),
  'external-link': (
    <>
      <path d="M14 4.5h5.5V10" />
      <path d="M19.5 4.5 11 13" />
      <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </>
  ),
  pin: (
    <>
      <path d="M9 3.5h6l-1 5.5 3.5 3v2h-11v-2L10 9Z" />
      <path d="M12 14v6.5" />
    </>
  ),
  star: <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z" />,
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5" />
      {dot(12, 7.8, 1)}
    </>
  ),
  check: <path className="i-check" d="m5 12.5 4.5 4.5L19 7.5" />,
  'check-circle': (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path className="i-check" d="m8 12.3 2.8 2.8L16.2 9.6" />
    </>
  ),
  'alert-triangle': (
    <>
      <path d="M10.3 4.2 2.9 17.5a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9.5v4" />
      {dot(12, 16.8, 1)}
    </>
  ),
  'alert-circle': (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5.5" />
      {dot(12, 16.3, 1)}
    </>
  ),
  'x-circle': (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m9 9 6 6M15 9l-6 6" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v11" />
      <path d="m7 10.5 5 5 5-5" />
      <path d="M4.5 19.5h15" />
    </>
  ),
  upload: (
    <>
      <path d="M12 15V3.5" />
      <path d="m7 8 5-4.5L17 8" />
      <path d="M5 13.5v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
    </>
  ),
  import: (
    <>
      <path d="M12 3.5V15" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 13.5v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
    </>
  ),
  monitor: (
    <>
      <rect x="3" y="4" width="18" height="12.5" rx="2" />
      <path d="M8.5 20.5h7M12 16.5v4" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="9" cy="9.5" r="1.7" />
      <path d="m20.5 15.5-4.8-4.8L6 19.5" />
    </>
  ),
  music: (
    <>
      <path d="M9 18V6l11-2v12" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="17.5" cy="16" r="2.5" />
    </>
  ),
  video: (
    <>
      <rect x="3" y="5.5" width="13" height="13" rx="2" />
      <path d="m16 10.5 5-3v9l-5-3" />
    </>
  ),
  'hard-drive': (
    <>
      <rect x="3" y="12.5" width="18" height="7" rx="2" />
      <path d="M5.7 6.4 3 12.5h18l-2.7-6.1a2 2 0 0 0-1.8-1.2h-9a2 2 0 0 0-1.8 1.2Z" />
      <path d="M7 16h.01M10.5 16h.01" />
    </>
  ),
  usb: (
    <>
      <rect x="7" y="8.5" width="10" height="13" rx="2" />
      <path d="M9 8.5v-5h6v5" />
      <path d="M10.6 5.6h.01M13.4 5.6h.01" />
    </>
  ),
  cpu: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="0.8" />
      <path d="M9.5 2.5V6M14.5 2.5V6M9.5 18v3.5M14.5 18v3.5M2.5 9.5H6M2.5 14.5H6M18 9.5h3.5M18 14.5h3.5" />
    </>
  ),
  memory: (
    <>
      <rect x="2.5" y="7" width="19" height="9" rx="1.5" />
      <path d="M6.5 10v3M10 10v3M14 10v3M17.5 10v3" />
      <path d="M5 16v2.5M9 16v2.5M15 16v2.5M19 16v2.5" />
    </>
  ),
  battery: (
    <>
      <rect x="2.5" y="7" width="16.5" height="10" rx="2" />
      <path d="M21.5 10.5v3" />
      <path d="M6 10.5v3M9.5 10.5v3" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
    </>
  ),
  power: (
    <>
      <path d="M12 3v8" />
      <path d="M6.6 6.5a8 8 0 1 0 10.8 0" />
    </>
  ),
  shield: <path d="M12 3.5 5 6.2v5.3c0 4.4 3 8 7 9.5 4-1.5 7-5.1 7-9.5V6.2Z" />,
  'shield-check': (
    <>
      <path d="M12 3.5 5 6.2v5.3c0 4.4 3 8 7 9.5 4-1.5 7-5.1 7-9.5V6.2Z" />
      <path className="i-check" d="m9 12 2.2 2.2 3.8-4" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5v-3a4 4 0 0 1 8 0v3" />
    </>
  ),
  undo: (
    <>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </>
  ),
  redo: (
    <>
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
    </>
  ),
  play: <path d="M7 4.5v15l12-7.5Z" />,
  pause: (
    <>
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </>
  ),
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  sparkles: (
    <>
      <path className="i-sp1" d={sparkle(10.5, 10, 6.5)} />
      <path className="i-sp2" d={sparkle(18.5, 17.5, 3)} />
      <path className="i-sp3" d={sparkle(18.5, 4.5, 1.8)} />
    </>
  ),
  restore: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5" />
      <path d="M3.5 3.8v4.7h4.7" />
    </>
  ),
  package: (
    <>
      <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9Z" />
      <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
    </>
  ),
  'app-window': (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <path d="M3 9h18" />
      <path d="M6 6.8h.01M8.5 6.8h.01" />
    </>
  ),
  terminal: (
    <>
      <path d="m5 7 5 5-5 5" />
      <path d="M12.5 17.5H19" />
    </>
  ),
  gauge: (
    <>
      <path d="M4.2 17.5a9 9 0 1 1 15.6 0" />
      <path className="i-needle" d="m12 13.5 4-4.5" />
      <circle cx="12" cy="13.5" r="1.4" />
    </>
  ),
  activity: <path className="i-activity" d="M3 12h4l2.5-7 5 14 2.5-7h4" />,
  'trending-down': (
    <>
      <path d="m3 7 6 6 4-4 8 8" />
      <path d="M15 17h6v-6" />
    </>
  ),
  'trending-up': (
    <>
      <path d="m3 17 6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />,
  palette: (
    <>
      <path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.2 0 1.9-.9 1.9-1.9 0-.5-.2-.9-.5-1.3-.3-.3-.5-.8-.5-1.2 0-1 .8-1.9 1.9-1.9h2.2a4.5 4.5 0 0 0 4.5-4.5c0-3.6-4.3-6.2-9.5-6.2Z" />
      {dot(7.5, 11.5, 1.2)}
      {dot(9.5, 7.6, 1.2)}
      {dot(14, 7, 1.2)}
      {dot(17, 10, 1.2)}
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8" />
    </>
  ),
  tag: (
    <>
      <path d="M3.5 12.2V5A1.5 1.5 0 0 1 5 3.5h7.2l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-6.9 6.9a1.5 1.5 0 0 1-2.1 0Z" />
      <circle cx="8" cy="8" r="1.4" />
    </>
  ),
  'win-minimize': <path d="M5 12h14" />,
  'win-maximize': <rect x="5.5" y="5.5" width="13" height="13" rx="1.6" />,
  'win-restore': (
    <>
      <rect x="5" y="8" width="11" height="11" rx="1.6" />
      <path d="M8 8V6.6A1.6 1.6 0 0 1 9.6 5h7.8A1.6 1.6 0 0 1 19 6.6v7.8a1.6 1.6 0 0 1-1.6 1.6H16" />
    </>
  ),
  'win-close': <path d="M6 6l12 12M18 6 6 18" />,
  command: <path d="M15 6a3 3 0 1 1 3 3H6a3 3 0 1 1 3-3v12a3 3 0 1 1-3-3h12a3 3 0 1 1-3 3Z" />,
  menu: <path d="M4 6.5h16M4 12h16M4 17.5h16" />,
  'chart-bar': (
    <>
      <path d="M4 20.5h16" />
      <path d="M7 16.5v-5M12 16.5v-10M17 16.5v-8" />
    </>
  ),
  disc: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="2" />
      <path className="i-disc-arc" d="M12 6.5a5.5 5.5 0 0 1 5.5 5.5" />
    </>
  ),
  scan: (
    <>
      <path d="M3.5 8V6A2.5 2.5 0 0 1 6 3.5h2M16 3.5h2A2.5 2.5 0 0 1 20.5 6v2M20.5 16v2a2.5 2.5 0 0 1-2.5 2.5h-2M8 20.5H6A2.5 2.5 0 0 1 3.5 18v-2" />
      <path className="i-scanline" d="M7 12h10" />
    </>
  ),
  archive: (
    <>
      <rect x="3" y="4" width="18" height="5" rx="1.2" />
      <path d="M5 9v9.5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9" />
      <path d="M10 13h4" />
    </>
  ),
  code: <path d="m8 7-5 5 5 5M16 7l5 5-5 5" />,
  'select-all': (
    <>
      <path d="M5 3.5h-.5a1 1 0 0 0-1 1V5M9 3.5h2M15 3.5h2M19 3.5h.5a1 1 0 0 1 1 1V5M20.5 9v2M20.5 15v2M20.5 19v.5a1 1 0 0 1-1 1H19M15 20.5h-2M9 20.5H7M5 20.5h-.5a1 1 0 0 1-1-1V19M3.5 15v-2M3.5 9V7" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </>
  ),
  inbox: (
    <>
      <path d="M3.5 13.5h5l1.5 2.5h4l1.5-2.5h5" />
      <path d="M5.9 5.6 3.5 13.5V18a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-4.5l-2.4-7.9a2 2 0 0 0-1.9-1.4H7.8a2 2 0 0 0-1.9 1.4Z" />
    </>
  ),
  thermometer: (
    <>
      <path d="M14.5 13.8V5a2.5 2.5 0 0 0-5 0v8.8a4.5 4.5 0 1 0 5 0Z" />
      <path d="M12 9v7" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5a13 13 0 0 1 0 17M12 3.5a13 13 0 0 0 0 17" />
    </>
  ),
  'wifi-off': (
    <>
      <path d="M8.8 6.2A15.4 15.4 0 0 1 21.5 9M2.5 9a15.5 15.5 0 0 1 3.3-2.2M5.5 12.6a10.5 10.5 0 0 1 4-2.3M14.2 10.5a10.4 10.4 0 0 1 4.3 2.1M8.7 16a5 5 0 0 1 6.6 0" />
      {dot(12, 19.3, 1)}
      <path d="m3.5 3.5 17 17" />
    </>
  ),
  keyboard: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <path d="M6 10h.01M9.3 10h.01M12.6 10h.01M16 10h.01M18 10h.01M6.5 14h11" />
    </>
  ),
  'arrow-up-down': (
    <>
      <path d="m8 4.5-3.5 3.5M8 4.5 11.5 8M8 4.5V19.5" />
      <path d="m16 19.5-3.5-3.5M16 19.5l3.5-3.5M16 19.5V4.5" />
    </>
  ),
  type: (
    <>
      <path d="M5 7V5h14v2" />
      <path d="M12 5v14M9.5 19h5" />
    </>
  ),
  ruler: (
    <>
      <path d="M3.6 15.6 15.6 3.6a1.4 1.4 0 0 1 2 0l2.8 2.8a1.4 1.4 0 0 1 0 2L8.4 20.4a1.4 1.4 0 0 1-2 0l-2.8-2.8a1.4 1.4 0 0 1 0-2Z" />
      <path d="m7.5 11.7 2 2M10.5 8.7l2 2M13.5 5.7l2 2" />
    </>
  ),
  smile: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" />
      {dot(9, 10, 1)}
      {dot(15, 10, 1)}
    </>
  ),
  frown: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 16.5a4.5 4.5 0 0 1 7 0" />
      {dot(9, 10, 1)}
      {dot(15, 10, 1)}
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof ICONS;

export interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

export function Icon({ name, size = 18, strokeWidth = 1.75, className, style, title }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ? `icon icon-${name} ${className}` : `icon icon-${name}`}
      style={style}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      {ICONS[name]}
    </svg>
  );
}

export { sparkle as sparklePath };
