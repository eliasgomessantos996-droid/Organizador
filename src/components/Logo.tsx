import { useId } from 'react';

interface LogoProps {
  size?: number;
  /** Anima a entrada (pasta sobe, barras se organizam, brilho aparece). */
  animated?: boolean;
  /** Mantém o brilho cintilando. */
  twinkle?: boolean;
  className?: string;
}

/**
 * Marca do Organizador: bloco com gradiente turquesa→índigo, pasta com
 * barras em ordem decrescente (organização) e brilho de quatro pontas (limpeza).
 */
export function Logo({ size = 32, animated = false, twinkle = false, className }: LogoProps) {
  const id = useId().replace(/:/g, '');
  const tile = `lg-tile-${id}`;
  const shine = `lg-shine-${id}`;
  const shadow = `lg-shadow-${id}`;
  const cls = ['logo', animated ? 'logo-animated' : '', twinkle ? 'logo-twinkle' : '', className ?? ''].join(' ').trim();
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" className={cls} role="img" aria-label="Organizador">
      <defs>
        <linearGradient id={tile} gradientUnits="userSpaceOnUse" x1="24" y1="24" x2="488" y2="488">
          <stop offset="0" stopColor="#2DD4BF" />
          <stop offset="0.38" stopColor="#14A8B8" />
          <stop offset="1" stopColor="#6366F1" />
        </linearGradient>
        <radialGradient id={shine} cx="0.22" cy="0.12" r="0.85">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.38" />
          <stop offset="0.55" stopColor="#FFFFFF" stopOpacity="0.06" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <filter id={shadow} x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="8" stdDeviation="10" floodColor="#0B1B3F" floodOpacity="0.22" />
        </filter>
      </defs>
      <g className="lg-tile">
        <rect x="24" y="24" width="464" height="464" rx="112" fill={`url(#${tile})`} />
        <rect x="24" y="24" width="464" height="464" rx="112" fill={`url(#${shine})`} />
      </g>
      <g className="lg-folder" filter={size >= 40 ? `url(#${shadow})` : undefined}>
        <path
          fill="#FFFFFF"
          fillOpacity="0.55"
          d="M128 180a36 36 0 0 1 36-36h58a32 32 0 0 1 22.6 9.4l20 20a16 16 0 0 0 11.3 4.7H348a36 36 0 0 1 36 36v150a36 36 0 0 1-36 36H164a36 36 0 0 1-36-36Z"
        />
        <rect x="128" y="206" width="256" height="194" rx="36" fill="#FFFFFF" />
      </g>
      <rect className="lg-bar lg-bar-1" x="168" y="250" width="148" height="22" rx="11" fill={`url(#${tile})`} />
      <rect className="lg-bar lg-bar-2" x="168" y="290" width="110" height="22" rx="11" fill={`url(#${tile})`} fillOpacity="0.85" />
      <rect className="lg-bar lg-bar-3" x="168" y="330" width="72" height="22" rx="11" fill={`url(#${tile})`} fillOpacity="0.7" />
      <path className="lg-spark lg-spark-1" fill="#FFFFFF" d="M388 80Q396 116 432 124Q396 132 388 168Q380 132 344 124Q380 116 388 80Z" />
      <path className="lg-spark lg-spark-2" fill="#FFFFFF" fillOpacity="0.9" d="M440 176Q443 189 456 192Q443 195 440 208Q437 195 424 192Q437 189 440 176Z" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return <span className={`wordmark ${className ?? ''}`}>Organizador</span>;
}
